# Aedes Adapter

[简体中文](aedes.zh-CN.md)

`@mqttkit/aedes` connects an Aedes broker to `MqttApp`. Aedes keeps owning MQTT protocol behavior, while mqttkit owns application routes, middleware, policies, service injection, and events.

## TCP MQTT

```ts
import { aedes } from '@mqttkit/aedes'
import { MqttApp, router } from '@mqttkit/core'

const app = new MqttApp()
  .use(aedes({ tcp: { port: 1883 } }))
  .use(
    router().topic('devices/:uid/events', {
      onMessage(ctx) {
        console.log(ctx.params.uid, ctx.payload.toString())
      },
    }),
  )

await app.listen()
```

## MQTT-over-WebSocket

```ts
const app = new MqttApp()
  .use(aedes({ tcp: false, ws: { port: 8888, path: '/mqtt' } }))
  .use(
    router()
      .topic('browser/:clientId/ping', {
        async onMessage(ctx) {
          await ctx.publish(`browser/${ctx.params.clientId}/pong`, ctx.payload)
        },
      })
      .topic('browser/:clientId/pong'),
  )

await app.listen()
```

Clients use standard MQTT-over-WebSocket:

```ts
import mqtt from 'mqtt'

const client = mqtt.connect('ws://localhost:8888/mqtt')
client.subscribe('browser/demo/pong')
client.publish('browser/demo/ping', 'hello')
```

## Authentication and Principal

The value returned by `authenticate` is injected as `principal` into publish policies, subscribe policies, and handler context.

```ts
const app = new MqttApp<{ principal?: { uid: string } }>()
  .use(
    aedes({
      tcp: { port: 1883 },
      authenticate({ username }) {
        if (!username) return false
        return { uid: username }
      },
    }),
  )
  .use(
    router<{ principal?: { uid: string } }>()
      .topic('devices/:uid/events', {
        publish: ({ params, principal }) => params.uid === principal?.uid,
        onMessage(ctx) {
          console.log(ctx.principal?.uid)
        },
      })
      .topic('server/:uid/commands', {
        subscribe: ({ params, principal }) => params.uid === principal?.uid,
      }),
  )
```

## External Aedes and Server

The adapter can use an externally created Aedes instance and can attach MQTT-over-WebSocket to an existing HTTP server.

```ts
import { createServer } from 'node:http'
import { createBroker } from 'aedes'

const broker = createBroker()
const server = createServer()

const app = new MqttApp().use(
  aedes({
    instance: broker,
    tcp: false,
    ws: { server, path: '/mqtt' },
  }),
)

await app.listen()
server.listen(8888)
```

## Persistence

`persistence` is passed through to Aedes:

```ts
new MqttApp().use(
  aedes({
    tcp: { port: 1883 },
    persistence,
  }),
)
```

QoS, retain, sessions, offline delivery, and persistence behavior are determined by Aedes and its persistence adapters.
