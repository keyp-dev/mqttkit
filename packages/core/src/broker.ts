export type MqttPayload = Buffer | Uint8Array | string | object | null | undefined

/** Subset of MQTT 5 PUBLISH properties that we propagate end-to-end. */
export type MqttPublishProperties = {
  responseTopic?: string
  correlationData?: Buffer | Uint8Array | string
  contentType?: string
  payloadFormatIndicator?: 0 | 1
  messageExpiryInterval?: number
  userProperties?: Record<string, string | string[]>
}

export type PublishOptions = {
  qos?: 0 | 1 | 2
  retain?: boolean
  properties?: MqttPublishProperties
}

export type PublishResult = {
  topic: string
}

export type BrokerMessage<TPrincipal = unknown> = {
  topic: string
  payload: Buffer
  clientId: string
  principal?: TPrincipal
  packet?: unknown
}

export type BrokerStartOptions<TPrincipal = unknown> = {
  listen?: Record<string, unknown>
  dispatch(message: BrokerMessage<TPrincipal>): Promise<boolean>
  canSubscribe(input: SubscribeCheckInput<TPrincipal>): Promise<SubscribeCheckResult>
  emit(eventName: string, event: unknown): Promise<void>
}

export type SubscribeCheckInput<TPrincipal = unknown> = {
  topic: string
  clientId: string
  principal?: TPrincipal
  packet?: unknown
}

export type SubscribeCheckResult = {
  allowed: boolean
  params?: Record<string, string>
  reason?: string
}

export interface MqttBrokerAdapter<TPrincipal = unknown> {
  start(options: BrokerStartOptions<TPrincipal>): Promise<void> | void
  stop(): Promise<void> | void
  publish(topic: string, payload: MqttPayload, options?: PublishOptions): Promise<PublishResult>
}
