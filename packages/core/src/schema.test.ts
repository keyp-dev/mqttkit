import { describe, expect, test } from 'bun:test'
import { MqttApp, router } from './index.js'
import type {
  BrokerMessage,
  BrokerStartOptions,
  MqttBrokerAdapter,
  MqttPayload,
  PublishOptions,
  StandardSchemaV1,
} from './index.js'
import { toPayloadBuffer } from './index.js'

class TestBroker implements MqttBrokerAdapter {
  started?: BrokerStartOptions
  published: Array<{ topic: string; payload: Buffer; options?: PublishOptions }> = []

  start(options: BrokerStartOptions): void {
    this.started = options
  }

  stop(): void {}

  async publish(topic: string, payload: MqttPayload, options?: PublishOptions) {
    this.published.push({ topic, payload: toPayloadBuffer(payload), options })
    return { topic }
  }

  async dispatch(message: BrokerMessage) {
    if (!this.started) throw new Error('broker is not started')
    return this.started.dispatch(message)
  }
}

/** Minimal hand-rolled Standard Schema for tests — avoids pulling zod into core. */
function objectSchema<T extends Record<string, 'string' | 'number'>>(
  shape: T,
): StandardSchemaV1<unknown, { [K in keyof T]: T[K] extends 'number' ? number : string }> {
  type Output = { [K in keyof T]: T[K] extends 'number' ? number : string }
  return {
    '~standard': {
      version: 1,
      vendor: 'mqttkit-test',
      validate(value) {
        if (typeof value !== 'object' || value === null) {
          return { issues: [{ message: 'expected object', path: [] }] }
        }
        const issues: StandardSchemaV1.Issue[] = []
        const out: Record<string, unknown> = {}
        for (const [key, type] of Object.entries(shape)) {
          const v = (value as Record<string, unknown>)[key]
          if (type === 'number' && typeof v !== 'number') {
            issues.push({ message: `expected number`, path: [key] })
          } else if (type === 'string' && typeof v !== 'string') {
            issues.push({ message: `expected string`, path: [key] })
          } else {
            out[key] = v
          }
        }
        if (issues.length) return { issues }
        return { value: out as Output }
      },
    },
  }
}

describe('schema 运行时验证', () => {
  test('入站 payload 通过 schema 校验后写入 ctx.body', async () => {
    const broker = new TestBroker()
    let received: unknown
    const schema = objectSchema({ temperature: 'number' })

    const app = new MqttApp()
      .use({ setup: (app) => { app.broker(broker) } })
      .use(
        router().topic('devices/:uid/events', {
          schema,
          onMessage(ctx) { received = ctx.body },
        }),
      )

    await app.listen()
    const handled = await broker.dispatch({
      topic: 'devices/abc/events',
      payload: Buffer.from(JSON.stringify({ temperature: 23 })),
      clientId: 'c1',
    })

    expect(handled).toBe(true)
    expect(received).toEqual({ temperature: 23 })
  })

  test('入站 payload 校验失败 → handler 不执行，dispatch 返回 false', async () => {
    const broker = new TestBroker()
    let called = false
    const schema = objectSchema({ temperature: 'number' })

    const app = new MqttApp()
      .use({ setup: (app) => { app.broker(broker) } })
      .use(
        router().topic('devices/:uid/events', {
          schema,
          onMessage() { called = true },
        }),
      )

    await app.listen()
    const handled = await broker.dispatch({
      topic: 'devices/abc/events',
      payload: Buffer.from(JSON.stringify({ temperature: 'hot' })),
      clientId: 'c1',
    })

    expect(handled).toBe(false)
    expect(called).toBe(false)
  })

  test('无 schema 时 ctx.body 落到 JSON 解码值', async () => {
    const broker = new TestBroker()
    let body: unknown
    const app = new MqttApp()
      .use({ setup: (app) => { app.broker(broker) } })
      .use(router().topic('devices/:uid/events', { onMessage(ctx) { body = ctx.body } }))

    await app.listen()
    await broker.dispatch({
      topic: 'devices/abc/events',
      payload: Buffer.from(JSON.stringify({ x: 1 })),
      clientId: 'c1',
    })
    expect(body).toEqual({ x: 1 })
  })

  test('validate: false 关掉验证，handler 收到原始 JSON 解码值', async () => {
    const broker = new TestBroker()
    let body: unknown
    const schema = objectSchema({ temperature: 'number' })

    const app = new MqttApp()
      .use({ setup: (app) => { app.broker(broker) } })
      .use(
        router().topic('devices/:uid/events', {
          schema,
          validate: false,
          onMessage(ctx) { body = ctx.body },
        }),
      )

    await app.listen()
    const handled = await broker.dispatch({
      topic: 'devices/abc/events',
      payload: Buffer.from(JSON.stringify({ temperature: 'hot' })),
      clientId: 'c1',
    })

    expect(handled).toBe(true)
    expect(body).toEqual({ temperature: 'hot' })
  })

  test('validate: outbound 时 app.publish 校验失败抛错', async () => {
    const broker = new TestBroker()
    const schema = objectSchema({ temperature: 'number' })

    const app = new MqttApp()
      .use({ setup: (app) => { app.broker(broker) } })
      .use(
        router().topic('server/:uid/echo', {
          schema,
          validate: 'outbound',
        }),
      )

    await app.listen()
    await expect(app.publish('server/abc/echo', { temperature: 'hot' })).rejects.toThrow(
      /Schema validation failed/,
    )
    expect(broker.published).toHaveLength(0)

    await app.publish('server/abc/echo', { temperature: 23 })
    expect(broker.published).toHaveLength(1)
  })

  test('validate: both 同时校验入出站', async () => {
    const broker = new TestBroker()
    const schema = objectSchema({ temperature: 'number' })
    let inboundBody: unknown

    const app = new MqttApp()
      .use({ setup: (app) => { app.broker(broker) } })
      .use(
        router().topic('devices/:uid/events', {
          schema,
          validate: 'both',
          onMessage(ctx) { inboundBody = ctx.body },
        }),
      )

    await app.listen()

    await broker.dispatch({
      topic: 'devices/abc/events',
      payload: Buffer.from(JSON.stringify({ temperature: 21 })),
      clientId: 'c1',
    })
    expect(inboundBody).toEqual({ temperature: 21 })

    await expect(app.publish('devices/abc/events', { temperature: 'cold' })).rejects.toThrow(
      /Schema validation failed/,
    )
  })

  test('普通 JSON Schema 对象不触发运行时验证', async () => {
    const broker = new TestBroker()
    let called = false
    const app = new MqttApp()
      .use({ setup: (app) => { app.broker(broker) } })
      .use(
        router().topic('devices/:uid/events', {
          // 没有 '~standard'，只是 JSON Schema 风格，给文档用
          schema: { type: 'object', required: ['temperature'] },
          onMessage() { called = true },
        }),
      )

    await app.listen()
    // 即使 payload 不符合"JSON Schema"，runtime 也不该验证
    const handled = await broker.dispatch({
      topic: 'devices/abc/events',
      payload: Buffer.from('not-json'),
      clientId: 'c1',
    })

    expect(handled).toBe(true)
    expect(called).toBe(true)
  })
})

// 自定义 schema 类型 + provider，模拟 typebox/任意第三方 schema 库
type FakeNumberSchema = { __fake: true; field: string }
const fakeNumberProvider = {
  vendor: 'fake-number',
  detect(schema: unknown) {
    return typeof schema === 'object' && schema !== null && (schema as { __fake?: boolean }).__fake === true
  },
  validate(schema: unknown, value: unknown) {
    const { field } = schema as FakeNumberSchema
    if (typeof value === 'object' && value !== null && typeof (value as Record<string, unknown>)[field] === 'number') {
      return { value }
    }
    return { issues: [{ message: `expected number at ${field}`, path: [field] }] }
  },
}

describe('addSchemaProvider', () => {
  test('注册 provider 后非 Standard schema 被识别并校验入站', async () => {
    const broker = new TestBroker()
    let body: unknown
    const schema: FakeNumberSchema = { __fake: true, field: 'temperature' }

    const app = new MqttApp()
      .addSchemaProvider(fakeNumberProvider)
      .use({ setup: (app) => { app.broker(broker) } })
      .use(
        router().topic('devices/:uid/events', {
          schema,
          onMessage(ctx) { body = ctx.body },
        }),
      )

    await app.listen()
    const ok = await broker.dispatch({
      topic: 'devices/abc/events',
      payload: Buffer.from(JSON.stringify({ temperature: 21 })),
      clientId: 'c1',
    })
    expect(ok).toBe(true)
    expect(body).toEqual({ temperature: 21 })

    const bad = await broker.dispatch({
      topic: 'devices/abc/events',
      payload: Buffer.from(JSON.stringify({ temperature: 'hot' })),
      clientId: 'c1',
    })
    expect(bad).toBe(false)
  })

  test('未注册 provider 时同样的 schema 不会被校验', async () => {
    const broker = new TestBroker()
    let called = false
    const schema: FakeNumberSchema = { __fake: true, field: 'temperature' }

    const app = new MqttApp()
      .use({ setup: (app) => { app.broker(broker) } })
      .use(
        router().topic('devices/:uid/events', {
          schema,
          onMessage() { called = true },
        }),
      )

    await app.listen()
    // payload 不含 temperature 字段，但因为没注册 provider，handler 照常运行
    const handled = await broker.dispatch({
      topic: 'devices/abc/events',
      payload: Buffer.from(JSON.stringify({})),
      clientId: 'c1',
    })
    expect(handled).toBe(true)
    expect(called).toBe(true)
  })

  test('Standard Schema 优先于 provider', async () => {
    const broker = new TestBroker()
    let body: unknown
    const stdSchema = objectSchema({ name: 'string' })

    // provider 会匹配所有对象 —— 但因为 stdSchema 是 Standard Schema，应该走 std 分支
    const greedyProvider = {
      vendor: 'greedy',
      detect: () => true,
      validate: () => ({ value: 'overridden by greedy' }),
    }

    const app = new MqttApp()
      .addSchemaProvider(greedyProvider)
      .use({ setup: (app) => { app.broker(broker) } })
      .use(
        router().topic('topic', {
          schema: stdSchema,
          onMessage(ctx) { body = ctx.body },
        }),
      )

    await app.listen()
    await broker.dispatch({
      topic: 'topic',
      payload: Buffer.from(JSON.stringify({ name: 'alice' })),
      clientId: 'c1',
    })
    expect(body).toEqual({ name: 'alice' })
  })

  test('Standard Schema 路由和 provider 路由在同一个 app 内共存', async () => {
    const broker = new TestBroker()
    const stdSchema = objectSchema({ name: 'string' })            // 模拟 zod / valibot
    const providerSchema: FakeNumberSchema = { __fake: true, field: 'temperature' }  // 模拟 typebox
    const seen: Array<{ route: 'std' | 'provider'; body: unknown }> = []

    const app = new MqttApp()
      .addSchemaProvider(fakeNumberProvider)
      .use({ setup: (app) => { app.broker(broker) } })
      .use(
        router()
          .topic('users/:id', {
            schema: stdSchema,
            onMessage(ctx) { seen.push({ route: 'std', body: ctx.body }) },
          })
          .topic('devices/:id/readings', {
            schema: providerSchema,
            onMessage(ctx) { seen.push({ route: 'provider', body: ctx.body }) },
          }),
      )

    await app.listen()

    // 1) Standard Schema 路由通过
    await broker.dispatch({
      topic: 'users/u1',
      payload: Buffer.from(JSON.stringify({ name: 'alice' })),
      clientId: 'c1',
    })
    // 2) Standard Schema 路由失败 → 不进 handler
    await broker.dispatch({
      topic: 'users/u1',
      payload: Buffer.from(JSON.stringify({ name: 42 })),
      clientId: 'c1',
    })
    // 3) provider 路由通过
    await broker.dispatch({
      topic: 'devices/d1/readings',
      payload: Buffer.from(JSON.stringify({ temperature: 21 })),
      clientId: 'c1',
    })
    // 4) provider 路由失败 → 不进 handler
    await broker.dispatch({
      topic: 'devices/d1/readings',
      payload: Buffer.from(JSON.stringify({ temperature: 'hot' })),
      clientId: 'c1',
    })

    expect(seen).toEqual([
      { route: 'std', body: { name: 'alice' } },
      { route: 'provider', body: { temperature: 21 } },
    ])
  })

  test('多个 provider 共存，按注册顺序匹配（首个命中即停）', async () => {
    const broker = new TestBroker()
    const calls: string[] = []

    const providerA = {
      vendor: 'A',
      detect: (s: unknown) => typeof s === 'object' && s !== null && (s as { kind?: string }).kind === 'A',
      validate(_: unknown, value: unknown) {
        calls.push('A')
        return { value }
      },
    }
    const providerB = {
      vendor: 'B',
      detect: (s: unknown) => typeof s === 'object' && s !== null && (s as { kind?: string }).kind === 'B',
      validate(_: unknown, value: unknown) {
        calls.push('B')
        return { value }
      },
    }

    const app = new MqttApp()
      .addSchemaProvider(providerA)
      .addSchemaProvider(providerB)
      .use({ setup: (app) => { app.broker(broker) } })
      .use(
        router()
          .topic('a', { schema: { kind: 'A' }, onMessage() {} })
          .topic('b', { schema: { kind: 'B' }, onMessage() {} }),
      )

    await app.listen()
    await broker.dispatch({ topic: 'a', payload: Buffer.from('{}'), clientId: 'c1' })
    await broker.dispatch({ topic: 'b', payload: Buffer.from('{}'), clientId: 'c1' })
    expect(calls).toEqual(['A', 'B'])
  })

  test('显式 validate:false 时即使 provider 匹配也不校验', async () => {
    const broker = new TestBroker()
    let body: unknown
    const schema: FakeNumberSchema = { __fake: true, field: 'temperature' }

    const app = new MqttApp()
      .addSchemaProvider(fakeNumberProvider)
      .use({ setup: (app) => { app.broker(broker) } })
      .use(
        router().topic('topic', {
          schema,
          validate: false,
          onMessage(ctx) { body = ctx.body },
        }),
      )

    await app.listen()
    await broker.dispatch({
      topic: 'topic',
      payload: Buffer.from(JSON.stringify({ temperature: 'hot' })),
      clientId: 'c1',
    })
    expect(body).toEqual({ temperature: 'hot' })
  })
})
