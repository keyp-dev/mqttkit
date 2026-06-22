import { describe, expect, test } from 'bun:test'
import {
  MqttApp,
  router,
  toPayloadBuffer,
  type BrokerMessage,
  type BrokerStartOptions,
  type MqttBrokerAdapter,
  type MqttPayload,
  type PublishOptions,
} from '@mqttkit/core'
import { Type } from '@sinclair/typebox'
import { typeboxProvider } from './index.js'

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

describe('@mqttkit/typebox', () => {
  test('typeboxProvider.detect 只识别 typebox schema', () => {
    expect(typeboxProvider.detect(Type.Object({ a: Type.Number() }))).toBe(true)
    expect(typeboxProvider.detect(Type.Number())).toBe(true)
    expect(typeboxProvider.detect({ type: 'object' })).toBe(false)
    expect(typeboxProvider.detect(null)).toBe(false)
    expect(typeboxProvider.detect(undefined)).toBe(false)
    expect(typeboxProvider.detect({ '~standard': { version: 1 } })).toBe(false)
  })

  test('合法 payload 进入 ctx.body，类型推断为 Static<T>', async () => {
    const broker = new TestBroker()
    let body: { temperature: number; ts?: number } | undefined

    const app = new MqttApp()
      .addSchemaProvider(typeboxProvider)
      .use({ setup: (app) => { app.broker(broker) } })
      .use(
        router().topic('devices/:uid/readings', {
          schema: Type.Object({
            temperature: Type.Number(),
            ts: Type.Optional(Type.Number()),
          }),
          onMessage(ctx) {
            body = ctx.body
          },
        }),
      )

    await app.listen()
    const ok = await broker.dispatch({
      topic: 'devices/abc/readings',
      payload: Buffer.from(JSON.stringify({ temperature: 21.5, ts: 1700000000000 })),
      clientId: 'c1',
    })
    expect(ok).toBe(true)
    expect(body).toEqual({ temperature: 21.5, ts: 1700000000000 })
  })

  test('非法 payload 被拦截，handler 不执行', async () => {
    const broker = new TestBroker()
    let called = false
    const issues: unknown[] = []

    const app = new MqttApp()
      .addSchemaProvider(typeboxProvider)
      .onError((payload) => {
        if (payload.phase === 'validation') issues.push(payload.error)
      })
      .use({ setup: (app) => { app.broker(broker) } })
      .use(
        router().topic('devices/:uid/readings', {
          schema: Type.Object({ temperature: Type.Number() }),
          onMessage() { called = true },
        }),
      )

    await app.listen()
    const handled = await broker.dispatch({
      topic: 'devices/abc/readings',
      payload: Buffer.from(JSON.stringify({ temperature: 'hot' })),
      clientId: 'c1',
    })
    expect(handled).toBe(false)
    expect(called).toBe(false)
    expect(issues).toHaveLength(1)
  })

  test('未注册 typeboxProvider 时 raw TSchema 不会触发校验（兼容性）', async () => {
    const broker = new TestBroker()
    let called = false
    const app = new MqttApp()
      .use({ setup: (app) => { app.broker(broker) } })
      .use(
        router().topic('x', {
          schema: Type.Object({ temperature: Type.Number() }),
          onMessage() { called = true },
        }),
      )

    await app.listen()
    const handled = await broker.dispatch({
      topic: 'x',
      payload: Buffer.from(JSON.stringify({ temperature: 'hot' })),
      clientId: 'c1',
    })
    expect(handled).toBe(true)
    expect(called).toBe(true)
  })
})
