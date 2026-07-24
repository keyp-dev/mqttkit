# mqttkit: Elysia-style application framework for MQTT

> An ordered middleware pipeline, typed topic routes, MQTT 5 RPC, and auto-generated AsyncAPI docs — sitting on top of any MQTT broker.

If you've ever built a serious MQTT backend in Node, you've probably written this code at least once:

```ts
client.on('message', (topic, payload) => {
  if (topic.startsWith('devices/') && topic.endsWith('/events')) {
    const uid = topic.split('/')[1]
    // ad-hoc auth check
    // ad-hoc JSON.parse + validation
    // ad-hoc error handling
    // ad-hoc metrics
    // ...
  } else if (topic.startsWith('server/')) {
    // ...
  }
})
```

That's the MQTT equivalent of writing an HTTP server with `http.createServer((req, res) => { if (req.url === '/users') ... })`. We solved that pattern for HTTP a decade ago with Express, Koa, Fastify, and more recently Hono and Elysia. **For MQTT, we haven't.**

That's the gap [`mqttkit`](https://github.com/keyp/mqttkit) is filling.

## The design choice: don't reimplement the protocol

There are already excellent MQTT brokers in the Node ecosystem — most notably [Aedes](https://github.com/moscajs/aedes), which handles CONNECT, SUBSCRIBE, PUBLISH, QoS, retain, sessions, persistence, and MQTT-over-WebSocket. EMQX and Mosquitto cover production scale. None of these need replacing.

What's missing is the **application layer** — the part where you ask:

- How do I declaratively say "this topic requires this auth check"?
- How do I validate payloads with the same schema I already use for HTTP?
- How do I do MQTT 5 request/response without writing correlation-id bookkeeping?
- How do I get AsyncAPI docs for free?
- How do I attach Prometheus / OpenTelemetry without lifting broker internals?

mqttkit is purely that layer. It plugs into Aedes via `@mqttkit/aedes`, but the broker is just an adapter — you can write your own for EMQX, NanoMQ, or any other broker.

## What the code looks like

```ts
import { aedes } from '@mqttkit/aedes'
import { MqttApp, router } from '@mqttkit/core'
import { z } from 'zod'

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
        schema: { body: z.object({ temperature: z.number() }) },
        timeout: 1_000,
        concurrency: 100,
        async onMessage(ctx) {
          // ctx.params.uid: string
          // ctx.body.temperature: number  (validated, typed)
          await ctx.publish(`server/${ctx.params.uid}/ack`, 'ok')
        },
      }),
  )

await app.listen()
```

If you've written Elysia or Hono, the muscle memory transfers directly: `use()`, ordered middleware, generic-driven type inference, plugin composition.

## The features that actually save time

### 1. Topic params + Standard Schema validation

```ts
router().topic('devices/:uid/events', {
  schema: { body: z.object({ temperature: z.number() }) },
  async onMessage(ctx) {
    ctx.params.uid          // string, from the topic pattern
    ctx.body.temperature    // number, validated, typed
  },
})
```

Any [Standard Schema](https://standardschema.dev/) validator works — zod, valibot, arktype. No mqttkit-specific schema dialect to learn.

### 2. Publish / subscribe policies as data, not callbacks scattered in `authorizePublish`

```ts
.topic('devices/:uid/events', {
  publish:   ({ params, principal }) => params.uid === principal?.uid,
  subscribe: ({ params, principal }) => params.uid === principal?.uid,
})
```

Reads like a route definition, runs at the right phase. No more grepping for `aedes.authorizePublish` across the codebase.

### 3. MQTT 5 RPC with retries

```ts
const reply = await app.request('devices/alpha/cmd', 'reboot', {
  timeout: 500,
  retries: 2,
  retryDelay: 20,
})
```

Correlation data, response topic, timeout, retry — all handled. On the device side, `ctx.reply(...)` does the inverse.

### 4. Per-route guardrails

```ts
.topic('expensive/op', {
  timeout: 1_000,          // RpcTimeoutError-style fail-fast
  concurrency: 100,        // overload protection per route
  onError: ({ error }) => metrics.routeFailures.inc(),
  async onMessage(ctx) { /* ... */ },
})
```

Timeouts and concurrency caps come out of the box and surface as named `onError` phases (`timeout`, `overload`, `validation`, `policy`, `handler`, `middleware`, `publish`).

### 5. AsyncAPI 3.0 docs for free

```ts
import { asyncapi } from '@mqttkit/asyncapi'

app.use(asyncapi({
  info: { title: 'My IoT API', version: '1.0.0' },
  http: { port: 9000 },     // browsable docs at :9000
}))
```

Your topic routes are already declarative — mqttkit just walks them and emits AsyncAPI 3.0. If you use `@mqttkit/zod` or `@mqttkit/typebox`, the JSON Schema for payloads is included too.

### 6. Structured metrics for Prometheus / OTel

```ts
app.onMetric((evt) => {
  // evt.kind: 'dispatch' | 'publish'
  // evt.route, evt.topic, evt.durationMs, evt.outcome
  prometheus.observe(evt)
})
```

No monkey-patching the broker, no wrapping handlers. The framework already knows when a dispatch starts and ends.

### 7. Shared subscriptions, lifecycle events, server-side publish

```ts
router().topic('$share/workers/jobs/+/run', { /* multi-instance fan-out */ })

app.on('client.connect', ({ clientId }) => audit.log('connect', clientId))
app.publish('server/broadcast', JSON.stringify({ shutdown: true }))
```

### 8. In-memory `TestBroker` for unit tests

```ts
import { createTestApp } from '@mqttkit/core/testing'

const { app, broker } = createTestApp()
// no TCP, no sockets, dispatch goes through the same pipeline
```

Tests run in milliseconds against the real middleware / router / RPC code paths.

## When mqttkit fits — and when it doesn't

**Fits well when:**

- You're building an IoT backend, a device telemetry pipeline, a real-time game server, or any MQTT-driven app in TypeScript.
- You want auth / validation / metrics / docs without writing them five times.
- You like the Elysia / Hono / Fastify mental model.
- You're on Bun (first-class) or Node 20+.

**Probably overkill when:**

- You need a 100k-connection broker — use EMQX or NanoMQ directly; mqttkit is for the app layer, not the broker tier.
- You're writing a five-line bridge script — `mqtt.js` is fine.

## Installation

```bash
bun add @mqttkit/core @mqttkit/aedes aedes
# or
npm install @mqttkit/core @mqttkit/aedes aedes
```

The packages:

- `@mqttkit/core` — app, router, middleware, RPC, testing broker
- `@mqttkit/aedes` — Aedes adapter (TCP + WebSocket)
- `@mqttkit/asyncapi` — AsyncAPI 3.0 generator
- `@mqttkit/typebox`, `@mqttkit/zod` — schema helpers

## Try it

- **Docs:** <https://mqttkit.keyp.dev>
- **Repo:** <https://github.com/keyp/mqttkit>
- **Examples:** [`examples/`](https://github.com/keyp/mqttkit/tree/main/examples) — aedes-basic, aedes-ws, asyncapi-docs, asyncapi-elysia, custom-logger, events, kafka-bridge, metrics-prometheus, rpc, schema-validation, service-push.

Feedback, issues, and PRs welcome. If you've built MQTT backends and felt the pain this is trying to solve, I'd love to hear what's missing.

---

*mqttkit is MIT-licensed and built for Bun + TypeScript. Star the [repo](https://github.com/keyp/mqttkit) if it looks useful — that's the cheapest way to help.*
