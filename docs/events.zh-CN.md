# 事件

[English](events.md)

`app.on()` 用于监听 broker lifecycle event。使用 `@mqttkit/aedes` 时，事件来自 Aedes。

## 支持的事件

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

## 使用方式

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

## ACK 语义

mqttkit 不实现自定义 ack，也不向 WebSocket client 发送 JSON ack。`ack` 事件来自 Aedes 的 MQTT packet lifecycle，具体触发时机遵循 broker 与 MQTT 协议实现。

业务如果需要应用层回执，可以在 handler 中显式 publish 到约定的 topic：

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
