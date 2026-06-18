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
> = {
  app: MqttApp<TState>
  topic: string
  params: TParams
  payload: Buffer
  clientId: string
  principal: TState['principal']
  services: NonNullable<TState['services']>
  packet?: unknown
  route: {
    pattern: string
    meta?: unknown
  }
  publish(topic: string, payload: MqttPayload, options?: PublishOptions): Promise<void>
}

export type MqttHandler<
  TState extends MqttAppState = MqttAppState,
  TParams extends Record<string, string> = Record<string, string>,
> = (ctx: MqttContext<TState, TParams>) => void | Promise<void>

export type MqttNext = () => Promise<void>

export type MqttMiddleware<TState extends MqttAppState = MqttAppState> = (
  ctx: MqttContext<TState>,
  next: MqttNext,
) => void | Promise<void>

export type MqttPolicyInput<TPrincipal = unknown> = {
  topic: string
  params: Record<string, string>
  clientId: string
  principal?: TPrincipal
  route: {
    pattern: string
    meta?: unknown
  }
  packet?: unknown
}

export type MqttTopicPolicy<TPrincipal = unknown> =
  | boolean
  | ((input: MqttPolicyInput<TPrincipal>) => boolean | Promise<boolean>)

export type ContextFactoryInput<TState extends MqttAppState> = {
  message: BrokerMessage<TState['principal']>
  route: TopicRoute<TState>
  params: Record<string, string>
}
