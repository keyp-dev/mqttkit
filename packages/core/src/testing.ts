import { MqttApp } from './app.js'
import type {
  BrokerMessage,
  BrokerStartOptions,
  MqttBrokerAdapter,
  MqttPayload,
  PublishOptions,
  PublishResult,
} from './broker.js'
import type { MqttAppState } from './context.js'
import { toPayloadBuffer } from './payload.js'

export type TestBrokerPublishEntry = {
  topic: string
  payload: Buffer
  options?: PublishOptions
}

export type TestBrokerOptions<TPrincipal = unknown> = {
  /**
   * Default `clientId` used by {@link TestBroker.dispatch} when the caller
   * does not supply one. Defaults to `'test-client'`.
   */
  clientId?: string
  /**
   * Default `principal` attached to dispatched messages when the caller does
   * not supply one. Useful when a route relies on authenticated state.
   */
  principal?: TPrincipal
}

export type TestDispatchInput<TPrincipal = unknown> = {
  topic: string
  payload?: MqttPayload
  clientId?: string
  principal?: TPrincipal
  packet?: unknown
}

/**
 * In-memory {@link MqttBrokerAdapter} for unit-testing apps without spinning
 * up aedes. Outbound publishes are captured into {@link published}, and
 * {@link dispatch} forwards inbound messages directly into the runtime.
 *
 * @example
 * ```ts
 * const broker = createTestBroker()
 * const app = new MqttApp().use({ setup: (a) => a.broker(broker) })
 *   .use(router().topic('devices/:uid/events', { onMessage(ctx) { ... } }))
 * await app.listen()
 * await broker.dispatch({ topic: 'devices/demo/events', payload: 'hi' })
 * expect(broker.published).toHaveLength(0)
 * ```
 */
export class TestBroker<TPrincipal = unknown> implements MqttBrokerAdapter<TPrincipal> {
  /** All publishes received via {@link publish}, in order. */
  readonly published: TestBrokerPublishEntry[] = []
  /** Hook fired synchronously for every {@link publish}. */
  onPublish?: (entry: TestBrokerPublishEntry) => void

  private runtime?: BrokerStartOptions<TPrincipal>
  private readonly defaults: TestBrokerOptions<TPrincipal>

  constructor(options: TestBrokerOptions<TPrincipal> = {}) {
    this.defaults = options
  }

  start(options: BrokerStartOptions<TPrincipal>): void {
    this.runtime = options
  }

  stop(): void {
    this.runtime = undefined
  }

  async publish(topic: string, payload: MqttPayload, options?: PublishOptions): Promise<PublishResult> {
    const entry: TestBrokerPublishEntry = { topic, payload: toPayloadBuffer(payload), options }
    this.published.push(entry)
    this.onPublish?.(entry)
    return { topic }
  }

  /** Push an inbound publish through the runtime as if a client had sent it. */
  async dispatch(input: TestDispatchInput<TPrincipal>): Promise<boolean> {
    if (!this.runtime) throw new Error('TestBroker is not started — call app.listen() first')
    const message: BrokerMessage<TPrincipal> = {
      topic: input.topic,
      payload: toPayloadBuffer(input.payload),
      clientId: input.clientId ?? this.defaults.clientId ?? 'test-client',
      principal: input.principal ?? this.defaults.principal,
      packet: input.packet,
    }
    return this.runtime.dispatch(message)
  }

  /** Forward an inbound `SUBSCRIBE` to the runtime's authorization hook. */
  async canSubscribe(input: { topic: string; clientId?: string; principal?: TPrincipal; packet?: unknown }) {
    if (!this.runtime) throw new Error('TestBroker is not started — call app.listen() first')
    return this.runtime.canSubscribe({
      topic: input.topic,
      clientId: input.clientId ?? this.defaults.clientId ?? 'test-client',
      principal: input.principal ?? this.defaults.principal,
      packet: input.packet,
    })
  }

  /** Emit a broker-level lifecycle event through the runtime. */
  async emit(eventName: string, event: unknown): Promise<void> {
    await this.runtime?.emit(eventName, event)
  }

  /** Clear recorded publishes and the `onPublish` hook. */
  reset(): void {
    this.published.length = 0
    this.onPublish = undefined
  }
}

export function createTestBroker<TPrincipal = unknown>(
  options?: TestBrokerOptions<TPrincipal>,
): TestBroker<TPrincipal> {
  return new TestBroker<TPrincipal>(options)
}

/**
 * Convenience helper that wires a fresh {@link MqttApp} to a {@link TestBroker}.
 * Returns both so callers can register routes/middleware on `app` and then
 * exercise the runtime via `broker.dispatch(...)`.
 *
 * @example
 * ```ts
 * const { app, broker } = createTestApp()
 * app.use(router().topic('devices/:uid/events', { onMessage(ctx) { ... } }))
 * await app.listen()
 * await broker.dispatch({ topic: 'devices/demo/events', payload: 'hi' })
 * ```
 */
export function createTestApp<TState extends MqttAppState = MqttAppState>(
  options: TestBrokerOptions<TState['principal']> = {},
): { app: MqttApp<TState>; broker: TestBroker<TState['principal']> } {
  const broker = createTestBroker<TState['principal']>(options)
  const app = new MqttApp<TState>().broker(broker)
  return { app, broker }
}
