export type MqttEventName =
  | 'client'
  | 'clientReady'
  | 'clientDisconnect'
  | 'keepaliveTimeout'
  | 'clientError'
  | 'connectionError'
  | 'connackSent'
  | 'ping'
  | 'publish'
  | 'ack'
  | 'subscribe'
  | 'unsubscribe'

export type MqttEvent<TPrincipal = unknown> = {
  type: MqttEventName
  clientId?: string
  topic?: string
  pattern?: string
  principal?: TPrincipal
  params?: Record<string, string>
  packet?: unknown
  error?: unknown
}

export type MqttEventHandler<TPrincipal = unknown> = (
  event: MqttEvent<TPrincipal>,
) => void | Promise<void>
