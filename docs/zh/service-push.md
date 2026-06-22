# Service Push

外部服务、定时任务、队列 consumer、Kafka consumer 都可以通过 `app.publish()` 把消息送进 MQTT broker，再由 broker 投递给已经订阅对应 topic 的 MQTT client。

核心线路：

```text
外部服务 / worker / consumer
  -> app.publish(topic, payload, options)
  -> @mqttkit/aedes adapter
  -> Aedes broker
  -> 已订阅该 topic 的 MQTT client
```

## 声明可订阅 topic

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

这个 route 表示：

- client 可以订阅 `users/:uid/notifications`。
- client 不允许 publish 到这个 topic。
- 服务端可以通过 `app.publish()` 主动向这个 topic 发消息。

## 外部服务发送到 MQTT

```ts
billing.onInvoicePaid(async (event) => {
  await app.publish(`users/${event.uid}/notifications`, event.payload, { qos: 1 })
})
```

## MQTT client 订阅接收

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

## 完整示例

查看 `examples/service-push`：

```bash
bun run --cwd examples/service-push dev
```

运行后会看到：

- `service -> mqtt`：模拟外部服务调用了 `app.publish()`。
- `mqtt client received`：订阅中的 MQTT client 收到了 broker 投递的消息。
