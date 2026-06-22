import type { BrokerMessage, SubscribeCheckInput, SubscribeCheckResult } from './broker.js'
import type {
  ContextFactoryInput,
  MqttAppState,
  MqttContext,
  MqttErrorHandler,
  MqttErrorPayload,
  MqttErrorPhase,
  MqttMiddleware,
  MqttPolicyInput,
} from './context.js'
import { parseSharedSubscription } from './matcher.js'
import type { MqttMetricEvent, MqttMetricHandler } from './metrics.js'
import type { TopicRoute, ValidateMode } from './router.js'
import {
  SchemaValidationError,
  decodePayloadForSchema,
  runSchema,
  type StandardSchemaV1,
} from './standard-schema.js'

const SENTINEL_HANDLED: unique symbol = Symbol('mqttkit.error-handled')

export class HandlerTimeoutError extends Error {
  readonly timeoutMs: number
  constructor(topic: string, timeoutMs: number) {
    super(`Handler for topic "${topic}" exceeded ${timeoutMs}ms`)
    this.name = 'HandlerTimeoutError'
    this.timeoutMs = timeoutMs
  }
}

export class HandlerOverloadError extends Error {
  readonly concurrency: number
  readonly inflight: number
  constructor(topic: string, concurrency: number, inflight: number) {
    super(`Handler for topic "${topic}" rejected: ${inflight} in-flight, limit ${concurrency}`)
    this.name = 'HandlerOverloadError'
    this.concurrency = concurrency
    this.inflight = inflight
  }
}

export type DispatcherOptions<TState extends MqttAppState = MqttAppState> = {
  routes: TopicRoute<TState>[]
  middleware: MqttMiddleware<TState>[]
  createContext(input: ContextFactoryInput<TState>): MqttContext<TState>
  appErrorHandlers: MqttErrorHandler<TState>[]
  metricHandlers: MqttMetricHandler[]
  /** Optional RPC interceptor; returns true if the message was consumed. */
  interceptRpc?(message: BrokerMessage<TState['principal']>): boolean
}

export class Dispatcher<TState extends MqttAppState = MqttAppState> {
  private _closing = false
  constructor(private readonly options: DispatcherOptions<TState>) {}

  get closing(): boolean {
    return this._closing
  }

  setClosing(value: boolean): void {
    this._closing = value
  }

  /** Sum of inflight handlers across every route. */
  activeCount(): number {
    let total = 0
    for (const route of this.options.routes) total += route.inflight
    return total
  }

  /**
   * Resolve `true` once `activeCount()` hits 0. Resolve `false` if `timeoutMs`
   * elapses first. Polls every 25 ms with an unref'd timer so this never blocks
   * process exit on its own.
   */
  drain(timeoutMs?: number): Promise<boolean> {
    if (this.activeCount() === 0) return Promise.resolve(true)
    return new Promise((resolve) => {
      const start = Date.now()
      const tick = () => {
        if (this.activeCount() === 0) return resolve(true)
        if (timeoutMs !== undefined && Date.now() - start >= timeoutMs) return resolve(false)
        setTimeout(tick, 25).unref()
      }
      tick()
    })
  }

  async dispatch(message: BrokerMessage<TState['principal']>): Promise<boolean> {
    if (this.options.interceptRpc?.(message)) return true
    // Once closing, refuse new inbound dispatches so drain() can complete.
    // Already-running handlers are tracked via route.inflight and finish naturally.
    if (this._closing) return false

    const startNs = now()
    let matchedRoute: TopicRoute<TState> | undefined
    let result: 'ok' | 'rejected' | 'error' = 'rejected'
    let errorPhase: MqttErrorPhase | undefined

    try {
      for (const route of this.options.routes) {
        const params = route.compiled.match(message.topic)
        if (!params) continue
        matchedRoute = route

        let allowed: boolean | typeof SENTINEL_HANDLED
        try {
          allowed = await this.evaluateWithErrorHook(
            () => evaluatePolicy(route.publish, {
              topic: message.topic,
              params,
              clientId: message.clientId,
              principal: message.principal,
              route: { pattern: route.pattern, meta: route.meta },
              packet: message.packet,
            }),
            { topic: message.topic, phase: 'policy', route, params, payload: message.payload },
          )
        } catch (err) {
          result = 'error'
          errorPhase = 'policy'
          throw err
        }
        if (allowed === SENTINEL_HANDLED) { result = 'error'; errorPhase = 'policy'; return false }
        if (!allowed) { result = 'rejected'; return false }
        if (!route.onMessage) { result = 'ok'; return true }

        let body: unknown
        if (shouldValidate(route.validate, 'inbound') && route.schema) {
          try {
            body = await validatePayload(route.schema, message.payload, message.topic)
          } catch (error) {
            // Schema validation failures are *expected* (clients send bad data),
            // so they're always consumed: routed through onError if registered,
            // otherwise logged. dispatch returns false regardless.
            const consumed = await this.handleError(
              {
                error,
                topic: message.topic,
                phase: 'validation',
                payload: message.payload,
                route: { pattern: route.pattern, meta: route.meta },
              },
              route,
            )
            if (!consumed && error instanceof SchemaValidationError) {
              console.warn(`[mqttkit] ${error.message}`)
            }
            result = 'error'
            errorPhase = 'validation'
            return false
          }
        } else {
          body = decodePayloadForSchema(message.payload)
        }

        const ctx = this.options.createContext({ message, route, params })
        ;(ctx as { body: unknown }).body = body

        // Concurrency gate: drop early before allocating timers / running middleware.
        if (route.concurrency !== undefined && route.inflight >= route.concurrency) {
          const error = new HandlerOverloadError(message.topic, route.concurrency, route.inflight)
          const consumed = await this.handleError(
            {
              error,
              topic: message.topic,
              phase: 'overload',
              payload: message.payload,
              route: { pattern: route.pattern, meta: route.meta },
              ctx,
            },
            route,
          )
          result = 'error'
          errorPhase = 'overload'
          if (consumed) return false
          throw error
        }

        route.inflight += 1
        let timedOut = false
        try {
          const ran = await this.evaluateWithErrorHook(
            () => withTimeout(
              message.topic,
              route.timeout,
              (async () => {
                await runPipeline(ctx, [...this.options.middleware, ...route.middleware], async () => {
                  await route.onMessage?.(ctx)
                })
                return true as const
              })(),
            ).catch((err) => {
              if (err instanceof HandlerTimeoutError) timedOut = true
              throw err
            }),
            { topic: message.topic, phase: 'handler', route, params, payload: message.payload, ctx },
          )
          if (ran === SENTINEL_HANDLED) {
            result = 'error'
            errorPhase = timedOut ? 'timeout' : 'handler'
            return false
          }
          result = 'ok'
          return true
        } catch (err) {
          result = 'error'
          errorPhase = timedOut || err instanceof HandlerTimeoutError ? 'timeout' : 'handler'
          throw err
        } finally {
          route.inflight -= 1
        }
      }

      return false
    } finally {
      await this.emitMetric({
        type: 'dispatch',
        topic: message.topic,
        route: matchedRoute ? { pattern: matchedRoute.pattern, meta: matchedRoute.meta } : undefined,
        durationMs: msSince(startNs),
        result,
        errorPhase,
      })
    }
  }

  async emitMetric(event: MqttMetricEvent): Promise<void> {
    for (const handler of this.options.metricHandlers) {
      try {
        await handler(event)
      } catch (chainError) {
        console.error('[mqttkit] metric handler threw:', chainError)
      }
    }
  }

  /**
   * Run `fn`. On throw, route the error through the onError chain. If at
   * least one handler exists the error is considered consumed and `SENTINEL_HANDLED`
   * is returned; otherwise rethrow so the broker adapter sees the failure.
   */
  private async evaluateWithErrorHook<T>(
    fn: () => Promise<T> | T,
    info: {
      topic: string
      phase: MqttErrorPhase
      route: TopicRoute<TState>
      params: Record<string, string>
      payload?: Buffer
      ctx?: MqttContext<TState>
    },
  ): Promise<T | typeof SENTINEL_HANDLED> {
    try {
      return await fn()
    } catch (error) {
      // HandlerTimeoutError reroutes from 'handler' to 'timeout' so users can
      // distinguish "code threw" from "code stuck" in their onError chain.
      const effectivePhase: MqttErrorPhase = error instanceof HandlerTimeoutError ? 'timeout' : info.phase
      const consumed = await this.handleError(
        {
          error,
          topic: info.topic,
          phase: effectivePhase,
          payload: info.payload,
          route: { pattern: info.route.pattern, meta: info.route.meta },
          ctx: info.ctx,
        },
        info.route,
      )
      if (consumed) return SENTINEL_HANDLED
      throw error
    }
  }

  async canSubscribe(input: SubscribeCheckInput<TState['principal']>): Promise<SubscribeCheckResult> {
    const shared = parseSharedSubscription(input.topic)
    const actualTopic = shared ? shared.topic : input.topic

    for (const route of this.options.routes) {
      const params = route.compiled.matchSubscription(actualTopic)
      if (!params) continue

      const allowed = await evaluatePolicy(route.subscribe, {
        topic: actualTopic,
        params,
        clientId: input.clientId,
        principal: input.principal,
        shared: shared ? { group: shared.group } : undefined,
        route: { pattern: route.pattern, meta: route.meta },
        packet: input.packet,
      })

      return { allowed, params }
    }

    return { allowed: false, reason: 'No matching subscribable topic route' }
  }

  /**
   * Find the first route that matches `topic` and has a runtime schema
   * configured with outbound validation. Used by app.publish() to validate
   * server-side outbound messages against the topic's schema.
   */
  findOutboundRoute(topic: string): TopicRoute<TState> | undefined {
    for (const route of this.options.routes) {
      if (!route.schema) continue
      if (!shouldValidate(route.validate, 'outbound')) continue
      if (route.compiled.match(topic)) return route
    }
    return undefined
  }

  async reportError(payload: MqttErrorPayload<TState>, route?: TopicRoute<TState>): Promise<boolean> {
    return this.handleError(payload, route)
  }

  /**
   * @returns true when at least one handler ran (the error is considered
   *   consumed). false when no handler was registered — the caller should
   *   rethrow so the broker adapter can decide what to do.
   */
  private async handleError(
    payload: MqttErrorPayload<TState>,
    route?: TopicRoute<TState>,
  ): Promise<boolean> {
    const handlers: MqttErrorHandler<TState>[] = []
    if (route?.onError) handlers.push(route.onError)
    handlers.push(...this.options.appErrorHandlers)

    if (handlers.length === 0) return false

    for (const handler of handlers) {
      try {
        await handler(payload)
      } catch (chainError) {
        console.error('[mqttkit] error handler threw:', chainError)
      }
    }
    return true
  }
}

async function evaluatePolicy<TState extends MqttAppState>(
  policy: TopicRoute<TState>['publish'],
  input: MqttPolicyInput<TState['principal']>,
): Promise<boolean> {
  if (typeof policy === 'function') return policy(input)
  return policy
}

async function runPipeline<TState extends MqttAppState>(
  ctx: MqttContext<TState>,
  middleware: MqttMiddleware<TState>[],
  handler: () => Promise<void>,
): Promise<void> {
  let index = -1

  async function dispatch(current: number): Promise<void> {
    if (current <= index) throw new Error('middleware next() called multiple times')
    index = current

    const item = middleware[current]
    if (!item) {
      await handler()
      return
    }

    await item(ctx, () => dispatch(current + 1))
  }

  await dispatch(0)
}

function now(): bigint {
  return process.hrtime.bigint()
}

function msSince(start: bigint): number {
  return Number(process.hrtime.bigint() - start) / 1_000_000
}

function withTimeout<T>(topic: string, timeoutMs: number | undefined, promise: Promise<T>): Promise<T> {
  if (timeoutMs === undefined || timeoutMs <= 0) return promise
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new HandlerTimeoutError(topic, timeoutMs)), timeoutMs)
    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (error) => { clearTimeout(timer); reject(error) },
    )
  })
}

export function shouldValidate(mode: ValidateMode, direction: 'inbound' | 'outbound'): boolean {
  if (mode === false) return false
  if (mode === 'both') return true
  return mode === direction
}

export async function validatePayload(
  schema: StandardSchemaV1,
  payload: Buffer,
  topic: string,
): Promise<unknown> {
  const decoded = decodePayloadForSchema(payload)
  const result = await runSchema(schema, decoded)
  if (result.issues) throw new SchemaValidationError(result.issues, topic)
  return result.value
}

export type { MqttErrorPhase }
