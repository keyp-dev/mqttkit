import { aedes } from '@mqttkit/aedes'
import { asyncapi } from '@mqttkit/asyncapi'
import { MqttApp, router } from '@mqttkit/core'

type Principal = { uid: string }
type State = { principal?: Principal }

const deviceEventSchema = {
  type: 'object',
  required: ['temperature'],
  properties: {
    temperature: { type: 'number', description: 'Celsius reading' },
    humidity: { type: 'number' },
    ts: { type: 'integer', description: 'Unix ms' },
  },
}

const notificationSchema = {
  type: 'object',
  required: ['kind', 'body'],
  properties: {
    kind: { type: 'string', enum: ['invoice', 'system', 'chat'] },
    body: { type: 'string' },
  },
}

const app = new MqttApp<State>()
  .use(
    aedes({
      tcp: { port: 1883 },
      authenticate: ({ username }) => {
        if (!username) return false
        return { uid: username }
      },
    }),
  )
  .use(
    router<State>()
      .topic('devices/:uid/events', {
        publish: ({ params, principal }) => params.uid === principal?.uid,
        qos: 1,
        schema: deviceEventSchema,
        async onMessage(ctx) {
          await ctx.publish(`server/${ctx.params.uid}/echo`, ctx.payload, { qos: 0 })
        },
        meta: {
          summary: 'Device telemetry uplink',
          description: 'Device pushes sensor readings. Only the owning principal may publish.',
          tags: ['device', 'telemetry'],
          examples: [{ temperature: 22.5, humidity: 60, ts: Date.now() }],
        },
      })
      .topic('server/:uid/echo', {
        subscribe: ({ params, principal }) => params.uid === principal?.uid,
        qos: 0,
        meta: {
          summary: 'Server echo channel',
          description: 'Server echoes device events back to the owning client.',
          tags: ['device'],
        },
      })
      .topic('users/:uid/notifications', {
        subscribe: ({ params, principal }) => params.uid === principal?.uid,
        publish: false,
        qos: 1,
        retain: true,
        schema: notificationSchema,
        meta: {
          summary: 'User notifications',
          description: 'Server-pushed notifications. Clients subscribe only.',
          tags: ['notifications'],
        },
      }),
  )
  .use(
    asyncapi({
      info: {
        title: 'mqttkit demo',
        version: '0.0.1',
        description: 'AsyncAPI generated from mqttkit router metadata.',
      },
      servers: {
        tcp: { host: 'localhost:1883', protocol: 'mqtt', description: 'Aedes TCP broker' },
      },
      port: 9000,
    }),
  )

await app.listen()
console.log('mqtt://localhost:1883 | docs: http://localhost:9000/docs')
