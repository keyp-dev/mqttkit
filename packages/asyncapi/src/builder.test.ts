import { describe, expect, test } from 'bun:test'
import { MqttApp, router, type StandardSchemaV1 } from '@mqttkit/core'
import { buildAsyncApi, buildFromRoutes } from './builder.js'

function appWith(...routers: ReturnType<typeof router>[]): MqttApp {
  const app = new MqttApp()
  for (const r of routers) app.use(r)
  return app
}

const info = { title: 'Test', version: '1.0.0' }

describe('buildAsyncApi / buildFromRoutes', () => {
  test('publish-only topic (有 onMessage) 渲染为 send operation，参数被提取', () => {
    const r = router().topic('devices/:uid/events', { onMessage() {} })
    const doc = buildAsyncApi(appWith(r), { info })

    expect(doc.asyncapi).toBe('3.0.0')
    expect(doc.info).toEqual(info)

    const channels = doc.channels as Record<string, any>
    const channelId = 'devices.{uid}.events'
    expect(channels[channelId].address).toBe('devices/{uid}/events')
    expect(channels[channelId].parameters).toEqual({ uid: { description: 'Path parameter :uid' } })

    const ops = doc.operations as Record<string, any>
    expect(ops[`${channelId}.send`]).toBeDefined()
    expect(ops[`${channelId}.send`].action).toBe('send')
    expect(ops[`${channelId}.receive`]).toBeUndefined()
  })

  test('subscribe-only topic (无 onMessage) 渲染为 receive operation', () => {
    const r = router().topic('alerts/:id')
    const doc = buildAsyncApi(appWith(r), { info })

    const ops = doc.operations as Record<string, any>
    expect(ops['alerts.{id}.receive']).toBeDefined()
    expect(ops['alerts.{id}.send']).toBeUndefined()
  })

  test('显式 publish:false + subscribe:true 仅渲染 receive', () => {
    const r = router().topic('x/:y', { publish: false, subscribe: true, onMessage() {} })
    const doc = buildAsyncApi(appWith(r), { info })

    const ops = doc.operations as Record<string, any>
    expect(ops['x.{y}.send']).toBeUndefined()
    expect(ops['x.{y}.receive']).toBeDefined()
  })

  test('catch-all 通配符 * 渲染为 {rest} parameter', () => {
    const r = router().topic('logs/*', { onMessage() {} })
    const doc = buildAsyncApi(appWith(r), { info })

    const channels = doc.channels as Record<string, any>
    expect(channels['logs.{rest}'].address).toBe('logs/{rest}')
    expect(channels['logs.{rest}'].parameters.rest).toBeDefined()
  })

  test('qos / retain → mqtt bindings', () => {
    const r = router().topic('cmd/:id', { onMessage() {}, qos: 2, retain: true })
    const doc = buildAsyncApi(appWith(r), { info })

    const ops = doc.operations as Record<string, any>
    expect(ops['cmd.{id}.send'].bindings).toEqual({ mqtt: { qos: 2, retain: true } })
  })

  test('未设置 qos/retain 时不写 bindings', () => {
    const r = router().topic('cmd/:id', { onMessage() {} })
    const doc = buildAsyncApi(appWith(r), { info })

    const ops = doc.operations as Record<string, any>
    expect(ops['cmd.{id}.send'].bindings).toBeUndefined()
  })

  test('meta.summary / description / tags / examples / message 写入 channel + operation', () => {
    const r = router().topic('events/:id', {
      onMessage() {},
      meta: {
        summary: '触发事件',
        description: '设备上报事件',
        tags: ['device'],
        examples: [{ ok: true }],
        message: { name: 'EventPayload', contentType: 'application/cbor' },
      },
    })
    const doc = buildAsyncApi(appWith(r), { info })
    const channels = doc.channels as Record<string, any>
    const channel = channels['events.{id}']

    expect(channel.description).toBe('设备上报事件')
    expect(channel.tags).toEqual([{ name: 'device' }])
    expect(channel.messages.EventPayload.contentType).toBe('application/cbor')
    expect(channel.messages.EventPayload.examples).toEqual([{ payload: { ok: true } }])

    const ops = doc.operations as Record<string, any>
    expect(ops['events.{id}.send'].summary).toBe('触发事件')
  })

  test('Standard Schema 带 ~jsonSchema → payload 使用 jsonSchema', () => {
    const schema: StandardSchemaV1 & { '~jsonSchema': Record<string, unknown> } = {
      '~standard': {
        version: 1,
        vendor: 'demo',
        validate: () => ({ value: undefined }),
      },
      '~jsonSchema': { type: 'object', properties: { name: { type: 'string' } } },
    }
    const r = router().topic('x', { onMessage() {}, schema })
    const channels = buildFromRoutes(appWith(r).getRoutes(), { info }).channels as Record<string, any>
    expect(channels.x.messages.payload.payload).toEqual({
      type: 'object',
      properties: { name: { type: 'string' } },
    })
  })

  test('Standard Schema 无 ~jsonSchema → 回退到 vendor 描述', () => {
    const schema: StandardSchemaV1 = {
      '~standard': { version: 1, vendor: 'zod', validate: () => ({ value: undefined }) },
    }
    const r = router().topic('x', { onMessage() {}, schema })
    const channels = buildFromRoutes(appWith(r).getRoutes(), { info }).channels as Record<string, any>
    expect(channels.x.messages.payload.payload).toEqual({ description: 'Validated by zod' })
  })

  test('裸 JSON Schema 对象直接透传', () => {
    const schema = { type: 'object', properties: { temp: { type: 'number' } } } as const
    const r = router().topic('x', { onMessage() {}, schema })
    const channels = buildFromRoutes(appWith(r).getRoutes(), { info }).channels as Record<string, any>
    expect(channels.x.messages.payload.payload).toEqual(schema)
  })

  test('servers 字段透传', () => {
    const doc = buildAsyncApi(appWith(router().topic('x', { onMessage() {} })), {
      info,
      servers: { prod: { host: 'mqtt.example.com', protocol: 'mqtts' } },
    })
    expect(doc.servers).toEqual({ prod: { host: 'mqtt.example.com', protocol: 'mqtts' } })
  })
})
