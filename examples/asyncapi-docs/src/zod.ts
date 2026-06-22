/**
 * **zod + AsyncAPI 集成示例。**
 *
 * zod 3.24+ 是原生 Standard Schema，运行时校验零配置；要让 schema 进入
 * AsyncAPI 文档，用 `jsonify(...)` 包一层 —— 它在 schema 上挂 `~jsonSchema`，
 * asyncapi builder 会优先读它。
 *
 * 对比 src/index.ts (typebox 版本)，可以看到两种方案的对称性：
 *
 *   typebox: `app.addSchemaProvider(typeboxProvider)` + `schema: Type.Object(...)`
 *   zod:     `schema: jsonify(z.object(...))`
 *
 * 启动后：
 *   - MQTT:           mqtt://localhost:1885
 *   - AsyncAPI JSON:  http://localhost:9002/asyncapi.json
 *   - 渲染文档:        http://localhost:9002/docs
 */
import { aedes } from '@mqttkit/aedes'
import { asyncapi } from '@mqttkit/asyncapi'
import { MqttApp, router } from '@mqttkit/core'
import { jsonify } from '@mqttkit/zod'
import { z } from 'zod'

type Principal = { uid: string }
type State = { principal?: Principal }

const deviceEventSchema = jsonify(
  z.object({
    temperature: z.number().describe('Celsius reading'),
    humidity: z.number().optional(),
    ts: z.number().int().optional().describe('Unix ms'),
  }),
)

const notificationSchema = jsonify(
  z.object({
    kind: z.enum(['invoice', 'system', 'chat']),
    body: z.string(),
  }),
)

const app = new MqttApp<State>()
  .use(
    aedes({
      tcp: { port: 1885 },
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
          // ctx.body 推断为 { temperature: number; humidity?: number; ts?: number }
          console.log(`[device ${ctx.params.uid}] ${ctx.body.temperature}°C`)
        },
        meta: {
          summary: 'Device telemetry uplink',
          description: 'zod 做运行时校验，jsonify 让 schema 进 AsyncAPI 文档',
          tags: ['device', 'telemetry'],
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
          tags: ['notifications'],
        },
      }),
  )
  .use(
    asyncapi({
      info: {
        title: 'mqttkit + zod demo',
        version: '0.0.1',
        description: 'zod 做运行时校验 + jsonify 输出 JSON Schema 到 AsyncAPI 文档。',
      },
      servers: {
        tcp: { host: 'localhost:1885', protocol: 'mqtt', description: 'Aedes TCP broker' },
      },
      port: 9002,
    }),
  )

await app.listen()
console.log('mqtt://localhost:1885 | docs: http://localhost:9002/docs')
