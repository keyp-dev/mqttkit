# @mqttkit/aedes

[简体中文](README.zh-CN.md)

Aedes adapter for mqttkit. It connects `MqttApp` to standard MQTT TCP and MQTT-over-WebSocket transports while keeping routing, middleware, policies, events, and service injection in mqttkit.

## Install

```bash
bun add @mqttkit/core @mqttkit/aedes aedes
```

## Usage

```ts
import { aedes } from '@mqttkit/aedes'
import { MqttApp, router } from '@mqttkit/core'

const app = new MqttApp()
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
  .use(
    router()
      .topic('devices/:uid/events', {
        async onMessage(ctx) {
          await ctx.publish(`server/${ctx.params.uid}/commands`, ctx.payload)
        },
      })
      .topic('server/:uid/commands'),
  )

await app.listen()
```

## Features

- Start a TCP MQTT server.
- Start an MQTT-over-WebSocket server.
- Attach to an existing Aedes instance.
- Attach MQTT-over-WebSocket to an existing HTTP server.
- Forward Aedes lifecycle events to `app.on(...)`.
- Inject authenticated principals into mqttkit policies and handlers.
- Delegate publish and subscribe authorization to mqttkit routes.
- Pass Aedes persistence options through to the broker.

MQTT protocol behavior such as QoS, retain, session state, offline delivery, and persistence is handled by Aedes and its persistence adapters.
