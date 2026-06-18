# Events

[简体中文](events.zh-CN.md)

Use `app.on()` to listen to broker lifecycle events. With `@mqttkit/aedes`, events come from Aedes.

## Supported Events

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
```

## Usage

```ts
const app = new MqttApp()
  .use(aedes({ tcp: { port: 1883 }, ws: { port: 8888, path: '/mqtt' } }))
  .use(router().topic('devices/:uid/events', { onMessage }))

app.on('client', (event) => {
  console.log('client connected', event.clientId)
})

app.on('publish', (event) => {
  console.log('publish', event.clientId, event.topic)
})

app.on('ack', (event) => {
  console.log('ack', event.clientId, event.topic)
})

await app.listen()
```

## ACK Semantics

mqttkit does not implement custom ack and does not send JSON ack messages to WebSocket clients. The `ack` event comes from the Aedes MQTT packet lifecycle, and its exact timing follows the broker and MQTT protocol implementation.

If your application needs an application-level receipt, publish one explicitly from the handler:

```ts
router().topic('devices/:uid/events', {
  async onMessage(ctx) {
    await ctx.publish(`server/${ctx.params.uid}/acks`, {
      topic: ctx.topic,
      accepted: true,
    })
  },
})
```
