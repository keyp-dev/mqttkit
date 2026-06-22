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

  test('schema 校验失败也通过 onError 路由，payload 透出原始字节', async () => {
    const broker = new TestBroker()
    let validationError: unknown
    let validationPayload: unknown

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
      .onError(({ error, phase, payload }) => {
        if (phase === 'validation') {
          validationError = error
          validationPayload = payload
        }
      })
      .use(
        router().topic('devices/:uid/events', {
          schema,
          onMessage() { /* no-op */ },
        }),
      )

    await app.listen()
    const raw = Buffer.from(JSON.stringify({ broken: true }))
    const handled = await broker.dispatch({
      topic: 'devices/abc/events',
      payload: raw,
      clientId: 'c1',
    })

    expect(handled).toBe(false)
    expect((validationError as Error).message).toMatch(/Schema validation failed/)
    expect(Buffer.isBuffer(validationPayload)).toBe(true)
    expect((validationPayload as Buffer).equals(raw)).toBe(true)
  })

  test('handler 超过 timeout → phase=timeout，并发计数会归零', async () => {
    const broker = new TestBroker()
    const phases: string[] = []
    let release: () => void = () => {}

    const app = new MqttApp()
      .use({ setup: (app) => { app.broker(broker) } })
      .onError(({ phase, error }) => {
        phases.push(phase)
        expect(error).toBeInstanceOf(Error)
      })
      .use(
        router().topic('devices/:uid/events', {
          timeout: 10,
          async onMessage() {
            await new Promise<void>((resolve) => { release = resolve })
          },
        }),
      )

    await app.listen()
    const handled = await broker.dispatch({
      topic: 'devices/abc/events',
      payload: Buffer.from('x'),
      clientId: 'c1',
    })
    release() // 让卡住的 handler 结束，避免句柄泄露
    expect(handled).toBe(false)
    expect(phases).toEqual(['timeout'])
    // 第二次还能跑（说明 inflight 已经归零）
    await broker.dispatch({
      topic: 'devices/abc/events',
      payload: Buffer.from('y'),
      clientId: 'c1',
    })
    release()
    expect(phases).toEqual(['timeout', 'timeout'])
  })

  test('concurrency 达上限 → phase=overload，handler 不会被调用', async () => {
    const broker = new TestBroker()
    const phases: string[] = []
    let activeHandlers = 0
    let resolveInflight: () => void = () => {}
    const inflightDone = new Promise<void>((resolve) => { resolveInflight = resolve })
    let signalStarted: () => void = () => {}
    const firstStarted = new Promise<void>((resolve) => { signalStarted = resolve })

    const app = new MqttApp()
      .use({ setup: (app) => { app.broker(broker) } })
      .onError(({ phase, error }) => {
        phases.push(phase)
        if (phase === 'overload') {
          expect((error as Error).name).toBe('HandlerOverloadError')
        }
      })
      .use(
        router().topic('devices/:uid/events', {
          concurrency: 1,
          async onMessage() {
            activeHandlers += 1
            signalStarted()
            await inflightDone
            activeHandlers -= 1
          },
        }),
      )

    await app.listen()

    // 第一条占住唯一名额
    const first = broker.dispatch({
      topic: 'devices/abc/events',
      payload: Buffer.from('1'),
      clientId: 'c1',
    })
    await firstStarted
    expect(activeHandlers).toBe(1)

    // 第二条应直接被 overload 拒绝
    const second = await broker.dispatch({
      topic: 'devices/abc/events',
      payload: Buffer.from('2'),
      clientId: 'c1',
    })
    expect(second).toBe(false)
    expect(phases).toEqual(['overload'])
    expect(activeHandlers).toBe(1) // 第二条没真正进入 handler

    resolveInflight()
    await first
  })

  test('app.publish 出站校验失败既抛给调用方，也通过 onError 报告（payload 透出原始入参）', async () => {
    const broker = new TestBroker()
    const seen: Array<{ phase: string; payload: unknown }> = []
    const schema = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        validate: () => ({ issues: [{ message: 'nope', path: [] }] }),
      },
    }

    const app = new MqttApp()
      .use({ setup: (app) => { app.broker(broker) } })
      .onError(({ phase, payload }) => { seen.push({ phase, payload }) })
      .use(router().topic('server/:uid/cmd', { schema, validate: 'outbound' }))

    await app.listen()
    await expect(app.publish('server/abc/cmd', { x: 1 })).rejects.toThrow(/Schema validation/)
    expect(seen).toEqual([{ phase: 'publish', payload: { x: 1 } }])
  })
})
