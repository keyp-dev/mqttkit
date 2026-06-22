import { describe, expect, test } from 'bun:test'
import { MqttApp, router } from './index.js'
import type {
  BrokerMessage,
  BrokerStartOptions,
  MqttBrokerAdapter,
  MqttMetricEvent,
  MqttPayload,
  PublishOptions,
} from './index.js'
import { toPayloadBuffer } from './index.js'

class TestBroker implements MqttBrokerAdapter {
  started?: BrokerStartOptions
  published: Array<{ topic: string; payload: Buffer; options?: PublishOptions }> = []
  failPublish = false

  start(options: BrokerStartOptions): void {
    this.started = options
  }

  stop(): void {}

  async publish(topic: string, payload: MqttPayload, options?: PublishOptions) {
    if (this.failPublish) throw new Error('broker rejected publish')
    this.published.push({ topic, payload: toPayloadBuffer(payload), options })
    return { topic }
  }

  async dispatch(message: BrokerMessage) {
    if (!this.started) throw new Error('broker is not started')
    return this.started.dispatch(message)
  }
}

describe('app.onMetric', () => {
  test('dispatch 成功 → 一次 ok 指标，附带 route + durationMs', async () => {
    const broker = new TestBroker()
    const events: MqttMetricEvent[] = []

    const app = new MqttApp()
      .use({ setup: (app) => { app.broker(broker) } })
      .onMetric((event) => { events.push(event) })
      .use(
        router().topic('devices/:uid/events', {
          async onMessage() { /* no-op */ },
        }),
      )

    await app.listen()
    await broker.dispatch({
      topic: 'devices/abc/events',
      payload: Buffer.from('x'),
      clientId: 'c1',
    })

    expect(events).toHaveLength(1)
    const ev = events[0]
    expect(ev.type).toBe('dispatch')
    if (ev.type !== 'dispatch') throw new Error('narrow')
    expect(ev.result).toBe('ok')
    expect(ev.topic).toBe('devices/abc/events')
    expect(ev.route?.pattern).toBe('devices/:uid/events')
    expect(ev.errorPhase).toBeUndefined()
    expect(ev.durationMs).toBeGreaterThanOrEqual(0)
  })

  test('没有路由匹配 → result=rejected, route=undefined', async () => {
    const broker = new TestBroker()
    const events: MqttMetricEvent[] = []
    const app = new MqttApp()
      .use({ setup: (app) => { app.broker(broker) } })
      .onMetric((event) => { events.push(event) })
      .use(router().topic('orders/:id'))

    await app.listen()
    await broker.dispatch({
      topic: 'totally/unrelated',
      payload: Buffer.from(''),
      clientId: 'c1',
    })

    expect(events).toHaveLength(1)
    const ev = events[0]
    expect(ev.type === 'dispatch' && ev.result).toBe('rejected')
    expect(ev.type === 'dispatch' && ev.route).toBeUndefined()
  })

  test('handler 抛错 → result=error, errorPhase=handler', async () => {
    const broker = new TestBroker()
    const events: MqttMetricEvent[] = []
    const app = new MqttApp()
      .use({ setup: (app) => { app.broker(broker) } })
      .onError(() => {}) // 消化错误，避免 dispatch 重抛
      .onMetric((event) => { events.push(event) })
      .use(router().topic('devices/:uid/events', { onMessage() { throw new Error('boom') } }))

    await app.listen()
    await broker.dispatch({
      topic: 'devices/abc/events',
      payload: Buffer.from('x'),
      clientId: 'c1',
    })

    expect(events).toHaveLength(1)
    const ev = events[0]
    expect(ev.type === 'dispatch' && ev.result).toBe('error')
    expect(ev.type === 'dispatch' && ev.errorPhase).toBe('handler')
  })

  test('handler 超时 → errorPhase=timeout', async () => {
    const broker = new TestBroker()
    const events: MqttMetricEvent[] = []
    let release: () => void = () => {}

    const app = new MqttApp()
      .use({ setup: (app) => { app.broker(broker) } })
      .onError(() => {})
      .onMetric((event) => { events.push(event) })
      .use(
        router().topic('devices/:uid/events', {
          timeout: 5,
          async onMessage() {
            await new Promise<void>((resolve) => { release = resolve })
          },
        }),
      )

    await app.listen()
    await broker.dispatch({
      topic: 'devices/abc/events',
      payload: Buffer.from('x'),
      clientId: 'c1',
    })
    release()

    expect(events).toHaveLength(1)
    const ev = events[0]
    expect(ev.type === 'dispatch' && ev.errorPhase).toBe('timeout')
  })

  test('app.publish 成功/失败各发 publish 指标', async () => {
    const broker = new TestBroker()
    const events: MqttMetricEvent[] = []
    const app = new MqttApp()
      .use({ setup: (app) => { app.broker(broker) } })
      .onMetric((event) => { events.push(event) })
      .use(router().topic('server/:uid/notif'))

    await app.listen()
    await app.publish('server/abc/notif', 'hello')

    broker.failPublish = true
    await expect(app.publish('server/abc/notif', 'oops')).rejects.toThrow('broker rejected')

    expect(events.map((e) => `${e.type}:${e.result}`)).toEqual([
      'publish:ok',
      'publish:error',
    ])
  })

  test('metric handler 抛错不会影响后续 handler 也不会破坏 dispatch', async () => {
    const broker = new TestBroker()
    const captured: string[] = []
    const app = new MqttApp()
      .use({ setup: (app) => { app.broker(broker) } })
      .onMetric(() => { throw new Error('first metric blew up') })
      .onMetric((event) => { captured.push(event.type) })
      .use(router().topic('a', { onMessage() {} }))

    await app.listen()
    const handled = await broker.dispatch({
      topic: 'a',
      payload: Buffer.from(''),
      clientId: 'c1',
    })
    expect(handled).toBe(true)
    expect(captured).toEqual(['dispatch'])
  })
})
