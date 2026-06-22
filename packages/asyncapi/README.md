# @mqttkit/asyncapi

[简体中文](README.zh-CN.md)

AsyncAPI 3.0 documentation generator and HTTP plugin for mqttkit. Reads `router().topic(...)` declarations and serves JSON, YAML, and a browsable docs page.

Full documentation: **<https://mqttkit.keyp.dev>**.

## Install

```bash
bun add @mqttkit/core @mqttkit/asyncapi
```

## Usage

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
      meta: { summary: 'Device telemetry uplink', tags: ['device'] },
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

## What's Included

- **Bundled HTTP server** (`asyncapi({ port, host, prefix })`) or **bring your own** via `createAsyncApiHandlers(app, options)` — exposes `paths`, `json()`, `yaml()`, `html()`, `invalidate()` for Elysia / Hono / Express / Fastify.
- **Schema integration** — plain JSON Schema and raw TypeBox are embedded as-is; Standard Schema with `~jsonSchema` (e.g. `@mqttkit/zod`'s `jsonify`) gets the attached JSON Schema; bare Standard Schema falls back to `{ description: 'Validated by <vendor>' }`.
- **Route metadata** — `meta.summary`, `meta.description`, `meta.tags`, `meta.examples`, `meta.message.{name,contentType}` flow into the AsyncAPI document.
- **Shared HTTP + MQTT-over-WebSocket port** by attaching `aedes({ ws: { server } })` to the same `http.Server` Elysia / Hono uses.

## Docs

- [Service integration / docs](https://mqttkit.keyp.dev) and [`examples/asyncapi-docs`](https://github.com/keyp-dev/mqttkit/tree/main/examples/asyncapi-docs) / [`examples/asyncapi-elysia`](https://github.com/keyp-dev/mqttkit/tree/main/examples/asyncapi-elysia) for runnable variants.
