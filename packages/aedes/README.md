# @mqttkit/aedes

[简体中文](README.zh-CN.md)

Aedes adapter for mqttkit. Connects `MqttApp` to MQTT TCP and MQTT-over-WebSocket; QoS, retain, sessions, offline delivery, and persistence stay with Aedes.

Full documentation: **<https://mqttkit.keyp.dev>**.

## Install

```bash
bun add @mqttkit/core @mqttkit/aedes aedes
```

## Usage

```ts
import { aedes } from '@mqttkit/aedes'
import { MqttApp, router } from '@mqttkit/core'

const app = new MqttApp()
  .use(aedes({
    tcp: { port: 1883 },
    ws: { port: 8888, path: '/mqtt' },
    authenticate({ username }) {
      if (!username) return false
      return { uid: username }
    },
  }))
  .use(
    router().topic('devices/:uid/events', {
      async onMessage(ctx) {
        await ctx.publish(`server/${ctx.params.uid}/commands`, ctx.payload)
      },
    }),
  )

await app.listen()
```

## What's Included

- TCP MQTT server, MQTT-over-WebSocket server, or attach to an existing `http.Server`.
- `authenticate` callback returns a principal injected into mqttkit policies and handlers as `ctx.principal`.
- Publish / subscribe authorization delegated to mqttkit routes (and shared-subscription `$share/<group>/<filter>` is decoded for the subscribe policy).
- Forwards MQTT 5 publish properties (`responseTopic`, `correlationData`, `userProperties`, …) needed for `app.request()` RPC and tracing.
- Aedes lifecycle events forwarded to `app.on(...)`; Aedes persistence options passed through.

## Docs

- [Getting Started](https://mqttkit.keyp.dev/getting-started) · [Aedes adapter](https://mqttkit.keyp.dev/aedes)
