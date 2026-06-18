import { afterEach, describe, expect, test } from 'bun:test'
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { connectAsync, type MqttClient } from 'mqtt'
import { MqttApp, router, type MqttAppState } from '@mqttkit/core'
import { AedesBrokerAdapter, aedes } from './index.js'

const cleanup: Array<() => Promise<void>> = []
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

afterEach(async () => {
  while (cleanup.length > 0) {
    await withTimeout(cleanup.pop()?.() ?? Promise.resolve(), 1_000)
  }
})

describe('@mqttkit/aedes', () => {
  test('mqtt.js TCP client publish 会进入 mqttkit route 并提取 params', async () => {
    const adapter = new AedesBrokerAdapter({ tcp: { port: 0 }, ws: false })
    let seen: { uid: string; payload: string; principal?: unknown } | undefined

    const app = new MqttApp<{ principal?: { kind: string }; services?: Record<string, unknown> }>()
      .use({ setup: (app) => { app.broker(adapter) } })
      .use(
        router<{ principal?: { kind: string }; services?: Record<string, unknown> }>().topic('devices/:uid/events', {
          onMessage(ctx) {
            seen = {
              uid: ctx.params.uid,
              payload: ctx.payload.toString(),
              principal: ctx.principal,
            }
          },
        }),
      )

    await app.listen()
    cleanup.push(() => stopApp(app))

    const client = await connectMqtt(`mqtt://127.0.0.1:${adapter.getTcpAddress()?.port}`, {
      clientId: 'device-demo',
    })
    cleanup.push(() => endClient(client))

    await client.publishAsync('devices/demo/events', 'hello', { qos: 0 })
    await waitFor(() => seen !== undefined)

    expect(seen).toEqual({
      uid: 'demo',
      payload: 'hello',
      principal: undefined,
    })
  })

  test('app.publish 会通过 Aedes 发给已订阅的 MQTT client', async () => {
    const adapter = new AedesBrokerAdapter({ tcp: { port: 0 }, ws: false })
    const app = new MqttApp()
      .use({ setup: (app) => { app.broker(adapter) } })
      .use(router().topic('server/:uid/commands'))

    await app.listen()
    cleanup.push(() => stopApp(app))

    const client = await connectMqtt(`mqtt://127.0.0.1:${adapter.getTcpAddress()?.port}`, {
      clientId: 'server-demo',
    })
    cleanup.push(() => endClient(client))

    await client.subscribeAsync('server/demo/commands')
    const message = onceMessage(client, 'server/demo/commands')
    await app.publish('server/demo/commands', 'command', { qos: 0 })

    await expect(message).resolves.toBe('command')
  })

  test('middleware 可以拒绝 PUBLISH', async () => {
    const adapter = new AedesBrokerAdapter({ tcp: { port: 0 }, ws: false })
    let called = false

    const app = new MqttApp()
      .use({ setup: (app) => { app.broker(adapter) } })
      .use((_ctx, _next) => {
        throw new Error('blocked')
      })
      .use(router().topic('devices/:uid/events', { onMessage: () => { called = true } }))

    await app.listen()
    cleanup.push(() => stopApp(app))

    const client = await connectMqtt(`mqtt://127.0.0.1:${adapter.getTcpAddress()?.port}`, {
      clientId: 'blocked-client',
    })
    cleanup.push(() => endClient(client))

    await expect(withTimeout(client.publishAsync('devices/demo/events', 'payload', { qos: 1 }), 500)).rejects.toThrow()
    expect(called).toBe(false)
  })

  test('subscribe policy 可以拒绝订阅', async () => {
    const adapter = new AedesBrokerAdapter({ tcp: { port: 0 }, ws: false })
    const app = new MqttApp()
      .use({ setup: (app) => { app.broker(adapter) } })
      .use(router().topic('private/:uid', { subscribe: ({ params, clientId }) => params.uid === clientId }))

    await app.listen()
    cleanup.push(() => stopApp(app))

    const client = await connectMqtt(`mqtt://127.0.0.1:${adapter.getTcpAddress()?.port}`, {
      clientId: 'bob',
    })
    cleanup.push(() => endClient(client))

    await expect(client.subscribeAsync('private/alice')).rejects.toThrow()
  })

  test('authenticate 返回的 principal 会进入 handler 和事件', async () => {
    const adapter = new AedesBrokerAdapter<{ uid: string }>({
      tcp: { port: 0 },
      ws: false,
      authenticate: ({ username }) => username ? { uid: username } : false,
    })
    const events: string[] = []
    let principal: { uid: string } | undefined

    const app = new MqttApp<{ principal?: { uid: string }; services?: Record<string, unknown> }>()
      .use({ setup: (app) => { app.broker(adapter) } })
      .on('client', (event) => {
        if (event.clientId) events.push(event.clientId)
      })
      .use(
        router<{ principal?: { uid: string }; services?: Record<string, unknown> }>().topic('devices/:uid/events', {
          onMessage(ctx) {
            principal = ctx.principal
          },
        }),
      )

    await app.listen()
    cleanup.push(() => stopApp(app))

    const client = await connectMqtt(`mqtt://127.0.0.1:${adapter.getTcpAddress()?.port}`, {
      clientId: 'auth-client',
      username: 'demo',
      password: 'secret',
    })
    cleanup.push(() => endClient(client))

    await client.publishAsync('devices/demo/events', 'hello')
    await waitFor(() => principal !== undefined)

    expect(principal).toEqual({ uid: 'demo' })
    expect(events).toContain('auth-client')
  })

  test('mqtt.js 可以通过标准 MQTT-over-WebSocket 使用同一个 router', async () => {
    const adapter = new AedesBrokerAdapter({ tcp: false, ws: { port: 0, path: '/mqtt' } })
    let payload: string | undefined
    const app = new MqttApp()
      .use({ setup: (app) => { app.broker(adapter) } })
      .use(router().topic('devices/:uid/events', { onMessage: (ctx) => { payload = ctx.payload.toString() } }))

    await app.listen()
    cleanup.push(() => stopApp(app))

    await publishWithNodeMqtt(`ws://127.0.0.1:${adapter.getWebSocketAddress()?.port}/mqtt`, 'devices/ws/events', 'from-ws')
    await waitFor(() => payload !== undefined)

    expect(payload).toBe('from-ws')
  })
})

async function connectMqtt(url: string, options: Parameters<typeof connectAsync>[1]): Promise<MqttClient> {
  return connectAsync(url, { reconnectPeriod: 0, ...options })
}

function onceMessage(client: MqttClient, topic: string): Promise<string> {
  return new Promise((resolve) => {
    client.on('message', (receivedTopic, payload) => {
      if (receivedTopic === topic) resolve(payload.toString())
    })
  })
}

async function endClient(client: MqttClient): Promise<void> {
  if (client.disconnected) return
  await client.endAsync(true)
}

async function stopApp<TState extends MqttAppState>(app: MqttApp<TState>): Promise<void> {
  await withTimeout(app.stop(), 1_000).catch(() => undefined)
}

async function waitFor(assertion: () => boolean, timeoutMs = 1_000): Promise<void> {
  const start = Date.now()

  while (!assertion()) {
    if (Date.now() - start > timeoutMs) throw new Error('Timed out waiting for condition')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => setTimeout(() => reject(new Error('Timed out')), timeoutMs)),
  ])
}

async function publishWithNodeMqtt(url: string, topic: string, payload: string): Promise<void> {
  const script = `
    const mqtt = require('mqtt')
    const client = mqtt.connect(${JSON.stringify(url)}, { clientId: 'node-ws-client', reconnectPeriod: 0 })
    client.on('connect', async () => {
      client.publish(${JSON.stringify(topic)}, ${JSON.stringify(payload)}, { qos: 0 }, (error) => {
        if (error) {
          console.error(error)
          process.exit(1)
          return
        }
        client.end(false, () => process.exit(0))
      })
    })
    client.on('error', (error) => {
      console.error(error)
      process.exit(1)
    })
    setTimeout(() => {
      console.error(new Error('Timed out in node mqtt ws helper'))
      process.exit(1)
    }, 2000)
  `

  await new Promise<void>((resolve, reject) => {
    const child = spawn('node', ['-e', script], {
      cwd: packageRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr || `node mqtt ws helper exited with ${code}`))
    })
  })
}
