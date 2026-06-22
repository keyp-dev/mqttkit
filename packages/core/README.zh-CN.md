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

## Schema 校验

`topic({ schema })` 接受任何 [Standard Schema v1](https://standardschema.dev/) 校验器（zod ≥3.24、valibot ≥1、arktype 等）。校验后的值挂在 `ctx.body` 上，类型从 schema 推断：

```ts
import { z } from 'zod'

router().topic('devices/:uid/events', {
  schema: z.object({
    temperature: z.number(),
    ts: z.number().int().optional(),
  }),
  async onMessage(ctx) {
    // ctx.body 自动推断为 { temperature: number; ts?: number }
    console.log(ctx.params.uid, ctx.body.temperature)
  },
})
```

默认对入站 payload 校验。可改成 `validate: 'both' | 'outbound' | false`。校验失败会通过错误生命周期抛出 `SchemaValidationError`，并跳过 `onMessage`。

对**没**实现 Standard Schema 的库（比如原始 TypeBox），通过 `SchemaProvider` 注册：

```ts
import { typeboxProvider } from '@mqttkit/typebox'

new MqttApp().addSchemaProvider(typeboxProvider)
```

详见 `@mqttkit/typebox`（TypeBox 适配）和 `@mqttkit/zod`（给 zod schema 挂 JSON Schema 给 AsyncAPI 用）。

## 错误处理

`onError` 顺序：路由级先跑、然后是 app 级。可用来格式化校验错误、审计失败、或把结构化错误回发给客户端。

```ts
import { SchemaValidationError } from '@mqttkit/core'

new MqttApp()
  .onError(({ error, topic, phase, ctx }) => {
    if (error instanceof SchemaValidationError) {
      console.warn('bad payload', topic, error.issues)
      return
    }
    console.error(`[${phase}] ${topic}`, error)
  })
  .use(
    router().topic('devices/:uid/events', {
      schema: /* … */,
      onError({ error, ctx }) {
        // 路由级，会比 app 级先跑
      },
      async onMessage(ctx) { /* … */ },
    }),
  )
```

`phase` 可能是 `middleware | handler | validation | policy | publish`。

## RPC

`app.request(topic, payload, options?)` 通过 MQTT 5 `responseTopic` + `correlationData` 发请求，并在设备回复时 resolve。设备一侧用 `ctx.reply()`（或手工 publish 到 responseTopic）。

```ts
const reply = await app.request(`devices/${uid}/cmd`, { op: 'reboot' }, { timeout: 3000 })
console.log(reply.topic, reply.payload.toString())
```

```ts
router().topic('devices/:uid/cmd', {
  async onMessage(ctx) {
    await ctx.reply({ ok: true })   // 自动回到 ctx.packet.properties.responseTopic
  },
})
```

broker adapter 必须把入站 publish 也喂给 runtime；`@mqttkit/aedes` ≥0.2.0 默认就这么做。

## 测试工具

`@mqttkit/core/testing` 提供内存版 `TestBroker`，无需启动 aedes 即可驱动
`MqttApp`：

```ts
import { router } from '@mqttkit/core'
import { createTestApp } from '@mqttkit/core/testing'

const { app, broker } = createTestApp()
app.use(router().topic('devices/:uid/events', {
  async onMessage(ctx) {
    await ctx.publish('server/ack', 'ok')
  },
}))

await app.listen()
await broker.dispatch({ topic: 'devices/demo/events', payload: 'hi' })

expect(broker.published).toEqual([
  expect.objectContaining({ topic: 'server/ack' }),
])
```

`broker.onPublish` 是一个同步钩子，可用来模拟设备回复（适合测试
`app.request()` 往返）。

完整示例见仓库 README。
