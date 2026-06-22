import type { MqttApp } from './app.js'
import type { BrokerMessage, MqttPayload, PublishOptions } from './broker.js'
import type { TopicRoute } from './router.js'

export type MqttAppState = {
  principal?: unknown
  services?: Record<string, unknown>
}

export type MqttContext<
  TState extends MqttAppState = MqttAppState,
  TParams extends Record<string, string> = Record<string, string>,
  TBody = unknown,
> = {
  app: MqttApp<TState>
  topic: string
  params: TParams
  /** Raw payload bytes as received from the broker. */
  payload: Buffer
  /**
   * Decoded + validated payload. When a `schema` is declared on the topic,
   * `body` is typed from the schema; otherwise it is the best-effort JSON
   * decoding of `payload` (or `undefined` when the payload is empty / opaque).
   */
  body: TBody
  clientId: string
  principal: TState['principal']
  services: NonNullable<TState['services']>
  packet?: unknown
  route: {
    pattern: string
    meta?: unknown
  }
  publish(topic: string, payload: MqttPayload, options?: PublishOptions): Promise<void>
  /**
   * Reply to a request that included MQTT 5 `responseTopic` + `correlationData`.
   * Throws when the inbound packet did not carry a responseTopic.
   */
  reply(payload: MqttPayload, options?: Omit<PublishOptions, 'properties'>): Promise<void>
}

export type MqttHandler<
  TState extends MqttAppState = MqttAppState,
  TParams extends Record<string, string> = Record<string, string>,
  TBody = unknown,
> = (ctx: MqttContext<TState, TParams, TBody>) => void | Promise<void>

export type MqttNext = () => Promise<void>

export type MqttMiddleware<TState extends MqttAppState = MqttAppState> = (
  ctx: MqttContext<TState>,
  next: MqttNext,
) => void | Promise<void>

export type MqttPolicyInput<
  TPrincipal = unknown,
  TParams extends Record<string, string> = Record<string, string>,
> = {
  topic: string
  params: TParams
  clientId: string
  principal?: TPrincipal
  route: {
    pattern: string
    meta?: unknown
  }
  packet?: unknown
}

export type MqttTopicPolicy<
  TPrincipal = unknown,
  TParams extends Record<string, string> = Record<string, string>,
> =
  | boolean
  | ((input: MqttPolicyInput<TPrincipal, TParams>) => boolean | Promise<boolean>)

export type ContextFactoryInput<TState extends MqttAppState> = {
  message: BrokerMessage<TState['principal']>
  route: TopicRoute<TState>
  params: Record<string, string>
}

export type MqttErrorPhase = 'middleware' | 'handler' | 'validation' | 'policy' | 'publish'

export type MqttErrorPayload<TState extends MqttAppState = MqttAppState> = {
  error: unknown
  topic: string
  phase: MqttErrorPhase
  route?: { pattern: string; meta?: unknown }
  ctx?: MqttContext<TState>
}

export type MqttErrorHandler<TState extends MqttAppState = MqttAppState> = (
  payload: MqttErrorPayload<TState>,
) => void | Promise<void>
