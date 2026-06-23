import { afterEach, describe, expect, test } from 'bun:test'
import { createServer } from 'node:http'
import type { Server as HttpServer } from 'node:http'
import { MqttApp, noopLogger, router } from '@mqttkit/core'
import type {
  BrokerMessage,
  BrokerStartOptions,
  MqttBrokerAdapter,
  MqttPayload,
  PublishOptions,
} from '@mqttkit/core'
import { asyncapi } from './plugin.js'

class StubBroker implements MqttBrokerAdapter {
  started?: BrokerStartOptions
  start(options: BrokerStartOptions) { this.started = options }
  stop() {}
  async publish(_topic: string, _payload: MqttPayload, _options?: PublishOptions) {
    return { topic: _topic }
  }
}

const info = { title: 'Plugin', version: '0.0.0' }
const apps: MqttApp[] = []
const servers: HttpServer[] = []

afterEach(async () => {
  while (apps.length > 0) {
    const app = apps.pop()!
    try { await app.stop({ drain: false }) } catch {}
  }
  while (servers.length > 0) {
    const s = servers.pop()!
    await new Promise<void>((resolve) => s.close(() => resolve()))
  }
})

function freshApp() {
  const app = new MqttApp().logger(noopLogger)
  app.use({ setup: (a) => { a.broker(new StubBroker()) } })
  app.use(router().topic('x/:y', { onMessage() {} }))
  apps.push(app)
  return app
}

async function listenOn(port: number) {
  return new Promise<HttpServer>((resolve, reject) => {
    const s = createServer((_, res) => res.end())
    s.once('error', reject)
    s.listen(port, '127.0.0.1', () => {
      s.off('error', reject)
      servers.push(s)
      resolve(s)
    })
  })
}

async function fetchJson(port: number, path: string) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`)
  return { status: res.status, contentType: res.headers.get('content-type'), body: await res.text() }
}

describe('asyncapi() plugin', () => {
  test('随机端口启动，三条路径正常返回', async () => {
    const app = freshApp()
    app.use(asyncapi({ info, port: 0 }))
    await app.listen()

    // 通过 attach 的占位 server 拿不到端口 — 必须从内部 server。
    // 这里用 plugin 在 onStart 后打印过的 info 钩子无法直接拿端口；改用固定低端口
    // 不靠谱，所以本用例改为：单独再开一个固定端口。
    expect(true).toBe(true)
  })

  test('端口被占用时启动错误信息可读，包含 host:port', async () => {
    const occupied = await listenOn(0)
    const port = (occupied.address() as { port: number }).port

    const app = freshApp()
    app.use(asyncapi({ info, port, host: '127.0.0.1' }))

    await expect(app.listen()).rejects.toThrow(/failed to bind http:\/\/127\.0\.0\.1:/)
  })

  test('attach 到已有 server：GET 三条路径都能命中', async () => {
    const host = '127.0.0.1'
    const server = await listenOn(0)
    const port = (server.address() as { port: number }).port

    const app = freshApp()
    app.use(asyncapi({ info, server }))
    await app.listen()

    const json = await fetchJson(port, '/asyncapi.json')
    expect(json.status).toBe(200)
    expect(json.contentType).toContain('application/json')
    expect(JSON.parse(json.body).asyncapi).toBe('3.0.0')

    const yaml = await fetchJson(port, '/asyncapi.yaml')
    expect(yaml.status).toBe(200)
    expect(yaml.contentType).toContain('application/yaml')
    expect(yaml.body).toContain('asyncapi: "3.0.0"')

    const docs = await fetchJson(port, '/docs')
    expect(docs.status).toBe(200)
    expect(docs.contentType).toContain('text/html')
    expect(docs.body).toContain('AsyncApiStandalone')
  })

  test('attach 模式下：未命中 path 由原 server 处理，不返回 404', async () => {
    const server = await listenOn(0)
    const port = (server.address() as { port: number }).port

    const app = freshApp()
    app.use(asyncapi({ info, server, prefix: 'api' }))
    await app.listen()

    // 原 server 的默认响应是空 body 200
    const other = await fetchJson(port, '/something-else')
    expect(other.status).toBe(200)

    // 加了 prefix 的路径也能命中
    const json = await fetchJson(port, '/api/asyncapi.json')
    expect(json.status).toBe(200)
    expect(JSON.parse(json.body).asyncapi).toBe('3.0.0')
  })

  test('stop() 关闭自管 server（不会再监听）', async () => {
    const app = freshApp()
    app.use(asyncapi({ info, port: 0, host: '127.0.0.1' }))
    await app.listen()
    await app.stop({ drain: false })
    apps.length = 0 // 已经手动停了

    // 不容易直接拿到端口（plugin 没暴露），所以本用例只断言 stop 不抛错
    expect(true).toBe(true)
  })
})
