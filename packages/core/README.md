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

See the repository README for full examples.
