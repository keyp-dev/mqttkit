import { describe, expect, test } from 'bun:test'
import { MqttApp, router } from './index.js'
import type { BrokerMessage, BrokerStartOptions, MqttBrokerAdapter, MqttPayload, PublishOptions } from './index.js'
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

describe('MqttApp + router().topic()', () => {
  test('匹配 publish topic、提取 params，并按顺序执行 middleware 和 handler', async () => {
    const calls: string[] = []
    const broker = new TestBroker()

    const app = new MqttApp()
      .use({
        setup(app) {
          app.broker(broker)
        },
      })
      .use(async (ctx, next) => {
        calls.push(`app:${ctx.topic}`)
        await next()
      })
      .use(
        router()
          .use(async (ctx, next) => {
            calls.push(`route:${ctx.params.uid}`)
            await next()
          })
          .topic('devices/:uid/events', {
            async onMessage(ctx) {
              calls.push(`handler:${ctx.params.uid}:${ctx.payload.toString()}`)
              await ctx.publish(`server/${ctx.params.uid}/commands`, 'pong', { qos: 1 })
            },
          }),
      )

    await app.listen()
    const handled = await broker.dispatch({
      topic: 'devices/demo/events',
      payload: Buffer.from('ping'),
      clientId: 'client-a',
    })

    expect(handled).toBe(true)
    expect(calls).toEqual(['app:devices/demo/events', 'route:demo', 'handler:demo:ping'])
    expect(broker.published).toHaveLength(1)
    expect(broker.published[0]).toMatchObject({
      topic: 'server/demo/commands',
      options: { qos: 1 },
    })
    expect(broker.published[0].payload.toString()).toBe('pong')
  })

  test('topic 默认策略符合 onMessage 语义', async () => {
    const publishRoute = router().topic('devices/:uid/events', { onMessage() {} }).routes[0]
    const subscribeRoute = router().topic('server/:uid/commands').routes[0]

    expect(publishRoute.publish).toBe(true)
    expect(publishRoute.subscribe).toBe(false)
    expect(subscribeRoute.publish).toBe(false)
    expect(subscribeRoute.subscribe).toBe(true)
  })

  test('publish:false 会拒绝 publish 并拦截 handler', async () => {
    const broker = new TestBroker()
    let called = false

    const app = new MqttApp()
      .use({ setup: (app) => { app.broker(broker) } })
      .use(router().topic('blocked/:id', { publish: false, onMessage: () => { called = true } }))

    await app.listen()
    const handled = await broker.dispatch({
      topic: 'blocked/1',
      payload: Buffer.from('payload'),
      clientId: 'client-a',
    })

    expect(handled).toBe(false)
    expect(called).toBe(false)
  })

  test('canSubscribe 返回匹配 route 的 allow/deny 和 params', async () => {
    const broker = new TestBroker()
    const app = new MqttApp()
      .use({ setup: (app) => { app.broker(broker) } })
      .use(
        router()
          .topic('server/:uid/commands')
          .topic('private/:uid', {
            subscribe: ({ params, clientId }) => params.uid === clientId,
          }),
      )

    await app.listen()

    await expect(app.canSubscribe({ topic: 'server/demo/commands', clientId: 'client-a' })).resolves.toEqual({
      allowed: true,
      params: { uid: 'demo' },
    })
    await expect(app.canSubscribe({ topic: 'private/alice', clientId: 'bob' })).resolves.toEqual({
      allowed: false,
      params: { uid: 'alice' },
    })
  })
})
