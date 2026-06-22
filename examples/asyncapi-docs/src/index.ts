/**
 * mqttkit + TypeBox + AsyncAPI 一体化示例。
 *
 * **核心模式**：一份 TypeBox schema 同时承担三件事 ——
 *   1) 运行时校验（`app.addSchemaProvider(typeboxProvider)`）
 *   2) `ctx.body` 静态类型推断（`Static<T>`，零导出）
 *   3) AsyncAPI 文档 payload（TypeBox 本身就是 JSON Schema，无需转换）
 *
 * 这是 mqttkit 推荐的 schema 写法。如果你坚持用 zod 做运行时校验，
 * 需要额外把 schema 转 JSON Schema 才能进入 AsyncAPI 文档；参见
 * examples/schema-validation/src/zod.ts。
 *
 * 启动后：
 *   - MQTT:           mqtt://localhost:1883
 *   - AsyncAPI JSON:  http://localhost:9000/asyncapi.json
 *   - AsyncAPI YAML:  http://localhost:9000/asyncapi.yaml
 *   - 渲染文档:        http://localhost:9000/docs
 */
import { aedes } from '@mqttkit/aedes'
import { asyncapi } from '@mqttkit/asyncapi'
import { MqttApp, router } from '@mqttkit/core'
import { typeboxProvider } from '@mqttkit/typebox'
import { Type } from '@sinclair/typebox'

type Principal = { uid: string }
type State = { principal?: Principal }

const deviceEventSchema = Type.Object(
  {
    temperature: Type.Number({ description: 'Celsius reading' }),
    humidity: Type.Optional(Type.Number()),
    ts: Type.Optional(Type.Integer({ description: 'Unix ms' })),
  },
  { description: 'Device telemetry payload' },
)

const notificationSchema = Type.Object({
  kind: Type.Union([Type.Literal('invoice'), Type.Literal('system'), Type.Literal('chat')]),
  body: Type.String(),
})

const app = new MqttApp<State>()
  .addSchemaProvider(typeboxProvider)
  .use(
    aedes({
      tcp: { port: 1883 },
      authenticate: ({ username }) => (username ? { uid: username } : false),
    }),
  )
  .use(
    router<State>()
      .topic('devices/:uid/events', {
        publish: ({ params, principal }) => params.uid === principal?.uid,
        qos: 1,
        schema: deviceEventSchema,
        async onMessage(ctx) {
          // ctx.body 自动推断为 { temperature: number; humidity?: number; ts?: number }
          console.log(`[device ${ctx.params.uid}] ${ctx.body.temperature}°C`)
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
        description: 'AsyncAPI generated from mqttkit router metadata, schemas powered by TypeBox.',
      },
      servers: {
        tcp: { host: 'localhost:1883', protocol: 'mqtt', description: 'Aedes TCP broker' },
      },
      port: 9000,
    }),
  )

await app.listen()
console.log('mqtt://localhost:1883 | docs: http://localhost:9000/docs')
