# @mqttkit/asyncapi

mqttkit 的 AsyncAPI 3.0 文档生成器与 HTTP 插件。读取 `MqttRouter` 路由元数据生成 AsyncAPI 文档，通过 HTTP 同时提供 JSON、YAML 和可浏览的文档页面。

## 安装

```bash
bun add @mqttkit/core @mqttkit/asyncapi
```

## 使用

```ts
import { aedes } from '@mqttkit/aedes'
import { asyncapi } from '@mqttkit/asyncapi'
import { MqttApp, router } from '@mqttkit/core'

const app = new MqttApp()
  .use(aedes({ tcp: { port: 1883 } }))
  .use(
    router()
      .topic('devices/:uid/events', {
        qos: 1,
        schema: {
          type: 'object',
          required: ['temperature'],
          properties: { temperature: { type: 'number' } },
        },
        async onMessage(ctx) {
          console.log(ctx.params.uid, ctx.payload.toString())
        },
        meta: {
          summary: '设备遥测上报',
          description: '所属用户上报设备遥测数据。',
          tags: ['device'],
        },
      }),
  )
  .use(
    asyncapi({
      info: { title: 'mqttkit demo', version: '0.1.0' },
      servers: { tcp: { host: 'localhost:1883', protocol: 'mqtt' } },
      port: 9000,
    }),
  )

await app.listen()
// http://localhost:9000/docs
// http://localhost:9000/asyncapi.json
// http://localhost:9000/asyncapi.yaml
```

## 路由注解约定

插件读取 `TopicConfig` 的以下字段：

| 字段           | 映射到                                       |
| -------------- | -------------------------------------------- |
| `schema`       | `messages.<id>.payload`（JSON Schema）       |
| `qos`          | `bindings.mqtt.qos`                          |
| `retain`       | `bindings.mqtt.retain`                       |
| `publish`      | 非 `false` 时生成 `send` 操作                |
| `subscribe`    | 非 `false` 时生成 `receive` 操作             |
| `meta.summary`     | 操作 summary                             |
| `meta.description` | channel 描述                             |
| `meta.tags`        | channel 标签                             |
| `meta.examples`    | 消息示例                                 |
| `meta.message.name` / `meta.message.contentType` | 消息 ID 与 contentType |

## 插件参数

```ts
asyncapi({
  info: { title, version, description? },    // 必填
  servers?: { [id]: { host, protocol, description? } },
  prefix?: '/api',                            // URL 前缀
  port?: 9000,                                // 未传 `server` 时自起 HTTP server
  host?: '127.0.0.1',
  server?: existingHttpServer,                // 附加到已有的 http.Server
})
```

## 接到已有 HTTP 框架

如果不想让插件单独起 HTTP 端口，可以用 `createAsyncApiHandlers` 拿到 path 与带缓存的 body builder，挂到 Elysia、Hono、Express、Fastify 等任何框架。

```ts
import { aedes } from '@mqttkit/aedes'
import { createAsyncApiHandlers } from '@mqttkit/asyncapi'
import { MqttApp, router } from '@mqttkit/core'
import { Elysia } from 'elysia'

const mqttApp = new MqttApp()
  .use(aedes({ tcp: { port: 1883 } }))
  .use(router().topic('devices/:uid/events', { /* ... */ }))

await mqttApp.listen()

const docs = createAsyncApiHandlers(mqttApp, {
  info: { title: 'mqttkit', version: '0.1.0' },
  servers: { tcp: { host: 'localhost:1883', protocol: 'mqtt' } },
  prefix: '/docs/mqtt',
})

new Elysia()
  .get(docs.paths.json, ({ set }) => {
    set.headers['content-type'] = 'application/json; charset=utf-8'
    return docs.json()
  })
  .get(docs.paths.yaml, ({ set }) => {
    set.headers['content-type'] = 'application/yaml; charset=utf-8'
    return docs.yaml()
  })
  .get(docs.paths.docs, ({ set }) => {
    set.headers['content-type'] = 'text/html; charset=utf-8'
    return docs.html()
  })
  .listen(3000)
```

`docs.paths` 会得到 `{ json: '/docs/mqtt/asyncapi.json', yaml: '/docs/mqtt/asyncapi.yaml', docs: '/docs/mqtt/docs' }`。运行时新增路由后调用 `docs.invalidate()` 触发重建。

### 与 MQTT-over-WebSocket 共用同一端口

如果希望**用同一个 HTTP 端口**既提供 docs，又提供 MQTT-over-WebSocket，让 `aedes` 复用已有的 `http.Server`，再把 Elysia 的 `handle(Request)` 桥接到这个 server 上即可。可运行版本见 `examples/asyncapi-elysia`：

```ts
import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { aedes } from '@mqttkit/aedes'
import { createAsyncApiHandlers } from '@mqttkit/asyncapi'
import { MqttApp } from '@mqttkit/core'
import { Elysia } from 'elysia'

const httpServer = createServer()

const mqttApp = new MqttApp()
  .use(aedes({
    tcp: { port: 1883 },
    ws: { server: httpServer, path: '/mqtt' }, // 复用同一个 http.Server
  }))
  // ... routers
await mqttApp.listen()

const docs = createAsyncApiHandlers(mqttApp, { /* ... */ })

const elysia = new Elysia()
  .get(docs.paths.docs, ({ set }) => { set.headers['content-type']='text/html'; return docs.html() })
  .get(docs.paths.json, ({ set }) => { set.headers['content-type']='application/json'; return docs.json() })

httpServer.on('request', async (req, res) => {
  const url = `http://${req.headers.host}${req.url}`
  const body = req.method && req.method !== 'GET' && req.method !== 'HEAD'
    ? (Readable.toWeb(req) as unknown as ReadableStream)
    : null
  const response = await elysia.handle(new Request(url, {
    method: req.method, headers: req.headers as any, body, duplex: 'half',
  } as RequestInit))
  res.statusCode = response.status
  response.headers.forEach((v, k) => res.setHeader(k, v))
  if (response.body) for await (const chunk of response.body as any) res.write(chunk)
  res.end()
})

httpServer.listen(3300)
// mqtt:    mqtt://localhost:1883     (TCP)
//          ws://localhost:3300/mqtt  (MQTT-over-WS，和 docs 同端口)
// docs:    http://localhost:3300/docs/mqtt/docs
```

## 编程式接口

```ts
import { buildAsyncApi, renderAsyncApiHtml } from '@mqttkit/asyncapi'

const doc = buildAsyncApi(app, { info: { title: 'docs', version: '1.0.0' } })
const html = renderAsyncApiHtml(doc, '/asyncapi.json')
```

## 备注

- 文档页面通过 CDN 加载 `@asyncapi/react-component`，离线环境请直接消费 JSON 或 YAML 端点。
- 生成的文档符合 AsyncAPI 3.0，可被 `@asyncapi/parser` 校验通过。
