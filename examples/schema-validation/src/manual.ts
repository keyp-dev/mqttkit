/**
 * Standard Schema 运行时验证 + 错误处理钩子。
 *
 * 给 topic 加上 `schema` 字段就会在 PUBLISH 时自动验证 payload，验证后的
 * 结构化数据落到 `ctx.body`，类型自动推断。失败时通过 `onError` 集中处理。
 *
 * 这里手写一个最小的 Standard Schema 适配（zod / valibot / arktype /
 * typebox-validator 都内置 ~standard 字段，可以直接 `schema: myZodSchema`
 * 这样用）。
 */
import { router, type StandardSchemaV1 } from '@mqttkit/core'
import { createTestApp } from '@mqttkit/core/testing'

// ---- 最小 Standard Schema：要求 { temperature: number, ts?: number } ----
type Reading = { temperature: number; ts?: number }

const readingSchema: StandardSchemaV1<unknown, Reading> = {
  '~standard': {
    version: 1,
    vendor: 'mqttkit-example',
    validate(value) {
      const issues: StandardSchemaV1.Issue[] = []
      if (typeof value !== 'object' || value === null) {
        return { issues: [{ message: 'expected object', path: [] }] }
      }
      const obj = value as Record<string, unknown>
      if (typeof obj.temperature !== 'number') {
        issues.push({ message: 'expected number', path: ['temperature'] })
      }
      if (obj.ts !== undefined && typeof obj.ts !== 'number') {
        issues.push({ message: 'expected number', path: ['ts'] })
      }
      if (issues.length > 0) return { issues }
      return { value: obj as Reading }
    },
    types: { input: undefined as unknown, output: undefined as unknown as Reading },
  },
}

const { app, broker } = createTestApp()

app
  .onError((payload) => {
    if (payload.phase === 'validation') {
      console.log(`[reject] ${payload.topic}: ${(payload.error as Error).message}`)
    } else {
      console.error('[error]', payload.phase, payload.error)
    }
  })
  .use(
    router().topic('devices/:uid/readings', {
      schema: readingSchema,
      async onMessage(ctx) {
        // ctx.body 的类型自动从 schema 推断为 Reading
        console.log(`[accept] ${ctx.params.uid}: temp=${ctx.body.temperature}°C ts=${ctx.body.ts ?? 'n/a'}`)
      },
    }),
  )

await app.listen()

console.log('--- 合法 payload ---')
await broker.dispatch({
  topic: 'devices/alpha/readings',
  payload: JSON.stringify({ temperature: 21.5, ts: Date.now() }),
})

console.log('\n--- 字段缺失 ---')
await broker.dispatch({
  topic: 'devices/alpha/readings',
  payload: JSON.stringify({ ts: Date.now() }),
})

console.log('\n--- 字段类型错误 ---')
await broker.dispatch({
  topic: 'devices/alpha/readings',
  payload: JSON.stringify({ temperature: 'hot', ts: 'now' }),
})

console.log('\n--- 不是 JSON ---')
await broker.dispatch({
  topic: 'devices/alpha/readings',
  payload: 'plain text',
})

await app.stop()
