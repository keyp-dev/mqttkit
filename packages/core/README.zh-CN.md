# @mqttkit/core

[English](README.md)

Elysia-like MQTT application framework for TypeScript。

`@mqttkit/core` 提供核心应用运行时：有序 middleware、topic router、类型化 context、服务注入、lifecycle events 和 broker adapter 接口。搭配 `@mqttkit/aedes` 可以启动 TCP MQTT 与 MQTT-over-WebSocket，也可以实现自己的 broker adapter。

## 安装

```bash
bun add @mqttkit/core
```

## 使用

```ts
import { aedes } from '@mqttkit/aedes'
import { MqttApp, router } from '@mqttkit/core'

const app = new MqttApp()
  .use(aedes({ tcp: { port: 1883 }, ws: { port: 8888, path: '/mqtt' } }))
  .use(async (ctx, next) => {
    console.log(ctx.clientId, ctx.topic)
    await next()
  })
  .use(
    router()
      .topic('devices/:uid/events', {
        async onMessage(ctx) {
          await ctx.publish(`server/${ctx.params.uid}/echo`, ctx.payload)
        },
      })
      .topic('server/:uid/echo'),
  )

await app.listen()
```

## Core API

- `new MqttApp()` 创建应用运行时。
- `app.use(fn)` 注册有序 middleware。
- `app.use(plugin)` 安装 router、broker adapter 等插件。
- `router().topic(pattern, config)` 声明 MQTT topic 的 publish / subscribe policy。
- `app.decorate(key, value)` 把业务服务注入到 `ctx.services`。
- `app.on(eventName, handler)` 监听 broker lifecycle events。
- `app.publish(topic, payload, options)` 通过已配置 broker 从服务端发布消息。

完整示例见仓库 README。
