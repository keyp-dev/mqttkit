import type { BrokerMessage, MqttPacket, MqttPublishProperties } from './broker.js'

export type RpcRequestOptions = {
  /** Request payload. */
  payload?: unknown
  /** QoS for the outbound request (0/1/2). Defaults to 0. */
  qos?: 0 | 1 | 2
  /**
   * Per-attempt timeout (ms). Defaults to 5_000. With `retries > 0` this is the
   * budget per attempt, not the total — total wall time is bounded by
   * `(retries + 1) * timeout + retries * retryDelay`.
   */
  timeout?: number
  /** Optional extra MQTT 5 properties (excluding responseTopic/correlationData). */
  properties?: Omit<MqttPublishProperties, 'responseTopic' | 'correlationData'>
  /** Override the response topic prefix (default `_rpc/replies`). */
  responseTopicPrefix?: string
  /**
   * Total number of retries on timeout. `0` (default) keeps the legacy
   * fail-fast behaviour. Only attempt this for **idempotent** RPC topics —
   * the retried publish goes out as a fresh message with a new correlation
   * key, so a non-idempotent handler would run twice.
   */
  retries?: number
  /** Delay (ms) between retries. Defaults to `0` (immediate). */
  retryDelay?: number
}

/**
 * Thrown when an RPC request times out. Catching this discriminates timeouts
 * from other RPC failures (broker errors, app stopping) so retry loops only
 * retry the right thing.
 */
export class RpcTimeoutError extends Error {
  readonly timeoutMs: number
  readonly responseTopic: string
  constructor(timeoutMs: number, responseTopic: string) {
    super(`RPC request timed out after ${timeoutMs}ms (topic=${responseTopic})`)
    this.name = 'RpcTimeoutError'
    this.timeoutMs = timeoutMs
    this.responseTopic = responseTopic
  }
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
          reject(new RpcTimeoutError(options.timeout, responseTopic))
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

export function readPacketProperties(packet: MqttPacket): MqttPublishProperties | undefined {
  if (!packet || typeof packet !== 'object') return undefined
  return (packet as { properties?: MqttPublishProperties }).properties
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
