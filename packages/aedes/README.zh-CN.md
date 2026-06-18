# @mqttkit/aedes

[English](README.md)

Aedes adapter for mqttkit。它把 `MqttApp` 接到标准 MQTT TCP 与 MQTT-over-WebSocket transport，同时把路由、middleware、策略、事件和服务注入保留在 mqttkit 侧。

## 安装

```bash
bun add @mqttkit/core @mqttkit/aedes aedes
```

## 使用

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

## 能力

- 启动 TCP MQTT server。
- 启动 MQTT-over-WebSocket server。
- 接入外部 Aedes instance。
- 把 MQTT-over-WebSocket 挂载到已有 HTTP server。
- 将 Aedes lifecycle events 转发到 `app.on(...)`。
- 将认证得到的 principal 注入 mqttkit policy 与 handler。
- 将 publish / subscribe 授权委托给 mqttkit route。
- 透传 Aedes persistence 配置。

QoS、retain、session state、offline delivery 和 persistence 等 MQTT 协议行为由 Aedes 及其 persistence adapter 负责。
