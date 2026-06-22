/**
 * 真实 zod + 真实 typebox 在同一个 MqttApp 内同时使用。
 *
 * - zod 3.24+ 是原生 Standard Schema (`~standard`)，core 直接识别。
 * - typebox 不实现 Standard Schema，需要 `app.addSchemaProvider(typeboxProvider)`。
 * - 两者完全互不干扰：core 永远先匹配 Standard Schema，再轮询 providers。
 */
import { router } from '@mqttkit/core'
import { createTestApp } from '@mqttkit/core/testing'
import { typeboxProvider } from '@mqttkit/typebox'
import { jsonify } from '@mqttkit/zod'
import { Type } from '@sinclair/typebox'
import { z } from 'zod'

// zod schema —— 用于 users/:id（注册路由）；jsonify 让它能进 AsyncAPI 文档
const userSchema = jsonify(
  z.object({
    name: z.string(),
    age: z.number().int().positive(),
  }),
)

// typebox schema —— 用于 devices/:uid/readings（设备遥测）
const readingSchema = Type.Object({
  temperature: Type.Number(),
  ts: Type.Optional(Type.Number()),
})

const { app, broker } = createTestApp()

app
  .addSchemaProvider(typeboxProvider)
  .onError((payload) => {
    if (payload.phase === 'validation') {
      console.log(`[reject] ${payload.topic}: ${(payload.error as Error).message}`)
    }
  })
  .use(
    router()
      .topic('users/:id', {
        schema: userSchema,
        onMessage(ctx) {
          // ctx.body 来自 zod 的 InferOutput：{ name: string; age: number }
          console.log(`[zod] user ${ctx.params.id}: ${ctx.body.name}, age ${ctx.body.age}`)
        },
      })
      .topic('devices/:uid/readings', {
        schema: readingSchema,
        onMessage(ctx) {
          // ctx.body 来自 typebox 的 Static<T>：{ temperature: number; ts?: number }
          console.log(`[typebox] device ${ctx.params.uid}: ${ctx.body.temperature}°C`)
        },
      }),
  )

await app.listen()

console.log('--- zod 路径 ---')
await broker.dispatch({
  topic: 'users/u1',
  payload: JSON.stringify({ name: 'alice', age: 30 }),
})
await broker.dispatch({
  topic: 'users/u1',
  payload: JSON.stringify({ name: 'bob', age: -1 }),
})

console.log('\n--- typebox 路径 ---')
await broker.dispatch({
  topic: 'devices/alpha/readings',
  payload: JSON.stringify({ temperature: 21.5 }),
})
await broker.dispatch({
  topic: 'devices/alpha/readings',
  payload: JSON.stringify({ temperature: 'hot' }),
})

await app.stop()
