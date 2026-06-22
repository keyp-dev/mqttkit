import { describe, expect, test } from 'bun:test'
import { MqttApp, router } from './index.js'
import type {
  BrokerMessage,
  BrokerStartOptions,
  MqttBrokerAdapter,
  MqttPayload,
  PublishOptions,
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

describe('错误处理钩子', () => {
  test('handler 抛错 + 注册 app.onError → 错误被消化，dispatch 返回 false', async () => {
    const broker = new TestBroker()
    const captured: Array<{ phase: string; topic: string; error: unknown }> = []

    const app = new MqttApp()
      .use({ setup: (app) => { app.broker(broker) } })
      .onError(({ error, phase, topic }) => {
        captured.push({ error, phase, topic })
      })
      .use(
        router().topic('devices/:uid/events', {
          onMessage() { throw new Error('boom') },
        }),
      )

    await app.listen()
    const handled = await broker.dispatch({
      topic: 'devices/abc/events',
      payload: Buffer.from('x'),
      clientId: 'c1',
    })

    expect(handled).toBe(false)
    expect(captured).toHaveLength(1)
    expect(captured[0].phase).toBe('handler')
    expect(captured[0].topic).toBe('devices/abc/events')
    expect((captured[0].error as Error).message).toBe('boom')
  })

  test('未注册 onError → handler 错误冒泡到 broker（兼容旧行为）', async () => {
    const broker = new TestBroker()
    const app = new MqttApp()
      .use({ setup: (app) => { app.broker(broker) } })
      .use(router().topic('devices/:uid/events', { onMessage() { throw new Error('boom') } }))

    await app.listen()
    await expect(
      broker.dispatch({
        topic: 'devices/abc/events',
        payload: Buffer.from('x'),
        clientId: 'c1',
      }),
    ).rejects.toThrow('boom')
  })

  test('middleware 抛错也走 onError 链', async () => {
    const broker = new TestBroker()
    let middlewareErrors = 0
    let handlerCalled = false

    const app = new MqttApp()
      .use({ setup: (app) => { app.broker(broker) } })
      .onError(({ phase }) => {
        if (phase === 'handler') middlewareErrors += 1
      })
      .use(async (_ctx, _next) => { throw new Error('mid-fail') })
      .use(router().topic('devices/:uid/events', { onMessage() { handlerCalled = true } }))

    await app.listen()
    const handled = await broker.dispatch({
      topic: 'devices/abc/events',
      payload: Buffer.from('x'),
      clientId: 'c1',
    })

    expect(handled).toBe(false)
    expect(handlerCalled).toBe(false)
    expect(middlewareErrors).toBe(1)
  })

  test('route 级 onError 优先于 app 级', async () => {
    const broker = new TestBroker()
    const order: string[] = []

    const app = new MqttApp()
      .use({ setup: (app) => { app.broker(broker) } })
      .onError(() => { order.push('app') })
      .use(
        router().topic('devices/:uid/events', {
          onError: () => { order.push('route') },
          onMessage() { throw new Error('x') },
        }),
      )

    await app.listen()
    await broker.dispatch({
      topic: 'devices/abc/events',
      payload: Buffer.from('x'),
      clientId: 'c1',
    })
    expect(order).toEqual(['route', 'app'])
  })

  test('schema 校验失败也通过 onError 路由', async () => {
    const broker = new TestBroker()
    let validationError: unknown

    const schema = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        validate: (value: unknown) => {
          if (typeof value === 'object' && value && 'ok' in (value as object)) {
            return { value: value as { ok: true } }
          }
          return { issues: [{ message: 'missing ok', path: [] }] }
        },
      },
    }

    const app = new MqttApp()
      .use({ setup: (app) => { app.broker(broker) } })
      .onError(({ error, phase }) => {
        if (phase === 'validation') validationError = error
      })
      .use(
        router().topic('devices/:uid/events', {
          schema,
          onMessage() { /* no-op */ },
        }),
      )

    await app.listen()
    const handled = await broker.dispatch({
      topic: 'devices/abc/events',
      payload: Buffer.from(JSON.stringify({})),
      clientId: 'c1',
    })

    expect(handled).toBe(false)
    expect((validationError as Error).message).toMatch(/Schema validation failed/)
  })

  test('app.publish 出站校验失败既抛给调用方，也通过 onError 报告', async () => {
    const broker = new TestBroker()
    const seen: string[] = []
    const schema = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        validate: () => ({ issues: [{ message: 'nope', path: [] }] }),
      },
    }

    const app = new MqttApp()
      .use({ setup: (app) => { app.broker(broker) } })
      .onError(({ phase }) => { seen.push(phase) })
      .use(router().topic('server/:uid/cmd', { schema, validate: 'outbound' }))

    await app.listen()
    await expect(app.publish('server/abc/cmd', { x: 1 })).rejects.toThrow(/Schema validation/)
    expect(seen).toEqual(['publish'])
  })
})
