# @mqttkit/core

[简体中文](README.zh-CN.md)

Elysia-like MQTT application framework for TypeScript.

`@mqttkit/core` provides the core application runtime: ordered middleware, topic router, typed context, service injection, lifecycle events, and the broker adapter interface. Use it with `@mqttkit/aedes` for TCP MQTT and MQTT-over-WebSocket, or implement your own adapter.

## Install

```bash
bun add @mqttkit/core
```

## Usage

```ts
import { aedes } from '@mqttkit/aedes'
import { MqttApp, router } from '@mqttkit/core'

const app = new MqttApp()
  .use(aedes({ tcp: { port: 1883 }, ws: { port: 8888, path: '/mqtt' } }))
  .use(async (ctx, next) => {
    console.log(ctx.clientId, ctx.topic)
    await next()
  })
  .use(
    router()
      .topic('devices/:uid/events', {
        async onMessage(ctx) {
          await ctx.publish(`server/${ctx.params.uid}/echo`, ctx.payload)
        },
      })
      .topic('server/:uid/echo'),
  )

await app.listen()
```

## Core API

- `new MqttApp()` creates an application runtime.
- `app.use(fn)` registers ordered middleware.
- `app.use(plugin)` installs plugins such as routers and broker adapters.
- `router().topic(pattern, config)` declares MQTT topic publish / subscribe policy.
- `app.decorate(key, value)` injects business services into `ctx.services`.
- `app.on(eventName, handler)` listens to broker lifecycle events.
- `app.publish(topic, payload, options)` publishes from the server side through the configured broker.

## Topic Pattern Syntax

Patterns use Elysia-style segments rather than MQTT wildcards:

| Segment | Meaning                                                                       |
| ------- | ----------------------------------------------------------------------------- |
| `foo`   | Literal segment. Must match exactly.                                          |
| `:name` | Named parameter. Matches one segment and exposes it as `ctx.params.name`.     |
| `*`     | Catch-all. Must be the last segment. Joined remainder lands in `ctx.params['*']`. |

```ts
router()
  .topic('devices/:uid/events')      // ctx.params.uid
  .topic('files/*')                  // ctx.params['*'] = 'a/b/c'
  .topic('users/:uid/inbox/*')       // both
```

MQTT wildcards `+` and `#` are **not** part of the pattern syntax — they would
be treated as literal characters. They are only recognised on the subscribing
client side: when a client subscribes to a topic containing `+` / `#`,
mqttkit matches it against route patterns without binding any `:name` parameter.
Subscription policies that depend on `params.uid` will therefore deny wildcard
subscriptions naturally.

```ts
// Pattern: 'devices/:uid/events'
// Client subscribes 'devices/+/events' → matched, params = {}
// Client subscribes 'devices/#'        → matched, params = {}
// Client subscribes 'devices/abc/x'    → no match
```

## Schema Validation

`topic({ schema })` accepts any [Standard Schema v1](https://standardschema.dev/) validator (zod ≥3.24, valibot ≥1, arktype, …). Validated output is exposed on `ctx.body` and the type is inferred from the schema:

```ts
import { z } from 'zod'

router().topic('devices/:uid/events', {
  schema: z.object({
    temperature: z.number(),
    ts: z.number().int().optional(),
  }),
  async onMessage(ctx) {
    // ctx.body is { temperature: number; ts?: number }
    console.log(ctx.params.uid, ctx.body.temperature)
  },
})
```

Validation runs on inbound payloads by default. Override with `validate: 'both' | 'outbound' | false`. Validation failures emit a `SchemaValidationError` via the error lifecycle and skip `onMessage`.

For schema libraries that do **not** implement Standard Schema (e.g. raw TypeBox), register a `SchemaProvider`:

```ts
import { typeboxProvider } from '@mqttkit/typebox'

new MqttApp().addSchemaProvider(typeboxProvider)
```

See `@mqttkit/typebox` (TypeBox adapter) and `@mqttkit/zod` (attaches JSON Schema for AsyncAPI).

## Error Handling

`onError` runs on the route first, then any app-level handlers. Use it to format validation errors, audit failures, or send a structured error frame back to the client.

```ts
import { SchemaValidationError } from '@mqttkit/core'

new MqttApp()
  .onError(({ error, topic, phase, ctx }) => {
    if (error instanceof SchemaValidationError) {
      console.warn('bad payload', topic, error.issues)
      return
    }
    console.error(`[${phase}] ${topic}`, error)
  })
  .use(
    router().topic('devices/:uid/events', {
      schema: /* … */,
      onError({ error, ctx }) {
        // route-scoped, runs first
      },
      async onMessage(ctx) { /* … */ },
    }),
  )
```

`phase` is one of `middleware | handler | validation | policy | publish`.

## RPC

`app.request(topic, payload, options?)` sends a request using MQTT 5 `responseTopic` + `correlationData` and resolves when the device replies. On the device side the response can be sent through `ctx.reply()` (or by publishing manually to the response topic).

```ts
const reply = await app.request(`devices/${uid}/cmd`, { op: 'reboot' }, { timeout: 3000 })
console.log(reply.topic, reply.payload.toString())
```

```ts
router().topic('devices/:uid/cmd', {
  async onMessage(ctx) {
    await ctx.reply({ ok: true })   // replies to ctx.packet.properties.responseTopic
  },
})
```

The broker adapter must forward inbound publishes to the runtime; `@mqttkit/aedes` ≥0.2.0 does this.

## Testing

`@mqttkit/core/testing` ships an in-memory `TestBroker` so you can drive an
`MqttApp` without spawning aedes:

```ts
import { router } from '@mqttkit/core'
import { createTestApp } from '@mqttkit/core/testing'

const { app, broker } = createTestApp()
app.use(router().topic('devices/:uid/events', {
  async onMessage(ctx) {
    await ctx.publish('server/ack', 'ok')
  },
}))

await app.listen()
await broker.dispatch({ topic: 'devices/demo/events', payload: 'hi' })

expect(broker.published).toEqual([
  expect.objectContaining({ topic: 'server/ack' }),
])
```

`broker.onPublish` is a synchronous hook that lets you simulate device
replies (handy for testing `app.request()` round-trips).

See the repository README for full examples.
