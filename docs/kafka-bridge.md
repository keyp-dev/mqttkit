# Kafka Bridge

mqttkit does not include a Kafka client. The recommended approach is to inject Kafka producers and consumers as business services, then connect both sides with MQTT topic routes.

## MQTT -> Kafka

```ts
type Kafka = {
  produce(topic: string, value: Buffer, key: string): Promise<void>
}

const app = new MqttApp<{ services: { kafka: Kafka } }>()
  .decorate('kafka', kafka)
  .use(aedes({ tcp: { port: 1883 } }))
  .use(
    router<{ services: { kafka: Kafka } }>().topic('devices/:uid/events', {
      async onMessage(ctx) {
        await ctx.services.kafka.produce('device.events', ctx.payload, ctx.params.uid)
      },
    }),
  )
```

## Kafka -> MQTT -> Client

When the Kafka consumer receives a message, call `app.publish()` to publish to an MQTT topic. Aedes handles delivery to MQTT clients that subscribed to that topic.

Path:

```text
Kafka consumer
  -> app.publish('server/:uid/commands')
  -> @mqttkit/aedes
  -> Aedes broker
  -> MQTT client subscription
```

```ts
kafka.onCommands(async (message) => {
  await app.publish(`server/${message.key}/commands`, message.value, { qos: 1 })
})
```

The corresponding route must allow clients to subscribe:

```ts
router().topic('server/:uid/commands', {
  subscribe: ({ params, principal }) => params.uid === principal?.uid,
})
```

On the client side, this is a normal MQTT subscription:

```ts
const client = mqtt.connect('mqtt://localhost:1885')

client.on('connect', () => {
  client.subscribe('server/demo/commands', { qos: 1 })
})

client.on('message', (topic, payload) => {
  console.log(topic, payload.toString())
})
```

## Full Example

See `examples/kafka-bridge`:

```bash
bun run --cwd examples/kafka-bridge dev
```

The example simulates one Kafka command every 10 seconds and prints `mqtt client received` in the console.
