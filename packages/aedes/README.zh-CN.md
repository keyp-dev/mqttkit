# @mqttkit/aedes

[English](README.md)

mqttkit 的 Aedes adapter。把 `MqttApp` 接到 MQTT TCP 和 MQTT-over-WebSocket；QoS、retain、session、离线投递、持久化都交给 Aedes。

完整文档：**<https://mqttkit.keyp.dev/zh/>**。

## 安装

```bash
bun add @mqttkit/core @mqttkit/aedes aedes
```

## 使用

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

## 功能

- TCP MQTT server、MQTT-over-WebSocket server，或接到已有的 `http.Server`。
- `authenticate` 回调返回的 principal 自动注入 `ctx.principal`，供 mqttkit policy 与 handler 使用。
- 把 publish / subscribe 授权委托给 mqttkit 路由（共享订阅 `$share/<group>/<filter>` 自动解析后交给 subscribe policy）。
- 透传 MQTT 5 publish properties（`responseTopic`、`correlationData`、`userProperties` 等），`app.request()` RPC 与 tracing 依赖这一点。
- Aedes lifecycle events 转发到 `app.on(...)`；Aedes persistence 配置原样透传。

## 文档

- [快速开始](https://mqttkit.keyp.dev/zh/getting-started) · [Aedes 适配器](https://mqttkit.keyp.dev/zh/aedes)
