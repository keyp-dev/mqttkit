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

  test('canSubscribe 识别 MQTT 5 $share/<group>/<filter>，剥离前缀后再匹配并把 group 传给 policy', async () => {
    const broker = new TestBroker()
    const policyInputs: Array<{ group?: string; topic: string; uid?: string }> = []

    const app = new MqttApp()
      .use({ setup: (app) => { app.broker(broker) } })
      .use(
        router()
          .topic('orders/:id/created', {
            subscribe: ({ topic, params, shared }) => {
              policyInputs.push({ topic, group: shared?.group, uid: params.id })
              // 只允许 billing / fulfillment 两个 group 共享订阅
              return shared ? ['billing', 'fulfillment'].includes(shared.group) : true
            },
          }),
      )

    await app.listen()

    await expect(
      app.canSubscribe({ topic: '$share/billing/orders/+/created', clientId: 'svc-1' }),
    ).resolves.toEqual({ allowed: true, params: {} })

    await expect(
      app.canSubscribe({ topic: '$share/unknown/orders/+/created', clientId: 'svc-2' }),
    ).resolves.toEqual({ allowed: false, params: {} })

    // 非 $share 普通订阅 → shared 为 undefined
    await expect(
      app.canSubscribe({ topic: 'orders/123/created', clientId: 'svc-3' }),
    ).resolves.toEqual({ allowed: true, params: { id: '123' } })

    expect(policyInputs).toEqual([
      { topic: 'orders/+/created', group: 'billing', uid: undefined },
      { topic: 'orders/+/created', group: 'unknown', uid: undefined },
      { topic: 'orders/123/created', group: undefined, uid: '123' },
    ])
  })

  test('canSubscribe 接受 MQTT 客户端的 + / # 通配符', async () => {
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

    // + 匹配单层但不绑定 uid → 通配订阅放行（默认 subscribe: true）
    await expect(app.canSubscribe({ topic: 'server/+/commands', clientId: 'client-a' })).resolves.toEqual({
      allowed: true,
      params: {},
    })

    // 自定义 policy 依赖 params.uid，使用 + 时 uid 缺失 → 拒绝
    await expect(app.canSubscribe({ topic: 'private/+', clientId: 'bob' })).resolves.toEqual({
      allowed: false,
      params: {},
    })

    // # 吃掉剩余段
    await expect(app.canSubscribe({ topic: 'server/#', clientId: 'client-a' })).resolves.toEqual({
      allowed: true,
      params: {},
    })
  })

  test('ctx.userProperties 暴露入站 MQTT 5 user properties，便于 trace 传播', async () => {
    const broker = new TestBroker()
    let seen: Record<string, string | string[]> | undefined

    const app = new MqttApp()
      .use({ setup: (a) => { a.broker(broker) } })
      .use(
        router().topic('telemetry/:id', {
          onMessage(ctx) {
            seen = ctx.userProperties
          },
        }),
      )

    await app.listen()
    await broker.dispatch({
      topic: 'telemetry/x',
      payload: Buffer.from('p'),
      clientId: 'c-1',
      packet: { properties: { userProperties: { traceparent: '00-abc-def-01', baggage: 'x=1' } } },
    })

    expect(seen).toEqual({ traceparent: '00-abc-def-01', baggage: 'x=1' })
  })

  test('app.onBeforePublish hook 可以在 publish 前改写 options（含 user properties 注入）', async () => {
    const broker = new TestBroker()
    const app = new MqttApp()
      .use({ setup: (a) => { a.broker(broker) } })
      .use(router().topic('out/:id'))
      .onBeforePublish((c) => {
        c.options.properties = {
          ...c.options.properties,
          userProperties: {
            ...c.options.properties?.userProperties,
            traceparent: '00-xxx-yyy-01',
          },
        }
      })
      .onBeforePublish((c) => {
        // 第二个 hook 能看到前一个 hook 的修改
        c.options.qos = 1
      })

    await app.listen()
    await app.publish('out/42', 'hello')

    expect(broker.published).toHaveLength(1)
    expect(broker.published[0].options).toMatchObject({
      qos: 1,
      properties: { userProperties: { traceparent: '00-xxx-yyy-01' } },
    })
    expect(broker.published[0].payload.toString()).toBe('hello')
  })

  test('onBeforePublish hook 抛错被 onError 拦截并阻止 broker.publish 被调用', async () => {
    const broker = new TestBroker()
    const errors: string[] = []
    const app = new MqttApp()
      .use({ setup: (a) => { a.broker(broker) } })
      .use(router().topic('out/:id'))
      .onError(({ phase, error }) => {
        errors.push(`${phase}:${(error as Error).message}`)
      })
      .onBeforePublish(() => {
        throw new Error('hook rejected')
      })

    await app.listen()
    await expect(app.publish('out/1', 'x')).rejects.toThrow('hook rejected')
    expect(broker.published).toHaveLength(0)
    expect(errors).toEqual(['publish:hook rejected'])
  })

  test('stop({ drain: true }) 等待在飞 handler 跑完再关 broker，且关闭后拒绝新消息', async () => {
    const broker = new TestBroker()
    let resolveHandler!: () => void
    const handlerEntered = new Promise<void>((resolve) => {
      resolveHandler = resolve
    })
    let releaseHandler!: () => void
    const handlerHold = new Promise<void>((resolve) => {
      releaseHandler = resolve
    })
    let handlerFinished = false

    const app = new MqttApp()
      .use({ setup: (a) => { a.broker(broker) } })
      .use(
        router().topic('devices/:uid/events', {
          async onMessage() {
            resolveHandler()
            await handlerHold
            handlerFinished = true
          },
        }),
      )

    await app.listen()

    // Start a dispatch that will hang inside the handler.
    const inflight = broker.dispatch({
      topic: 'devices/demo/events',
      payload: Buffer.from('1'),
      clientId: 'c-1',
    })

    await handlerEntered
    expect(app.activeCount()).toBe(1)

    // Kick off stop() while handler is still running. Drain should block on inflight.
    const stopPromise = app.stop({ drain: true, timeout: 1000 })

    // Subsequent dispatches must be rejected once closing is set.
    const rejected = await broker.dispatch({
      topic: 'devices/demo/events',
      payload: Buffer.from('2'),
      clientId: 'c-2',
    })
    expect(rejected).toBe(false)
    expect(handlerFinished).toBe(false)

    releaseHandler()
    await inflight
    await stopPromise

    expect(handlerFinished).toBe(true)
    expect(app.activeCount()).toBe(0)
  })

  test('stop({ drain: true }) 超时后打印警告但仍走完关闭流程', async () => {
    const broker = new TestBroker()
    let releaseHandler!: () => void
    const handlerHold = new Promise<void>((resolve) => {
      releaseHandler = resolve
    })
    let handlerEntered!: () => void
    const handlerStarted = new Promise<void>((resolve) => {
      handlerEntered = resolve
    })
    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(' '))
    }

    const app = new MqttApp()
      .use({ setup: (a) => { a.broker(broker) } })
      .use(
        router().topic('hang/:id', {
          async onMessage() {
            handlerEntered()
            await handlerHold
          },
        }),
      )

    try {
      await app.listen()
      const inflight = broker.dispatch({
        topic: 'hang/1',
        payload: Buffer.from('x'),
        clientId: 'c-1',
      })
      await handlerStarted
      await app.stop({ drain: true, timeout: 50 })

      expect(warnings.some((w) => w.includes('drain timed out'))).toBe(true)
      // Handler still running after stop returned.
      expect(app.activeCount()).toBe(1)

      releaseHandler()
      await inflight
    } finally {
      console.warn = originalWarn
    }
  })

  test('dispatch 走严格 match，pattern 里的 + / # 不再是通配符', async () => {
    const broker = new TestBroker()
    let called = false
    const app = new MqttApp()
      .use({ setup: (app) => { app.broker(broker) } })
      // pattern 里出现 '+' 现在是字面值，不再是 MQTT 单层通配符
      .use(router().topic('devices/+/events', { onMessage() { called = true } }))

    await app.listen()

    // 字面 '+' 不会匹配具体设备 id
    const missed = await broker.dispatch({
      topic: 'devices/abc/events',
      payload: Buffer.from('x'),
      clientId: 'client-a',
    })
    expect(missed).toBe(false)
    expect(called).toBe(false)

    // 完全字面相等才会派发
    const hit = await broker.dispatch({
      topic: 'devices/+/events',
      payload: Buffer.from('x'),
      clientId: 'client-a',
    })
    expect(hit).toBe(true)
    expect(called).toBe(true)
  })
})
