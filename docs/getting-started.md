# Getting Started

mqttkit organizes MQTT applications with `MqttApp`, ordered `use()` middleware, and `router().topic()`. Broker adapters own connections, QoS, retain, sessions, and persistence.

## Install

```bash
bun add @mqttkit/core @mqttkit/aedes aedes
```

## Create an App

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
          console.log(ctx.params.uid, ctx.payload.toString())
          await ctx.publish(`server/${ctx.params.uid}/echo`, ctx.payload)
        },
      })
      .topic('server/:uid/echo'),
  )

await app.listen()
```

## Topic Routes

`topic(pattern, config)` declares publish policy, subscribe policy, and an inbound message handler.

```ts
router()
  .topic('devices/:uid/events', {
    publish: ({ params, principal }) => params.uid === principal?.uid,
    subscribe: false,
    async onMessage(ctx) {
      await ctx.publish(`server/${ctx.params.uid}/commands`, ctx.payload)
    },
  })
  .topic('server/:uid/commands', {
    publish: false,
    subscribe: ({ params, principal }) => params.uid === principal?.uid,
  })
```

Default policies:

- A topic with `onMessage` defaults to `publish: true` and `subscribe: false`.
- A topic without `onMessage` defaults to `publish: false` and `subscribe: true`.

## Middleware

`use()` runs in registration order.

```text
app middleware -> route middleware -> onMessage
```

If middleware does not call `next()`, the remaining middleware and handler do not run.

```ts
new MqttApp()
  .use(async (ctx, next) => {
    if (!ctx.clientId) return
    await next()
  })
  .use(
    router()
      .use(async (ctx, next) => {
        if (ctx.params.uid === 'blocked') return
        await next()
      })
      .topic('devices/:uid/events', { onMessage }),
  )
```

## Service Injection

Use `decorate()` to inject business dependencies. Handlers access them through `ctx.services`.

```ts
const app = new MqttApp<{ services: { audit: AuditService } }>()
  .decorate('audit', audit)
  .use(
    router<{ services: { audit: AuditService } }>().topic('devices/:uid/events', {
      async onMessage(ctx) {
        await ctx.services.audit.write(ctx.topic, ctx.payload)
      },
    }),
  )
```

## Run an Example

```bash
bun install
bun run --cwd examples/aedes-basic dev
```

Then connect with mqtt.js, MQTTX, Mosquitto CLI, or any standard MQTT client.
