/**
 * Standard Schema with **TypeBox**.
 *
 * TypeBox 本身不实现 Standard Schema 接口，但 `@mqttkit/typebox` 提供了一个
 * `typeboxProvider`，注册一次后就可以把任意 `Type.X(...)` schema 直接传给
 * `topic({ schema })`，`ctx.body` 也会自动推断为 `Static<T>`。
 */
import { router } from '@mqttkit/core'
import { createTestApp } from '@mqttkit/core/testing'
import { typeboxProvider } from '@mqttkit/typebox'
import { Type } from '@sinclair/typebox'

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

await app.stop()
