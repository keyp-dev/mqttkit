# Kafka Bridge

mqttkit 不内置 Kafka client。推荐把 Kafka producer / consumer 作为业务服务注入，然后用 MQTT topic route 连接两边。

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

Kafka consumer 收到消息后，调用 `app.publish()` 发送到 MQTT topic。后续投递由 Aedes broker 负责，已订阅该 topic 的 MQTT client 会收到消息。

线路：

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

对应 route 需要允许 client 订阅：

```ts
router().topic('server/:uid/commands', {
  subscribe: ({ params, principal }) => params.uid === principal?.uid,
})
```

客户端侧就是普通 MQTT 订阅：

```ts
const client = mqtt.connect('mqtt://localhost:1885')

client.on('connect', () => {
  client.subscribe('server/demo/commands', { qos: 1 })
})

client.on('message', (topic, payload) => {
  console.log(topic, payload.toString())
})
```

## 完整示例

查看 `examples/kafka-bridge`：

```bash
bun run --cwd examples/kafka-bridge dev
```

运行后示例会每 10 秒模拟一条 Kafka command，并在控制台打印 `mqtt client received`。
