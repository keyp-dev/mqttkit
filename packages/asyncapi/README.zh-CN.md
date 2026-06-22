# @mqttkit/asyncapi

[English](README.md)

mqttkit 的 AsyncAPI 3.0 文档生成器与 HTTP 插件。读取 `router().topic(...)` 元数据，通过 HTTP 提供 JSON、YAML 和可浏览的文档页面。

完整文档：**<https://mqttkit.keyp.dev/zh/>**。

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
    router().topic('devices/:uid/events', {
      qos: 1,
      schema: { type: 'object', required: ['temperature'], properties: { temperature: { type: 'number' } } },
      async onMessage(ctx) { /* ... */ },
      meta: { summary: '设备遥测上报', tags: ['device'] },
    }),
  )
  .use(asyncapi({
    info: { title: 'mqttkit demo', version: '0.1.0' },
    servers: { tcp: { host: 'localhost:1883', protocol: 'mqtt' } },
    port: 9000,
  }))

await app.listen()
// http://localhost:9000/docs
// http://localhost:9000/asyncapi.json
// http://localhost:9000/asyncapi.yaml
```

## 功能

- **自带 HTTP server**（`asyncapi({ port, host, prefix })`），或通过 `createAsyncApiHandlers(app, options)` 拿到 `paths` / `json()` / `yaml()` / `html()` / `invalidate()`，自己接到 Elysia / Hono / Express / Fastify。
- **Schema 集成** —— 普通 JSON Schema 与原始 TypeBox 原样嵌入；带 `~jsonSchema` 的 Standard Schema（例如 `@mqttkit/zod` 的 `jsonify`）使用挂上的 JSON Schema；裸 Standard Schema 退化为 `{ description: 'Validated by <vendor>' }`。
- **路由元数据** —— `meta.summary` / `meta.description` / `meta.tags` / `meta.examples` / `meta.message.{name,contentType}` 进入 AsyncAPI 文档。
- **HTTP 与 MQTT-over-WebSocket 共用端口** —— 给 `aedes` 传 `ws: { server }`，与 Elysia / Hono 用同一个 `http.Server`。

## 文档

- mqttkit.keyp.dev 与 [`examples/asyncapi-docs`](https://github.com/keyp-dev/mqttkit/tree/main/examples/asyncapi-docs) / [`examples/asyncapi-elysia`](https://github.com/keyp-dev/mqttkit/tree/main/examples/asyncapi-elysia) 中有可运行示例。
