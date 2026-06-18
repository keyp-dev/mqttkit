# Service Push

[简体中文](service-push.zh-CN.md)

External services, scheduled jobs, queue consumers, and Kafka consumers can call `app.publish()` to send messages into the MQTT broker. The broker then delivers those messages to MQTT clients that already subscribed to the target topic.

Core path:

```text
external service / worker / consumer
  -> app.publish(topic, payload, options)
  -> @mqttkit/aedes adapter
  -> Aedes broker
  -> subscribed MQTT clients
```

## Declare a Subscribable Topic

```ts
const app = new MqttApp()
  .use(aedes({ tcp: { port: 1886 } }))
  .use(
    router().topic('users/:uid/notifications', {
      subscribe: true,
      publish: false,
    }),
  )
```

This route means:

- Clients may subscribe to `users/:uid/notifications`.
- Clients may not publish to this topic.
- The server may actively publish to this topic through `app.publish()`.

## Send from an External Service

```ts
billing.onInvoicePaid(async (event) => {
  await app.publish(`users/${event.uid}/notifications`, event.payload, { qos: 1 })
})
```

## Receive from an MQTT Client

```ts
import mqtt from 'mqtt'

const client = mqtt.connect('mqtt://localhost:1886')

client.on('connect', () => {
  client.subscribe('users/demo/notifications', { qos: 1 })
})

client.on('message', (topic, payload) => {
  console.log(topic, payload.toString())
})
```

## Full Example

See `examples/service-push`:

```bash
bun run --cwd examples/service-push dev
```

After running it, you should see:

- `service -> mqtt`: the simulated external service called `app.publish()`.
- `mqtt client received`: the subscribed MQTT client received the broker-delivered message.
