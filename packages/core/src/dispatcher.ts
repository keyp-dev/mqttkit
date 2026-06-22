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
import type { TopicRoute, ValidateMode } from './router.js'
import {
  SchemaValidationError,
  decodePayloadForSchema,
  runSchema,
  type StandardSchemaV1,
} from './standard-schema.js'

const SENTINEL_HANDLED: unique symbol = Symbol('mqttkit.error-handled')

export type DispatcherOptions<TState extends MqttAppState = MqttAppState> = {
  routes: TopicRoute<TState>[]
  middleware: MqttMiddleware<TState>[]
  createContext(input: ContextFactoryInput<TState>): MqttContext<TState>
  appErrorHandlers: MqttErrorHandler<TState>[]
  /** Optional RPC interceptor; returns true if the message was consumed. */
  interceptRpc?(message: BrokerMessage<TState['principal']>): boolean
}

export class Dispatcher<TState extends MqttAppState = MqttAppState> {
  constructor(private readonly options: DispatcherOptions<TState>) {}

  async dispatch(message: BrokerMessage<TState['principal']>): Promise<boolean> {
    if (this.options.interceptRpc?.(message)) return true

    for (const route of this.options.routes) {
      const params = route.compiled.match(message.topic)
      if (!params) continue

      const allowed = await this.evaluateWithErrorHook(
        () => evaluatePolicy(route.publish, {
          topic: message.topic,
          params,
          clientId: message.clientId,
          principal: message.principal,
          route: { pattern: route.pattern, meta: route.meta },
          packet: message.packet,
        }),
        { topic: message.topic, phase: 'policy', route, params },
      )

      if (!allowed) return false
      if (!route.onMessage) return true

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
              route: { pattern: route.pattern, meta: route.meta },
            },
            route,
          )
          if (!consumed && error instanceof SchemaValidationError) {
            console.warn(`[mqttkit] ${error.message}`)
          }
          return false
        }
      } else {
        body = decodePayloadForSchema(message.payload)
      }

      const ctx = this.options.createContext({ message, route, params })
      ;(ctx as { body: unknown }).body = body

      const ran = await this.evaluateWithErrorHook(
        async () => {
          await runPipeline(ctx, [...this.options.middleware, ...route.middleware], async () => {
            await route.onMessage?.(ctx)
          })
          return true
        },
        { topic: message.topic, phase: 'handler', route, params, ctx },
      )
      if (ran === SENTINEL_HANDLED) return false
      return true
    }

    return false
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
      ctx?: MqttContext<TState>
    },
  ): Promise<T | typeof SENTINEL_HANDLED> {
    try {
      return await fn()
    } catch (error) {
      const consumed = await this.handleError(
        {
          error,
          topic: info.topic,
          phase: info.phase,
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
    for (const route of this.options.routes) {
      const params = route.compiled.matchSubscription(input.topic)
      if (!params) continue

      const allowed = await evaluatePolicy(route.subscribe, {
        topic: input.topic,
        params,
        clientId: input.clientId,
        principal: input.principal,
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
