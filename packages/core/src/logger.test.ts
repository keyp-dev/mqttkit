import { describe, expect, test } from 'bun:test'
import {
  MqttApp,
  type MqttLogger,
  consoleLogger,
  noopLogger,
  router,
  toPayloadBuffer,
} from './index.js'
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
  start(options: BrokerStartOptions): void { this.started = options }
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

type Entry = { level: 'debug' | 'info' | 'warn' | 'error'; message: string; meta?: Record<string, unknown> }

function recordingLogger(): { logger: MqttLogger; entries: Entry[] } {
  const entries: Entry[] = []
  const make = (level: Entry['level']) => (message: string, meta?: Record<string, unknown>) => {
    entries.push({ level, message, meta })
  }
  return { entries, logger: { debug: make('debug'), info: make('info'), warn: make('warn'), error: make('error') } }
}

describe('logger 钩子', () => {
  test('默认 logger 是 consoleLogger', () => {
    const app = new MqttApp()
    expect(app.getLogger()).toBe(consoleLogger)
  })

  test('app.logger(noopLogger) 切换实现', () => {
    const app = new MqttApp().logger(noopLogger)
    expect(app.getLogger()).toBe(noopLogger)
  })

  test('schema 校验失败 + 无 onError 时通过 logger.warn 报告', async () => {
    const broker = new TestBroker()
    const { logger, entries } = recordingLogger()
    const schema = {
      '~standard': {
        version: 1 as const,
        vendor: 'demo',
        validate: () => ({ issues: [{ message: 'bad', path: [] }] }),
      },
    }
    const app = new MqttApp()
      .logger(logger)
      .use({ setup: (a) => { a.broker(broker) } })
      .use(router().topic('x', { schema, onMessage() {} }))

    await app.listen()
    await broker.dispatch({ topic: 'x', payload: Buffer.from('{}'), clientId: 'c' })

    const warn = entries.find((e) => e.level === 'warn')
    expect(warn).toBeDefined()
    expect(warn?.message).toMatch(/Schema validation failed/)
    expect(warn?.meta).toEqual({ topic: 'x', phase: 'validation' })
  })

  test('metric handler 抛错 → logger.error 接住，但 dispatch 不受影响', async () => {
    const broker = new TestBroker()
    const { logger, entries } = recordingLogger()
    const app = new MqttApp()
      .logger(logger)
      .use({ setup: (a) => { a.broker(broker) } })
      .onMetric(() => { throw new Error('exporter broken') })
      .use(router().topic('x', { onMessage() {} }))

    await app.listen()
    const handled = await broker.dispatch({ topic: 'x', payload: Buffer.from('{}'), clientId: 'c' })
    expect(handled).toBe(true)

    const errs = entries.filter((e) => e.level === 'error')
    expect(errs.length).toBeGreaterThan(0)
    expect(errs[0]?.message).toBe('metric handler threw')
    expect(errs[0]?.meta?.error).toBeInstanceOf(Error)
  })

  test('drain 超时 → logger.warn 收到含 timeoutMs / inflight 的结构化告警', async () => {
    const broker = new TestBroker()
    const { logger, entries } = recordingLogger()
    let release!: () => void
    const hold = new Promise<void>((resolve) => { release = resolve })

    const app = new MqttApp()
      .logger(logger)
      .use({ setup: (a) => { a.broker(broker) } })
      .use(router().topic('hang/:id', { async onMessage() { await hold } }))

    await app.listen()
    const inflight = broker.dispatch({ topic: 'hang/1', payload: Buffer.from('x'), clientId: 'c' })
    // 让 handler 进入运行态
    await new Promise((r) => setTimeout(r, 5))
    await app.stop({ drain: true, timeout: 25 })

    const warn = entries.find((e) => e.level === 'warn' && e.message.includes('drain timed out'))
    expect(warn).toBeDefined()
    expect(warn?.meta?.timeoutMs).toBe(25)
    expect(warn?.meta?.inflight).toBeGreaterThan(0)

    release!()
    await inflight
  })

  test('onError handler 自身抛错 → logger.error 拿到链上错误', async () => {
    const broker = new TestBroker()
    const { logger, entries } = recordingLogger()
    const app = new MqttApp()
      .logger(logger)
      .use({ setup: (a) => { a.broker(broker) } })
      .onError(() => { throw new Error('handler exploded') })
      .use(router().topic('x', { onMessage() { throw new Error('boom') } }))

    await app.listen()
    await broker.dispatch({ topic: 'x', payload: Buffer.from('y'), clientId: 'c' })

    const err = entries.find((e) => e.level === 'error' && e.message === 'error handler threw')
    expect(err).toBeDefined()
    expect((err?.meta?.error as Error).message).toBe('handler exploded')
  })
})
