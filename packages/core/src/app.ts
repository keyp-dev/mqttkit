import type {
  BrokerMessage,
  MqttBrokerAdapter,
  MqttPayload,
  PublishOptions,
  SubscribeCheckInput,
  SubscribeCheckResult,
} from './broker.js'
import type {
  ContextFactoryInput,
  MqttAppState,
  MqttErrorHandler,
  MqttMiddleware,
} from './context.js'
import { Dispatcher, validatePayload } from './dispatcher.js'
import type { MqttEvent, MqttEventHandler, MqttEventName } from './events.js'
import { toPayloadBuffer } from './payload.js'
import type { MqttPlugin } from './plugin.js'
import { RpcManager, readPacketProperties, type RpcRequestOptions, type RpcResponse } from './rpc.js'
import type { TopicRoute } from './router.js'
import { isStandardSchema, type SchemaProvider, wrapSchemaProvider } from './standard-schema.js'

export type ListenOptions = Record<string, unknown>

export class MqttApp<TState extends MqttAppState = MqttAppState> {
  private readonly routes: TopicRoute<TState>[] = []
  private readonly middleware: MqttMiddleware<TState>[] = []
  private readonly setupTasks: Array<void | Promise<void>> = []
  private readonly startHooks: Array<() => void | Promise<void>> = []
  private readonly stopHooks: Array<() => void | Promise<void>> = []
  private readonly eventHandlers = new Map<MqttEventName, MqttEventHandler<TState['principal']>[]>()
  private readonly errorHandlers: MqttErrorHandler<TState>[] = []
  private readonly services: Record<string, unknown> = {}
  private readonly rpc = new RpcManager()
  private readonly schemaProviders: SchemaProvider[] = []
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

  /** Register a global error handler. Runs after any matching route-level `onError`. */
  onError(handler: MqttErrorHandler<TState>): this {
    this.errorHandlers.push(handler)
    return this
  }

  /**
   * Register a schema provider so that raw schemas of a non-Standard-Schema
   * library (e.g. raw typebox `TSchema` objects) are recognized at app init.
   *
   * Providers are only consulted for routes whose `schema` does NOT already
   * implement the Standard Schema interface — Standard Schema is always
   * checked first.
   */
  addSchemaProvider(provider: SchemaProvider): this {
    this.schemaProviders.push(provider)
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

    this.rpc.cancelAll('MqttApp is stopping')
    if (this.brokerAdapter) await this.brokerAdapter.stop()
  }

  /**
   * Send a request and await the response via MQTT 5 responseTopic + correlationData.
   *
   * Requires the broker adapter to forward inbound publishes to the runtime
   * (the bundled aedes adapter does this through `authorizePublish`). The
   * device should publish its reply to `properties.responseTopic` and echo
   * back `properties.correlationData`.
   */
  async request(
    topic: string,
    payload: MqttPayload,
    options: RpcRequestOptions = {},
  ): Promise<RpcResponse> {
    await this.ready()
    const { responseTopic, correlationData, promise } = this.rpc.createRequest({
      timeout: options.timeout ?? 5000,
      responseTopicPrefix: options.responseTopicPrefix,
    })

    await this.publish(topic, payload, {
      qos: options.qos,
      properties: {
        ...options.properties,
        responseTopic,
        correlationData,
      },
    })

    return promise
  }

  async publish(topic: string, payload: MqttPayload, options?: PublishOptions): Promise<void> {
    await this.ready()
    const dispatcher = this.requireDispatcher()
    const route = dispatcher.findOutboundRoute(topic)
    if (route?.schema) {
      try {
        await validatePayload(route.schema, toPayloadBuffer(payload), topic)
      } catch (error) {
        await dispatcher.reportError(
          {
            error,
            topic,
            phase: 'publish',
            route: { pattern: route.pattern, meta: route.meta },
          },
          route,
        )
        throw error
      }
    }
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
    this.resolveRouteSchemas()
    this.dispatcher = new Dispatcher<TState>({
      routes: this.routes,
      middleware: this.middleware,
      createContext: (input) => this.createContext(input),
      appErrorHandlers: this.errorHandlers,
      interceptRpc: (message) => this.rpc.consume(message),
    })
  }

  private resolveRouteSchemas(): void {
    for (const route of this.routes) {
      // Standard Schema was already resolved by the router.
      if (route.schema) continue
      const raw = route.userSchema
      if (raw === undefined || raw === null) continue
      // Defensive: a route could have a raw schema that's actually Standard.
      if (isStandardSchema(raw)) {
        route.schema = raw
      } else {
        for (const provider of this.schemaProviders) {
          if (provider.detect(raw)) {
            route.schema = wrapSchemaProvider(provider, raw)
            break
          }
        }
      }
      if (route.schema && route.explicitValidate === undefined) {
        route.validate = 'inbound'
      }
    }
  }

  private createContext(input: ContextFactoryInput<TState>) {
    const { message, route, params } = input

    return {
      app: this,
      topic: message.topic,
      params,
      payload: message.payload,
      body: undefined as unknown,
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
      reply: async (payload: MqttPayload, options?: Omit<PublishOptions, 'properties'>) => {
        const properties = readPacketProperties(message.packet)
        const responseTopic = properties?.responseTopic
        if (!responseTopic) {
          throw new Error(
            `ctx.reply() called on topic "${message.topic}" but the inbound packet has no responseTopic property`,
          )
        }
        const correlationData = properties.correlationData
        await this.publish(responseTopic, payload, {
          qos: options?.qos,
          retain: options?.retain,
          properties: correlationData ? { correlationData } : undefined,
        })
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
