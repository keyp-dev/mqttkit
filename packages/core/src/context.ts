import type { MqttApp } from './app.js'
import type { BrokerMessage, MqttPacket, MqttPayload, PublishOptions } from './broker.js'
import type { TopicRoute } from './router.js'

export type { MqttPayload } from './broker.js'

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
  packet?: MqttPacket
  /**
   * MQTT 5 user properties from the inbound publish, if any. A flat read view
   * of `packet.properties.userProperties` — handy for trace propagation,
   * correlation IDs, or any other side-band metadata without touching the
   * adapter-specific raw packet shape.
   */
  userProperties?: Record<string, string | string[]>
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
  /**
   * Set when the inbound subscription was an MQTT 5 shared subscription
   * (`$share/<group>/<topic-filter>`). `topic` and `params` are derived from
   * the stripped topic filter so route matching is uniform.
   */
  shared?: { group: string }
  route: {
    pattern: string
    meta?: unknown
  }
  packet?: MqttPacket
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

export type MqttErrorPhase =
  | 'middleware'
  | 'handler'
  | 'validation'
  | 'policy'
  | 'publish'
  | 'timeout'
  | 'overload'

export type MqttErrorPayload<TState extends MqttAppState = MqttAppState> = {
  error: unknown
  topic: string
  phase: MqttErrorPhase
  /**
   * Raw payload that triggered the error.
   * - Inbound phases (`validation`, `policy`, `middleware`, `handler`): the `Buffer` from the broker.
   * - Outbound phase (`publish`): the original `MqttPayload` passed to `app.publish()` (may be a string, object, Uint8Array, …).
   * Undefined only when no payload context applies.
   */
  payload?: MqttPayload
  route?: { pattern: string; meta?: unknown }
  ctx?: MqttContext<TState>
}

export type MqttErrorHandler<TState extends MqttAppState = MqttAppState> = (
  payload: MqttErrorPayload<TState>,
) => void | Promise<void>
