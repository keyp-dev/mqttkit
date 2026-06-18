# @mqttkit/asyncapi

[简体中文](README.zh-CN.md)

AsyncAPI 3.0 documentation generator and HTTP plugin for mqttkit. Generates an AsyncAPI document from `MqttRouter` topics, then serves JSON, YAML, and a browsable docs page over HTTP.

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
          summary: 'Device telemetry uplink',
          description: 'Owner publishes telemetry events.',
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

## Route Annotations

The plugin reads the following `TopicConfig` fields:

| Field        | Maps to                                  |
| ------------ | ---------------------------------------- |
| `schema`     | `messages.<id>.payload` (JSON Schema)    |
| `qos`        | `bindings.mqtt.qos`                      |
| `retain`     | `bindings.mqtt.retain`                   |
| `publish`    | adds `send` operation when not `false`   |
| `subscribe`  | adds `receive` operation when not `false`|
| `meta.summary`     | operation summary                  |
| `meta.description` | channel description                |
| `meta.tags`        | channel tags                       |
| `meta.examples`    | message examples                   |
| `meta.message.name` / `meta.message.contentType` | message id and content type |

## Plugin Options

```ts
asyncapi({
  info: { title, version, description? },     // required
  servers?: { [id]: { host, protocol, description? } },
  prefix?: '/api',                            // optional URL prefix
  port?: 9000,                                // when no `server` provided
  host?: '127.0.0.1',
  server?: existingHttpServer,                // attach to existing http.Server
})
```

## Mount on an existing HTTP framework

Skip the bundled HTTP server entirely. `createAsyncApiHandlers` returns paths and cached body builders that you can wire into Elysia, Hono, Express, Fastify, or any other framework.

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

`docs.paths` resolves to `{ json: '/docs/mqtt/asyncapi.json', yaml: '/docs/mqtt/asyncapi.yaml', docs: '/docs/mqtt/docs' }`. Call `docs.invalidate()` to rebuild after adding more routers at runtime.

### Share one port with MQTT-over-WebSocket

If you want **a single HTTP port** to serve both the docs and MQTT-over-WebSocket, give `aedes` an existing `http.Server` and bridge Elysia's `handle(Request)` into the same server. See `examples/asyncapi-elysia` for the runnable version:

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
    ws: { server: httpServer, path: '/mqtt' }, // attach to the same server
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
//          ws://localhost:3300/mqtt  (MQTT-over-WS, same port as docs)
// docs:    http://localhost:3300/docs/mqtt/docs
```

## Programmatic API

```ts
import { buildAsyncApi, renderAsyncApiHtml } from '@mqttkit/asyncapi'

const doc = buildAsyncApi(app, { info: { title: 'docs', version: '1.0.0' } })
const html = renderAsyncApiHtml(doc, '/asyncapi.json')
```

## Notes

- The docs HTML page loads `@asyncapi/react-component` from a CDN. Use the JSON or YAML endpoint if your environment is offline.
- The generated document conforms to AsyncAPI 3.0 and validates with `@asyncapi/parser`.
