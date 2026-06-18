import type { MqttAppState, MqttHandler, MqttMiddleware, MqttTopicPolicy } from './context.js'
import { compileTopicPattern, joinTopic } from './matcher.js'
import type { MqttPlugin } from './plugin.js'

export type TopicConfig<TState extends MqttAppState = MqttAppState> = {
  publish?: MqttTopicPolicy<TState['principal']>
  subscribe?: MqttTopicPolicy<TState['principal']>
  onMessage?: MqttHandler<TState>
  qos?: 0 | 1 | 2
  retain?: boolean
  schema?: unknown
  meta?: unknown
}

export type TopicRoute<TState extends MqttAppState = MqttAppState> = {
  pattern: string
  compiled: ReturnType<typeof compileTopicPattern>
  publish: MqttTopicPolicy<TState['principal']>
  subscribe: MqttTopicPolicy<TState['principal']>
  onMessage?: MqttHandler<TState>
  middleware: MqttMiddleware<TState>[]
  config: TopicConfig<TState>
  meta?: unknown
}

export type RouterOptions = {
  prefix?: string
  meta?: unknown
}

export class MqttRouter<TState extends MqttAppState = MqttAppState> implements MqttPlugin<TState> {
  readonly name = 'router'
  readonly routes: TopicRoute<TState>[] = []
  private readonly middleware: MqttMiddleware<TState>[] = []

  constructor(private readonly options: RouterOptions = {}) {}

  use(router: MqttRouter<TState>): this
  use(middleware: MqttMiddleware<TState>): this
  use(routerOrMiddleware: MqttRouter<TState> | MqttMiddleware<TState>): this {
    if (typeof routerOrMiddleware === 'function') {
      this.middleware.push(routerOrMiddleware)
      return this
    }

    for (const route of routerOrMiddleware.routes) {
      this.addRoute(route.pattern, route.config, route.middleware)
    }

    return this
  }

  topic(pattern: string, config: TopicConfig<TState> = {}): this {
    this.addRoute(pattern, config)
    return this
  }

  setup(app: { addRoute(route: TopicRoute<TState>): void }): void {
    for (const route of this.routes) {
      app.addRoute(route)
    }
  }

  private addRoute(
    pattern: string,
    config: TopicConfig<TState>,
    inheritedMiddleware: MqttMiddleware<TState>[] = [],
  ): void {
    const fullPattern = joinTopic(this.options.prefix, pattern)
    const publish = config.publish ?? Boolean(config.onMessage)
    const subscribe = config.subscribe ?? !config.onMessage

    this.routes.push({
      pattern: fullPattern,
      compiled: compileTopicPattern(fullPattern),
      publish,
      subscribe,
      onMessage: config.onMessage,
      middleware: [...this.middleware, ...inheritedMiddleware],
      config,
      meta: config.meta ?? this.options.meta,
    })
  }
}

export function router<TState extends MqttAppState = MqttAppState>(
  options?: RouterOptions,
): MqttRouter<TState> {
  return new MqttRouter<TState>(options)
}
