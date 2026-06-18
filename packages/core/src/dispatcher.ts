import type { BrokerMessage, SubscribeCheckInput, SubscribeCheckResult } from './broker.js'
import type { ContextFactoryInput, MqttAppState, MqttContext, MqttMiddleware, MqttPolicyInput } from './context.js'
import type { TopicRoute } from './router.js'

export type DispatcherOptions<TState extends MqttAppState = MqttAppState> = {
  routes: TopicRoute<TState>[]
  middleware: MqttMiddleware<TState>[]
  createContext(input: ContextFactoryInput<TState>): MqttContext<TState>
}

export class Dispatcher<TState extends MqttAppState = MqttAppState> {
  constructor(private readonly options: DispatcherOptions<TState>) {}

  async dispatch(message: BrokerMessage<TState['principal']>): Promise<boolean> {
    for (const route of this.options.routes) {
      const params = route.compiled.match(message.topic)
      if (!params) continue

      const allowed = await evaluatePolicy(route.publish, {
        topic: message.topic,
        params,
        clientId: message.clientId,
        principal: message.principal,
        route: { pattern: route.pattern, meta: route.meta },
        packet: message.packet,
      })

      if (!allowed) return false
      if (!route.onMessage) return true

      const ctx = this.options.createContext({ message, route, params })

      await runPipeline(ctx, [...this.options.middleware, ...route.middleware], async () => {
        await route.onMessage?.(ctx)
      })

      return true
    }

    return false
  }

  async canSubscribe(input: SubscribeCheckInput<TState['principal']>): Promise<SubscribeCheckResult> {
    for (const route of this.options.routes) {
      const params = route.compiled.match(input.topic)
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
