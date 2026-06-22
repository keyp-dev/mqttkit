import { describe, expect, test } from 'bun:test'
import { router } from './index.js'
import { createTestApp, createTestBroker, TestBroker } from './testing.js'

describe('createTestBroker / createTestApp', () => {
  test('createTestBroker 默认会注入 clientId 并记录 publish', async () => {
    const { app, broker } = createTestApp()
    let seenClient: string | undefined
    app.use(
      router().topic('devices/:uid/events', {
        async onMessage(ctx) {
          seenClient = ctx.clientId
          await ctx.publish('server/ack', 'ok')
        },
      }),
    )

    await app.listen()
    const handled = await broker.dispatch({ topic: 'devices/x/events', payload: 'hi' })

    expect(handled).toBe(true)
    expect(seenClient).toBe('test-client')
    expect(broker.published).toEqual([
      expect.objectContaining({ topic: 'server/ack' }),
    ])
    expect(broker.published[0].payload.toString()).toBe('ok')
  })

  test('clientId / principal 默认值可被构造时覆盖', async () => {
    type State = { principal?: { uid: string }; services?: Record<string, unknown> }
    let captured: { clientId: string; principal: { uid: string } | undefined } | undefined
    const { app, broker } = createTestApp<State>({
      clientId: 'fixed-client',
      principal: { uid: 'demo' },
    })

    app.use(
      router<State>().topic('devices/:uid/events', {
        async onMessage(ctx) {
          captured = { clientId: ctx.clientId, principal: ctx.principal }
        },
      }),
    )

    await app.listen()
    await broker.dispatch({ topic: 'devices/x/events', payload: 'hi' })

    expect(captured).toEqual({ clientId: 'fixed-client', principal: { uid: 'demo' } })
  })

  test('onPublish 钩子可以模拟设备回复', async () => {
    const { app, broker } = createTestApp()
    broker.onPublish = (entry) => {
      if (entry.topic !== 'devices/x/cmd') return
      const properties = entry.options?.properties
      if (!properties?.responseTopic || !properties.correlationData) return
      queueMicrotask(() => {
        void broker.dispatch({
          topic: properties.responseTopic!,
          payload: 'pong',
          packet: { properties: { correlationData: properties.correlationData } },
        })
      })
    }

    await app.listen()
    const response = await app.request('devices/x/cmd', 'ping', { timeout: 200 })
    expect(response.payload.toString()).toBe('pong')
  })

  test('reset 清空记录与钩子', async () => {
    const broker = createTestBroker()
    await broker.publish('a', 'one')
    broker.onPublish = () => {}
    expect(broker.published).toHaveLength(1)

    broker.reset()
    expect(broker.published).toHaveLength(0)
    expect(broker.onPublish).toBeUndefined()
  })

  test('TestBroker.dispatch 在未 listen 时抛错', async () => {
    const broker = new TestBroker()
    await expect(broker.dispatch({ topic: 'devices/x', payload: 'hi' })).rejects.toThrow(/not started/)
  })

  test('canSubscribe 通过 broker 转发到 runtime', async () => {
    const { app, broker } = createTestApp()
    app.use(router().topic('server/:uid/commands'))
    await app.listen()

    await expect(broker.canSubscribe({ topic: 'server/demo/commands' })).resolves.toEqual({
      allowed: true,
      params: { uid: 'demo' },
    })
  })
})
