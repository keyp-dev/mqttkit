import type { MqttPayload } from './broker.js'

export function toPayloadBuffer(payload: MqttPayload): Buffer {
  if (Buffer.isBuffer(payload)) return payload
  if (payload instanceof Uint8Array) return Buffer.from(payload)
  if (typeof payload === 'string') return Buffer.from(payload)
  if (payload == null) return Buffer.alloc(0)

  return Buffer.from(JSON.stringify(payload))
}
