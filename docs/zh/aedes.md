# Aedes Adapter

`@mqttkit/aedes` 把 Aedes broker 接入 `MqttApp`。Aedes 继续负责 MQTT 协议语义，mqttkit 负责应用层路由、middleware、策略、服务注入和事件监听。

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

客户端使用标准 MQTT-over-WebSocket：

```ts
import mqtt from 'mqtt'

const client = mqtt.connect('ws://localhost:8888/mqtt')
client.subscribe('browser/demo/pong')
client.publish('browser/demo/ping', 'hello')
```

## 认证与 principal

`authenticate` 返回的对象会作为 `principal` 注入 publish policy、subscribe policy 和 handler context。

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

## 外部 Aedes 与 server

adapter 可以使用外部创建的 Aedes instance，也可以挂载到已有 HTTP server 上：

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

`persistence` 会透传给 Aedes：

```ts
new MqttApp().use(
  aedes({
    tcp: { port: 1883 },
    persistence,
  }),
)
```

QoS、retain、session、offline delivery 和持久化行为由 Aedes 及其 persistence adapter 决定。
