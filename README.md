# mqttkit

[简体中文](README.zh-CN.md)

Build MQTT applications with an Elysia-like API: compose broker adapters, ordered middleware, topic routers, authentication, lifecycle events, and business services with `new MqttApp().use(...).use(router(...))`.

mqttkit does not reimplement the MQTT protocol. A broker such as Aedes owns CONNECT, SUBSCRIBE, PUBLISH, QoS, retain, sessions, persistence, and MQTT-over-WebSocket. mqttkit adds an application framework layer on top.

## Features

- Ordered `use()` middleware for auth, logging, audit, validation, and interception.
- `router().topic()` declares MQTT topic routes, publish policy, and subscribe policy.
- `ctx.params` extracts topic params such as `devices/:uid/events`.
- `ctx.services` injects Kafka, Redis, database, audit, or domain services.
- `app.on()` observes broker lifecycle events such as client, publish, subscribe, ack, and errors.
- `app.publish()` lets services, workers, and consumers push messages to MQTT clients through the broker.
- `@mqttkit/aedes` provides TCP MQTT and MQTT-over-WebSocket support through Aedes.
- `@mqttkit/asyncapi` generates AsyncAPI 3.0 documentation from routes and serves a browsable docs page.
- Built for Bun and TypeScript.

## Installation

```bash
bun add @mqttkit/core @mqttkit/aedes aedes
```

Install only `@mqttkit/core` if you only need the core types, router, or a custom broker adapter.

## Quick Start

```ts
import { aedes } from '@mqttkit/aedes'
import { MqttApp, router } from '@mqttkit/core'

type Services = {
  audit: {
    log(event: string, fields: Record<string, unknown>): Promise<void>
  }
}

const app = new MqttApp<{ principal?: { uid: string }; services: Services }>()
  .decorate('audit', {
    async log(event, fields) {
      console.log(event, fields)
    },
  })
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
  .use(async (ctx, next) => {
    await ctx.services.audit.log('mqtt.message', {
      clientId: ctx.clientId,
      topic: ctx.topic,
    })
    await next()
  })
  .use(
    router<{ principal?: { uid: string }; services: Services }>()
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

Clients connect with standard MQTT TCP or MQTT-over-WebSocket:

```ts
import mqtt from 'mqtt'

const client = mqtt.connect('ws://localhost:8888/mqtt', {
  username: 'demo',
})

client.subscribe('server/demo/echo')
client.publish('devices/demo/events', JSON.stringify({ temperature: 22 }), { qos: 0 })
```

## Router

MQTT has topics, not HTTP methods. mqttkit uses `topic(pattern, config)` to declare a route, publish policy, subscribe policy, and optional inbound message handler.

```ts
router()
  .topic('devices/:uid/events', {
    publish: ({ params, principal }) => params.uid === principal?.uid,
    subscribe: false,
    async onMessage(ctx) {
      console.log(ctx.params.uid, ctx.payload.toString())
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

`use()` runs in registration order. If middleware does not call `next()`, the remaining middleware and route handler do not run.

```ts
const app = new MqttApp()
  .use(async (ctx, next) => {
    console.log('[mqtt]', ctx.clientId, ctx.topic)
    await next()
  })
  .use(
    router()
      .use(async (ctx, next) => {
        if (ctx.params.uid === 'blocked') return
        await next()
      })
      .topic('devices/:uid/events', {
        onMessage(ctx) {
          console.log(ctx.payload.toString())
        },
      }),
  )
```

Pipeline:

```text
app middleware -> route middleware -> onMessage
```

## Events

`app.on()` receives broker lifecycle events. The Aedes adapter currently forwards:

```ts
import type { MqttEventName } from '@mqttkit/core'

const eventNames: MqttEventName[] = [
  'client',
  'clientReady',
  'clientDisconnect',
  'keepaliveTimeout',
  'clientError',
  'connectionError',
  'connackSent',
  'ping',
  'publish',
  'ack',
  'subscribe',
  'unsubscribe',
]

for (const eventName of eventNames) {
  app.on(eventName, (event) => {
    console.log(event.type, event.clientId, event.topic)
  })
}
```

ACK is produced by the broker according to MQTT packet lifecycle. mqttkit does not define a custom JSON ack.

## Service Push

Any external service, timer, worker, queue consumer, or Kafka consumer can call `app.publish()` to send messages into the broker and let the broker deliver them to subscribed MQTT clients.

```text
external service / worker / consumer
  -> app.publish(topic, payload, options)
  -> @mqttkit/aedes adapter
  -> Aedes broker
  -> subscribed MQTT clients
```

Declare a server-owned topic that clients may subscribe to but may not publish to:

```ts
const app = new MqttApp()
  .use(aedes({ tcp: { port: 1886 } }))
  .use(
    router().topic('users/:uid/notifications', {
      subscribe: true,
      publish: false,
    }),
  )

billing.onInvoicePaid(async (event) => {
  await app.publish(`users/${event.uid}/notifications`, event.payload, { qos: 1 })
})
```

## Kafka Bridge

Kafka, databases, and other services are injected with `decorate()`. MQTT -> Kafka happens inside `onMessage`; Kafka -> MQTT happens when a consumer calls `app.publish()`.

```ts
type Kafka = {
  produce(topic: string, value: Buffer, key: string): Promise<void>
  onCommands(handler: (message: { key: string; value: Buffer }) => Promise<void>): void
}

const app = new MqttApp<{ services: { kafka: Kafka } }>()
  .decorate('kafka', kafka)
  .use(aedes({ tcp: { port: 1883 } }))
  .use(
    router<{ services: { kafka: Kafka } }>()
      .topic('devices/:uid/events', {
        async onMessage(ctx) {
          await ctx.services.kafka.produce('device.events', ctx.payload, ctx.params.uid)
        },
      })
      .topic('server/:uid/commands'),
  )

kafka.onCommands(async (message) => {
  await app.publish(`server/${message.key}/commands`, message.value, { qos: 1 })
})
```

The client only needs a normal MQTT subscription:

```ts
const client = mqtt.connect('mqtt://localhost:1885')
client.subscribe('server/demo/commands', { qos: 1 })
client.on('message', (topic, payload) => {
  console.log(topic, payload.toString())
})
```

## Aedes Integration

`@mqttkit/aedes` supports:

- Creating an Aedes instance for mqttkit.
- Using an externally created Aedes instance.
- Starting a TCP MQTT server.
- Starting a standard MQTT-over-WebSocket server.
- Passing Aedes `persistence` through.
- Forwarding Aedes lifecycle events to `app.on()`.
- Returning `principal` from `authenticate` and injecting it into policies and handler context.
- Delegating publish / subscribe authorization to mqttkit route policies.

```ts
import { aedes } from '@mqttkit/aedes'

new MqttApp()
  .use(
    aedes({
      tcp: { port: 1883 },
      ws: { port: 8888, path: '/mqtt' },
      authenticate({ username }) {
        if (!username) return false
        return { uid: username }
      },
    }),
  )
```

Use Aedes persistence adapters for offline queues, retain, QoS sessions, and durable storage. mqttkit only owns the application layer.

## Examples

- `examples/aedes-basic`: TCP broker, authentication, middleware, topic routes, and server-side publish.
- `examples/aedes-ws`: standard MQTT-over-WebSocket; mqtt.js connects to `ws://localhost:8888/mqtt`.
- `examples/events`: broker lifecycle events.
- `examples/service-push`: external service calls `app.publish()`, then Aedes delivers to subscribed MQTT clients.
- `examples/kafka-bridge`: MQTT messages go to Kafka, and Kafka consumer messages are forwarded to MQTT clients.
- `examples/asyncapi-docs`: AsyncAPI documentation served from `@mqttkit/asyncapi` (standalone HTTP).
- `examples/asyncapi-elysia`: share a single Elysia port for both AsyncAPI docs and MQTT-over-WebSocket (aedes ws attached to the same `http.Server`).

Run an example:

```bash
bun install
bun run --cwd examples/aedes-basic dev
```

## Documentation

- [Getting Started](docs/getting-started.md) / [简体中文](docs/getting-started.zh-CN.md)
- [Aedes adapter](docs/aedes.md) / [简体中文](docs/aedes.zh-CN.md)
- [Events](docs/events.md) / [简体中文](docs/events.zh-CN.md)
- [Service Push](docs/service-push.md) / [简体中文](docs/service-push.zh-CN.md)
- [Kafka bridge](docs/kafka-bridge.md) / [简体中文](docs/kafka-bridge.zh-CN.md)

## Development

```bash
bun run test
bun run typecheck
bun run build
```

## Packages

- `@mqttkit/core`: core application, router, middleware, context, event types, and broker adapter interface.
- `@mqttkit/aedes`: Aedes adapter for TCP MQTT and MQTT-over-WebSocket.
- `@mqttkit/asyncapi`: AsyncAPI 3.0 generator and HTTP plugin for browsable docs.
