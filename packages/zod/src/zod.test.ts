import { describe, expect, test } from 'bun:test'
import { buildFromRoutes } from '@mqttkit/asyncapi'
import {
  MqttApp,
  router,
  toPayloadBuffer,
  type BrokerMessage,
  type BrokerStartOptions,
  type MqttBrokerAdapter,
  type MqttPayload,
  type PublishOptions,
  type TopicRoute,
} from '@mqttkit/core'
import { z } from 'zod'
import { jsonify } from './index.js'

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

describe('@mqttkit/zod / jsonify', () => {
  test('jsonify 在 zod schema 上挂 ~jsonSchema 字段', () => {
    const s = jsonify(z.object({ name: z.string(), age: z.number().int().positive() }))
    const attached = (s as unknown as { '~jsonSchema': { type: string; properties: Record<string, unknown> } })[
      '~jsonSchema'
    ]
    expect(attached).toBeDefined()
    expect(attached.type).toBe('object')
    expect(attached.properties.name).toEqual({ type: 'string' })
    // zod-to-json-schema 把 number().int().positive() 转成带 minimum/exclusiveMinimum 的 integer
    expect((attached.properties.age as { type: string }).type).toBe('integer')
  })

  test('jsonify 返回同一个 zod schema 实例（运行时校验仍走 Standard Schema）', () => {
    const original = z.object({ x: z.number() })
    const result = jsonify(original)
    expect(result).toBe(original)
    // Standard Schema 接口仍然存在
    expect('~standard' in result).toBe(true)
  })

  test('运行时校验仍由 zod 原生 Standard Schema 处理', async () => {
    const broker = new TestBroker()
    let body: { temperature: number } | undefined
    let rejected = false

    const app = new MqttApp()
      .onError((p) => {
        if (p.phase === 'validation') rejected = true
      })
      .use({ setup: (app) => { app.broker(broker) } })
      .use(
        router().topic('devices/:uid/readings', {
          schema: jsonify(z.object({ temperature: z.number() })),
          onMessage(ctx) {
            body = ctx.body
          },
        }),
      )

    await app.listen()

    await broker.dispatch({
      topic: 'devices/abc/readings',
      payload: Buffer.from(JSON.stringify({ temperature: 23 })),
      clientId: 'c1',
    })
    expect(body).toEqual({ temperature: 23 })

    await broker.dispatch({
      topic: 'devices/abc/readings',
      payload: Buffer.from(JSON.stringify({ temperature: 'hot' })),
      clientId: 'c1',
    })
    expect(rejected).toBe(true)
  })

  test('AsyncAPI builder 读 ~jsonSchema 拿到完整 JSON Schema', async () => {
    const broker = new TestBroker()
    const app = new MqttApp()
      .use({ setup: (app) => { app.broker(broker) } })
      .use(
        router().topic('users/:id', {
          schema: jsonify(z.object({ name: z.string(), age: z.number().int() })),
          meta: { summary: 'user payload' },
        }),
      )

    await app.ready()

    const doc = buildFromRoutes(app.getRoutes() as readonly TopicRoute[], {
      info: { title: 't', version: '0' },
    })
    const channels = doc.channels as Record<string, {
      messages: Record<string, { payload: { type?: string; properties?: Record<string, unknown> } }>
    }>
    const payload = channels['users.{id}'].messages.payload.payload
    expect(payload.type).toBe('object')
    expect(payload.properties?.name).toEqual({ type: 'string' })
  })

  test('未 jsonify 的 zod schema 在 AsyncAPI 文档里降级为 vendor 描述', async () => {
    const broker = new TestBroker()
    const app = new MqttApp()
      .use({ setup: (app) => { app.broker(broker) } })
      .use(
        router().topic('users/:id', {
          schema: z.object({ name: z.string() }), // 未挂 ~jsonSchema
          meta: { summary: 'user payload' },
        }),
      )

    await app.ready()

    const doc = buildFromRoutes(app.getRoutes() as readonly TopicRoute[], {
      info: { title: 't', version: '0' },
    })
    const channels = doc.channels as Record<string, {
      messages: Record<string, { payload: { description?: string } }>
    }>
    expect(channels['users.{id}'].messages.payload.payload.description).toMatch(/zod/)
  })
})
