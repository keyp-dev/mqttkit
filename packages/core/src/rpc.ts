import type { BrokerMessage, MqttPublishProperties } from './broker.js'

export type RpcRequestOptions = {
  /** Request payload. */
  payload?: unknown
  /** QoS for the outbound request (0/1/2). Defaults to 0. */
  qos?: 0 | 1 | 2
  /** Timeout in ms. Defaults to 5_000. */
  timeout?: number
  /** Optional extra MQTT 5 properties (excluding responseTopic/correlationData). */
  properties?: Omit<MqttPublishProperties, 'responseTopic' | 'correlationData'>
  /** Override the response topic prefix (default `_rpc/replies`). */
  responseTopicPrefix?: string
}

export type RpcResponse = {
  topic: string
  payload: Buffer
  properties?: MqttPublishProperties
}

type Pending = {
  resolve: (value: RpcResponse) => void
  reject: (error: unknown) => void
  timer: ReturnType<typeof setTimeout>
  responseTopic: string
}

let counter = 0
function nextCorrelationKey(): string {
  counter = (counter + 1) >>> 0
  return `${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export class RpcManager {
  private readonly pending = new Map<string, Pending>()

  createRequest(options: { responseTopicPrefix?: string; timeout: number }): {
    correlationKey: string
    responseTopic: string
    correlationData: Buffer
    promise: Promise<RpcResponse>
  } {
    const correlationKey = nextCorrelationKey()
    const responseTopic = `${options.responseTopicPrefix ?? '_rpc/replies'}/${correlationKey}`
    const correlationData = Buffer.from(correlationKey, 'utf8')

    const promise = new Promise<RpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(correlationKey)) {
          reject(new Error(`RPC request timed out after ${options.timeout}ms (topic=${responseTopic})`))
        }
      }, options.timeout)
      this.pending.set(correlationKey, { resolve, reject, timer, responseTopic })
    })

    return { correlationKey, responseTopic, correlationData, promise }
  }

  /**
   * If `message` is a pending response, resolve the matching promise and
   * return true. Otherwise return false so the dispatcher continues normal
   * routing.
   */
  consume(message: BrokerMessage): boolean {
    const props = readPacketProperties(message.packet)
    const key = decodeCorrelationKey(props?.correlationData)
    if (!key) return false

    const entry = this.pending.get(key)
    if (!entry) return false
    if (entry.responseTopic !== message.topic) return false

    this.pending.delete(key)
    clearTimeout(entry.timer)
    entry.resolve({ topic: message.topic, payload: message.payload, properties: props })
    return true
  }

  cancelAll(reason: string): void {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer)
      entry.reject(new Error(reason))
    }
    this.pending.clear()
  }
}

export function readPacketProperties(packet: unknown): MqttPublishProperties | undefined {
  if (!packet || typeof packet !== 'object') return undefined
  const properties = (packet as { properties?: MqttPublishProperties }).properties
  return properties
}

function decodeCorrelationKey(
  data: MqttPublishProperties['correlationData'] | undefined,
): string | undefined {
  if (!data) return undefined
  if (typeof data === 'string') return data
  if (Buffer.isBuffer(data)) return data.toString('utf8')
  if (data instanceof Uint8Array) return Buffer.from(data).toString('utf8')
  return undefined
}
