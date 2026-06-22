import { describe, expect, test } from 'bun:test'
import { router } from './index.js'
import type { InferParams } from './index.js'

// Type-only assertions: if any of these `Equal<...>` resolves to `false`,
// `Expect<false>` fails to satisfy `Expect<true>` and tsc errors out.
// Runtime side of these tests is a no-op — typecheck is the real signal.
type Expect<T extends true> = T
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _LiteralCases = [
  Expect<Equal<InferParams<'devices/online'>, {}>>,
  Expect<Equal<InferParams<'foo'>, {}>>,
]

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _ParamCases = [
  Expect<Equal<InferParams<'devices/:uid/events'>, { uid: string }>>,
  Expect<Equal<InferParams<':token'>, { token: string }>>,
  Expect<Equal<InferParams<'a/:x/b/:y'>, { x: string; y: string }>>,
]

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CatchAllCases = [
  Expect<Equal<InferParams<'files/*'>, { '*': string }>>,
  Expect<Equal<InferParams<'users/:uid/inbox/*'>, { uid: string; '*': string }>>,
]

describe('InferParams 类型推断', () => {
  test('topic() 调用处类型推断成立 (失败 → tsc 报错)', () => {
    router()
      .topic('devices/:uid/events', {
        onMessage(ctx) {
          // 这一行借助 contextual typing 确认 ctx.params.uid 是 string
          const uid: string = ctx.params.uid
          expect(typeof uid).toBe('string')
        },
      })
      .topic('files/:bucket/*', {
        onMessage(ctx) {
          const bucket: string = ctx.params.bucket
          const rest: string = ctx.params['*']
          expect([typeof bucket, typeof rest]).toEqual(['string', 'string'])
        },
      })
      .topic('static/online', {
        publish: ({ params }) => {
          const keys = Object.keys(params)
          expect(Array.isArray(keys)).toBe(true)
          return true
        },
      })

    expect(true).toBe(true)
  })
})
