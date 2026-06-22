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

## Topic Pattern 语法

Pattern 使用 Elysia 风格的段，而非 MQTT 通配符：

| 段       | 含义                                                                   |
| -------- | ---------------------------------------------------------------------- |
| `foo`    | 字面段，需要精确相等。                                                 |
| `:name`  | 命名参数，匹配单段并写入 `ctx.params.name`。                           |
| `*`      | catch-all，必须放在最后，剩余段拼接后写入 `ctx.params['*']`。          |

```ts
router()
  .topic('devices/:uid/events')      // ctx.params.uid
  .topic('files/*')                  // ctx.params['*'] = 'a/b/c'
  .topic('users/:uid/inbox/*')       // 两者并用
```

MQTT 的 `+` / `#` **不**属于 pattern 语法 —— 写在 pattern 里只会被当成字面字符。
它们只在客户端订阅一侧被识别：客户端用包含 `+` / `#` 的 topic 订阅时，mqttkit
会和路由 pattern 做"通配符匹配通配符"的判断，**不会**把任何值绑定到 `:name`。
所以依赖 `params.uid` 的 subscribe policy 在面对通配订阅时会自然失败。

```ts
// Pattern: 'devices/:uid/events'
// 客户端订阅 'devices/+/events' → 命中，params = {}
// 客户端订阅 'devices/#'        → 命中，params = {}
// 客户端订阅 'devices/abc/x'    → 未命中
```

完整示例见仓库 README。
