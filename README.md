# mqttkit

[简体中文](README.zh-CN.md)

Build MQTT applications with an Elysia-like API: compose broker adapters, ordered middleware, topic routers, authentication, lifecycle events, and business services with `new MqttApp().use(...).use(router(...))`.

mqttkit does not reimplement the MQTT protocol. A broker such as Aedes owns CONNECT, SUBSCRIBE, PUBLISH, QoS, retain, sessions, persistence, and MQTT-over-WebSocket. mqttkit adds an application framework layer on top.

Full documentation: **<https://mqttkit.keyp.dev>** ([简体中文](https://mqttkit.keyp.dev/zh/))

## Features

- Ordered `use()` middleware for auth, logging, audit, validation, and interception.
- `router().topic()` declares MQTT topic routes with publish / subscribe policies.
- Topic params (`devices/:uid/events`), payload validation via any [Standard Schema](https://standardschema.dev/) validator, and injected services on `ctx`.
- MQTT 5 RPC with `app.request()` and `ctx.reply()`.
- MQTT 5 shared subscriptions (`$share/<group>/<filter>`) for multi-instance fan-out.
- Per-route `timeout` and `concurrency` guards surface as `onError` phases.
- `app.onMetric()` emits structured per-dispatch / per-publish events for Prometheus / OpenTelemetry.
- `app.on()` observes broker lifecycle events; `app.publish()` lets workers push messages.
- Adapters: `@mqttkit/aedes` (TCP + WebSocket) and `@mqttkit/asyncapi` (AsyncAPI 3.0 docs).
- In-memory `TestBroker` for unit tests. Built for Bun and TypeScript.

## Installation

```bash
bun add @mqttkit/core @mqttkit/aedes aedes
```

## Quick Start

```ts
import { aedes } from '@mqttkit/aedes'
import { MqttApp, router } from '@mqttkit/core'

const app = new MqttApp<{ principal?: { uid: string } }>()
  .use(
    aedes({
      tcp: { port: 1883 },
      ws: { port: 8888, path: '/mqtt' },
      authenticate({ clientId, username }) {
        if (!username) return false
        return { uid: username || clientId }
      },
    }),
  )
  .use(
    router<{ principal?: { uid: string } }>()
      .topic('devices/:uid/events', {
        publish: ({ params, principal }) => params.uid === principal?.uid,
        async onMessage(ctx) {
          await ctx.publish(`server/${ctx.params.uid}/echo`, ctx.payload, { qos: 0 })
        },
      })
      .topic('server/:uid/echo', {
        subscribe: ({ params, principal }) => params.uid === principal?.uid,
      }),
  )

await app.listen()
```

## Schema Validation

`topic({ schema })` accepts any [Standard Schema](https://standardschema.dev/) validator (zod, valibot, arktype, …). The validated payload is exposed on `ctx.body` with full type inference.

```ts
import { z } from 'zod'

router().topic('devices/:uid/events', {
  schema: { body: z.object({ temperature: z.number() }) },
  async onMessage(ctx) {
    ctx.body.temperature // typed as number
  },
})
```

Use [`@mqttkit/typebox`](https://mqttkit.keyp.dev/schema) for raw TypeBox or [`@mqttkit/zod`](https://mqttkit.keyp.dev/schema) to attach a JSON Schema so `@mqttkit/asyncapi` can emit the full payload.

See the [Getting Started guide](https://mqttkit.keyp.dev/getting-started) for routers, middleware, events, RPC, Kafka bridging, and more.

## Packages

- `@mqttkit/core`: application, router, middleware, context, schema validation, RPC, event types, broker adapter interface, and `@mqttkit/core/testing` in-memory broker.
- `@mqttkit/aedes`: Aedes adapter for TCP MQTT and MQTT-over-WebSocket (forwards MQTT 5 properties for RPC).
- `@mqttkit/asyncapi`: AsyncAPI 3.0 generator and HTTP plugin for browsable docs.
- `@mqttkit/typebox`: TypeBox schema provider — register once, then pass raw `Type.X(...)` schemas directly.
- `@mqttkit/zod`: zod helper that attaches a JSON Schema representation so AsyncAPI documents the full payload.

## Examples

Runnable examples under [`examples/`](./examples) cover the basic TCP / WebSocket broker, lifecycle events, service push, Kafka bridge, schema validation, MQTT 5 RPC, AsyncAPI docs (standalone HTTP or shared Elysia port), and Prometheus metrics.

```bash
bun install
bun run --cwd examples/aedes-basic dev
```

## Development

```bash
bun run test
bun run typecheck
bun run build
```
