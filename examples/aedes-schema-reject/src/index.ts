/**
 * Schema validation as an *inbound firewall* — with an MQTT 5 reason code
 * instead of a dropped connection.
 *
 * The important detail is WHERE validation runs. The `@mqttkit/aedes` adapter
 * dispatches every inbound PUBLISH inside aedes' `authorizePublish` hook, i.e.
 * BEFORE the broker acknowledges or forwards the message. So a schema failure
 * genuinely rejects the publish: the handler never runs and no subscriber ever
 * sees the bad payload.
 *
 * (If instead you run validation on a `broker.on('publish')` listener — a
 * common mistake in hand-rolled broker wrappers — it fires AFTER the PUBACK and
 * AFTER the message was forwarded, so it can only observe, never block.)
 *
 * On aedes 2.x, when the publisher is an MQTT 5 client, a rejected QoS>0 publish
 * comes back as a PUBACK/PUBREC carrying reason code 0x87 (Not authorized) — the
 * connection stays up, unlike the v3/v4 behaviour which drops the socket.
 *
 * Run: bun run src/index.ts
 */
import { AedesBrokerAdapter } from '@mqttkit/aedes'
import { MqttApp, router, SchemaValidationError, type StandardSchemaV1 } from '@mqttkit/core'
import mqtt from 'mqtt'

// ---- A tiny Standard Schema: { temperature: number } ----
type Reading = { temperature: number }

const readingSchema: StandardSchemaV1<unknown, Reading> = {
  '~standard': {
    version: 1,
    vendor: 'mqttkit-example',
    validate(value) {
      if (typeof value !== 'object' || value === null) {
        return { issues: [{ message: 'expected object', path: [] }] }
      }
      const temperature = (value as Record<string, unknown>).temperature
      if (typeof temperature !== 'number') {
        return { issues: [{ message: 'expected number', path: ['temperature'] }] }
      }
      return { value: { temperature } }
    },
    types: { input: undefined as unknown, output: undefined as unknown as Reading },
  },
}

const handled: Reading[] = []

const adapter = new AedesBrokerAdapter<{ uid: string }>({
  tcp: { port: 0 },
  ws: false,
  authenticate: ({ clientId }) => ({ uid: clientId }),
})

const app = new MqttApp<{ principal?: { uid: string } }>()
  .use({ setup: (a) => { a.broker(adapter) } })
  // Central place to observe rejections. phase === 'validation' means the schema
  // gate stopped the message before the handler.
  .onError((e) => {
    if (e.phase === 'validation') {
      const detail = e.error instanceof SchemaValidationError ? e.error.message : String(e.error)
      console.log(`❌ [server] rejected publish on "${e.topic}" — ${detail}`)
    }
  })
  .use(
    router<{ principal?: { uid: string } }>().topic('devices/:uid/reading', {
      publish: true,
      schema: readingSchema,
      validate: 'inbound',
      async onMessage(ctx) {
        // Only ever reached for payloads that passed the schema.
        handled.push(ctx.body as Reading)
        console.log('✅ [server] handler ran, body =', ctx.body)
      },
    }),
  )

await app.listen()
const port = adapter.getTcpAddress()?.port
console.log(`broker listening on mqtt://127.0.0.1:${port}\n`)

// Connect as an MQTT 5 client so a rejection can carry a reason code.
const client = await mqtt.connectAsync(`mqtt://127.0.0.1:${port}`, {
  protocolVersion: 5,
  clientId: 'sensor-1',
})

async function tryPublish(label: string, payload: unknown) {
  try {
    const ack = (await client.publishAsync(
      'devices/sensor-1/reading',
      JSON.stringify(payload),
      { qos: 1 },
    )) as { reasonCode?: number } | undefined
    console.log(`[client] ${label}: PUBACK reasonCode = ${ack?.reasonCode ?? 0}`)
  } catch (err) {
    console.log(`[client] ${label}: rejected — ${(err as Error).message}`)
  }
}

console.log('--- valid payload ---')
await tryPublish('valid  ', { temperature: 21.5 })

console.log('\n--- invalid payload (temperature is a string) ---')
await tryPublish('invalid', { temperature: 'hot' })

// The bad publish did NOT drop the connection — prove the client is still usable.
await new Promise((r) => setTimeout(r, 50))
console.log('\n[client] still connected after the rejected publish?', client.connected)
console.log('[server] handler ran', handled.length, 'time(s) — only the valid payload got through')

await client.endAsync()
await app.stop()
