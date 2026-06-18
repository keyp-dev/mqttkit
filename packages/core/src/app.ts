import type {
  BrokerMessage,
  MqttBrokerAdapter,
  MqttPayload,
  PublishOptions,
  SubscribeCheckInput,
  SubscribeCheckResult,
} from './broker.js'
import type { ContextFactoryInput, MqttAppState, MqttMiddleware } from './context.js'
import { Dispatcher } from './dispatcher.js'
import type { MqttEvent, MqttEventHandler, MqttEventName } from './events.js'
import type { MqttPlugin } from './plugin.js'
import type { TopicRoute } from './router.js'

export type ListenOptions = Record<string, unknown>

export class MqttApp<TState extends MqttAppState = MqttAppState> {
  private readonly routes: TopicRoute<TState>[] = []
  private readonly middleware: MqttMiddleware<TState>[] = []
  private readonly setupTasks: Array<void | Promise<void>> = []
  private readonly startHooks: Array<() => void | Promise<void>> = []
  private readonly stopHooks: Array<() => void | Promise<void>> = []
  private readonly eventHandlers = new Map<MqttEventName, MqttEventHandler<TState['principal']>[]>()
  private readonly services: Record<string, unknown> = {}
  private brokerAdapter?: MqttBrokerAdapter<TState['principal']>
  private dispatcher?: Dispatcher<TState>
  private readyPromise?: Promise<void>

  use(plugin: MqttPlugin<TState>): this
  use(middleware: MqttMiddleware<TState>): this
  use(pluginOrMiddleware: MqttPlugin<TState> | MqttMiddleware<TState>): this {
    if (typeof pluginOrMiddleware === 'function') {
      this.middleware.push(pluginOrMiddleware)
      return this
    }

    this.setupTasks.push(pluginOrMiddleware.setup(this))
    return this
  }

  addRoute(route: TopicRoute<TState>): void {
    this.routes.push(route)
  }

  broker(adapter: MqttBrokerAdapter<TState['principal']>): this {
    this.brokerAdapter = adapter
    return this
  }

  decorate<TKey extends string, TValue>(
    key: TKey,
    value: TValue,
  ): MqttApp<TState & { services: NonNullable<TState['services']> & Record<TKey, TValue> }> {
    this.services[key] = value
    return this as unknown as MqttApp<TState & { services: NonNullable<TState['services']> & Record<TKey, TValue> }>
  }

  on(eventName: MqttEventName, handler: MqttEventHandler<TState['principal']>): this {
    const handlers = this.eventHandlers.get(eventName) ?? []
    handlers.push(handler)
    this.eventHandlers.set(eventName, handlers)
    return this
  }

  onStart(hook: () => void | Promise<void>): this {
    this.startHooks.push(hook)
    return this
  }

  onStop(hook: () => void | Promise<void>): this {
    this.stopHooks.push(hook)
    return this
  }

  async emit(eventName: MqttEventName, event: MqttEvent<TState['principal']>): Promise<void> {
    for (const handler of this.eventHandlers.get(eventName) ?? []) {
      await handler(event)
    }
  }

  async ready(): Promise<this> {
    this.readyPromise ??= this.initialize()
    await this.readyPromise
    return this
  }

  async listen(options: ListenOptions = {}): Promise<void> {
    await this.ready()
    const broker = this.requireBroker()

    await broker.start({
      listen: options,
      dispatch: (message) => this.dispatch(message),
      canSubscribe: (input) => this.canSubscribe(input),
      emit: async (eventName, event) => {
        await this.emit(eventName as MqttEventName, event as MqttEvent<TState['principal']>)
      },
    })

    for (const hook of this.startHooks) {
      await hook()
    }
  }

  async stop(): Promise<void> {
    for (const hook of [...this.stopHooks].reverse()) {
      await hook()
    }

    if (this.brokerAdapter) await this.brokerAdapter.stop()
  }

  async publish(topic: string, payload: MqttPayload, options?: PublishOptions): Promise<void> {
    await this.ready()
    await this.requireBroker().publish(topic, payload, options)
  }

  async dispatch(message: BrokerMessage<TState['principal']>): Promise<boolean> {
    await this.ready()
    return this.requireDispatcher().dispatch(message)
  }

  async canSubscribe(input: SubscribeCheckInput<TState['principal']>): Promise<SubscribeCheckResult> {
    await this.ready()
    return this.requireDispatcher().canSubscribe(input)
  }

  getRoutes(): readonly TopicRoute<TState>[] {
    return this.routes
  }

  private async initialize(): Promise<void> {
    await Promise.all(this.setupTasks)
    this.dispatcher = new Dispatcher<TState>({
      routes: this.routes,
      middleware: this.middleware,
      createContext: (input) => this.createContext(input),
    })
  }

  private createContext(input: ContextFactoryInput<TState>) {
    const { message, route, params } = input

    return {
      app: this,
      topic: message.topic,
      params,
      payload: message.payload,
      clientId: message.clientId,
      principal: message.principal as TState['principal'],
      services: this.services as NonNullable<TState['services']>,
      packet: message.packet,
      route: {
        pattern: route.pattern,
        meta: route.meta,
      },
      publish: async (topic: string, payload: MqttPayload, options?: PublishOptions) => {
        await this.publish(topic, payload, options)
      },
    }
  }

  private requireDispatcher(): Dispatcher<TState> {
    if (!this.dispatcher) throw new Error('MqttApp runtime is not initialized')
    return this.dispatcher
  }

  private requireBroker(): MqttBrokerAdapter<TState['principal']> {
    if (!this.brokerAdapter) throw new Error('MqttApp requires a broker adapter before listen() or publish()')
    return this.brokerAdapter
  }
}
