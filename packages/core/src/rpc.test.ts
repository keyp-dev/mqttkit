import { describe, expect, test } from 'bun:test'
import { MqttApp, router, toPayloadBuffer } from './index.js'
import type {
  BrokerMessage,
  BrokerStartOptions,
  MqttBrokerAdapter,
  MqttPayload,
  PublishOptions,
} from './index.js'

class TestBroker implements MqttBrokerAdapter {
  started?: BrokerStartOptions
  published: Array<{ topic: string; payload: Buffer; options?: PublishOptions }> = []
  onPublish?: (entry: { topic: string; payload: Buffer; options?: PublishOptions }) => void

  start(options: BrokerStartOptions): void {
    this.started = options
  }

  stop(): void {}

  async publish(topic: string, payload: MqttPayload, options?: PublishOptions) {
    const entry = { topic, payload: toPayloadBuffer(payload), options }
    this.published.push(entry)
    this.onPublish?.(entry)
    return { topic }
  }

  async dispatch(message: BrokerMessage) {
    if (!this.started) throw new Error('broker is not started')
    return this.started.dispatch(message)
  }
}

describe('RPC (MQTT 5 request/response)', () => {
  test('app.request 在收到带 correlationData 的响应后 resolve', async () => {
    const broker = new TestBroker()
    const app = new MqttApp().use({ setup: (app) => { app.broker(broker) } })
    await app.listen()

    // 当 app 把请求发到设备 topic 时，让 broker 模拟设备回复 responseTopic。
    broker.onPublish = (entry) => {
      if (entry.topic !== 'devices/x/cmd') return
      const properties = entry.options?.properties
      if (!properties?.responseTopic || !properties.correlationData) return
      queueMicrotask(() => {
        void broker.dispatch({
          topic: properties.responseTopic!,
          payload: Buffer.from('pong'),
          clientId: 'device-x',
          packet: { properties: { correlationData: properties.correlationData } },
        })
      })
    }

    const response = await app.request('devices/x/cmd', 'ping', { timeout: 500 })
    expect(response.payload.toString()).toBe('pong')
    expect(response.topic.startsWith('_rpc/replies/')).toBe(true)
  })

  test('app.request 在超时后 reject', async () => {
    const broker = new TestBroker()
    const app = new MqttApp().use({ setup: (app) => { app.broker(broker) } })
    await app.listen()

    await expect(app.request('devices/x/cmd', 'ping', { timeout: 30 })).rejects.toThrow(/timed out/i)
  })

  test('app.stop 会取消所有 pending RPC', async () => {
    const broker = new TestBroker()
    const app = new MqttApp().use({ setup: (app) => { app.broker(broker) } })
    await app.listen()

    const pending = app.request('devices/x/cmd', 'ping', { timeout: 5_000 })
    // 等到 request 已经把 pending 注册进 RpcManager（publish 调用进入 microtask 队列后）。
    await new Promise((resolve) => setImmediate(resolve))
    await app.stop()
    await expect(pending).rejects.toThrow(/stopping/i)
  })

  test('ctx.reply 把响应发到 packet.responseTopic 并回传 correlationData', async () => {
    const broker = new TestBroker()
    const app = new MqttApp()
      .use({ setup: (app) => { app.broker(broker) } })
      .use(
        router().topic('devices/:uid/cmd', {
          async onMessage(ctx) {
            await ctx.reply(`hello ${ctx.params.uid}`)
          },
        }),
      )

    await app.listen()

    const correlation = Buffer.from('corr-1', 'utf8')
    const handled = await broker.dispatch({
      topic: 'devices/demo/cmd',
      payload: Buffer.from('ping'),
      clientId: 'device-demo',
      packet: {
        properties: {
          responseTopic: '_rpc/replies/abc',
          correlationData: correlation,
        },
      },
    })

    expect(handled).toBe(true)
    expect(broker.published).toHaveLength(1)
    const entry = broker.published[0]
    expect(entry.topic).toBe('_rpc/replies/abc')
    expect(entry.payload.toString()).toBe('hello demo')
    const echoed = entry.options?.properties?.correlationData
    expect(echoed).toBeDefined()
    expect(Buffer.isBuffer(echoed) ? echoed.toString('utf8') : String(echoed)).toBe('corr-1')
  })

  test('ctx.reply 在 packet 没有 responseTopic 时抛错', async () => {
    const broker = new TestBroker()
    let captured: unknown
    const app = new MqttApp()
      .use({ setup: (app) => { app.broker(broker) } })
      .onError((payload) => {
        captured = payload.error
      })
      .use(
        router().topic('devices/:uid/cmd', {
          async onMessage(ctx) {
            await ctx.reply('whatever')
          },
        }),
      )

    await app.listen()
    await broker.dispatch({
      topic: 'devices/demo/cmd',
      payload: Buffer.from('ping'),
      clientId: 'device-demo',
    })

    expect(captured).toBeInstanceOf(Error)
    expect((captured as Error).message).toMatch(/responseTopic/)
  })

  test('request + ctx.reply 端到端往返', async () => {
    const broker = new TestBroker()
    const app = new MqttApp()
      .use({ setup: (app) => { app.broker(broker) } })
      .use(
        router().topic('devices/:uid/cmd', {
          async onMessage(ctx) {
            await ctx.reply(`echo:${ctx.payload.toString()}`)
          },
        }),
      )

    // 在 broker 收到 PUBLISH 时，模拟它把同一份 packet 推回 dispatch。
    broker.onPublish = (entry) => {
      const properties = entry.options?.properties
      queueMicrotask(() => {
        void broker.dispatch({
          topic: entry.topic,
          payload: entry.payload,
          clientId: 'loopback',
          packet: properties ? { properties } : undefined,
        })
      })
    }

    await app.listen()
    const response = await app.request('devices/demo/cmd', 'ping', { timeout: 500 })
    expect(response.payload.toString()).toBe('echo:ping')
  })
})
