/**
 * Standard Schema with **zod** (3.24+).
 *
 * zod 3.24 起，`z.*()` 返回的 schema 直接实现 Standard Schema 接口，
 * 可以原样作为 `topic({ schema })` 的参数；`ctx.body` 自动推断为 zod 静态类型。
 *
 * 唯一额外步骤：如果你还想让 `@mqttkit/asyncapi` 把这个 schema 输出到文档里，
 * 用 `jsonify(...)` 包一层 —— 它会在 schema 上挂 `~jsonSchema`，运行时校验
 * 仍走 zod 原生 Standard Schema。
 *
 * 如果你不需要 AsyncAPI 文档，直接 `schema: z.object(...)` 即可。
 */
import { router } from '@mqttkit/core'
import { createTestApp } from '@mqttkit/core/testing'
import { jsonify } from '@mqttkit/zod'
import { z } from 'zod'

const readingSchema = jsonify(
  z.object({
    temperature: z.number(),
    ts: z.number().optional(),
  }),
)

const { app, broker } = createTestApp()

app
  .onError((payload) => {
    if (payload.phase === 'validation') {
      console.log(`[reject] ${payload.topic}: ${(payload.error as Error).message}`)
    }
  })
  .use(
    router().topic('devices/:uid/readings', {
      schema: readingSchema,
      async onMessage(ctx) {
        // ctx.body 自动推断为 { temperature: number; ts?: number }
        console.log(`[accept] ${ctx.params.uid}: temp=${ctx.body.temperature}°C ts=${ctx.body.ts ?? 'n/a'}`)
      },
    }),
  )

await app.listen()

const cases = [
  { label: '合法', payload: { temperature: 21.5, ts: Date.now() } },
  { label: '字段缺失', payload: { ts: Date.now() } },
  { label: '字段类型错误', payload: { temperature: 'hot', ts: 'now' } },
  { label: '非 JSON', payload: 'plain text' as unknown },
]

for (const c of cases) {
  console.log(`\n--- ${c.label} ---`)
  await broker.dispatch({
    topic: 'devices/alpha/readings',
    payload: typeof c.payload === 'string' ? c.payload : JSON.stringify(c.payload),
  })
}

// 顺手把挂上的 JSON Schema 打印一下，证明 @mqttkit/asyncapi 能读到完整 schema
console.log('\n--- ~jsonSchema attached ---')
console.log(JSON.stringify((readingSchema as unknown as { '~jsonSchema': unknown })['~jsonSchema'], null, 2))

await app.stop()
