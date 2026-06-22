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

See the repository README for full examples.
