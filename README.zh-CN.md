# mqttkit

[English](README.md)

用 Elysia 风格组织 MQTT 应用：通过 `new MqttApp().use(...).use(router(...))` 组合 broker adapter、middleware、topic router、认证、事件监听和业务服务。

mqttkit 不重新实现 MQTT 协议。CONNECT、SUBSCRIBE、PUBLISH、QoS、retain、session、persistence、MQTT-over-WebSocket 等协议语义由 Aedes 等 broker 负责；mqttkit 负责应用层组织。

## 特性

- 有序 `use()` middleware，可用于鉴权、日志、审计、校验和拦截。
- `router().topic()` 声明 MQTT topic route、发布策略和订阅策略。
- `ctx.params` 自动提取 `devices/:uid/events` 这类 topic 参数。
- `ctx.body` 承载校验后的 payload，任意 [Standard Schema](https://standardschema.dev/) 校验器（zod、valibot、arktype 等）都能直接用，并自动推断类型；原始 TypeBox 与给 zod 挂 JSON Schema 用 `@mqttkit/typebox` / `@mqttkit/zod`。
- `ctx.services` 注入 Kafka、Redis、数据库、审计服务或业务服务。
- `app.request()` 通过 MQTT 5 `responseTopic` + `correlationData` 做 RPC 往返；设备一侧用 `ctx.reply()` 回复。
- `app.onError()`（以及路由级 `onError`）捕获 validation / handler / policy / middleware / publish 失败，并带结构化 `phase`。
- `app.on()` 监听 client、publish、subscribe、ack、错误等 broker lifecycle events。
- `app.publish()` 让外部服务、worker、consumer 通过 broker 主动推送消息给 MQTT client。
- `@mqttkit/core/testing` 内置内存版 `TestBroker`，无需起 aedes 即可对 app 做单测。
- `@mqttkit/aedes` 基于 Aedes 提供 TCP MQTT 与 MQTT-over-WebSocket（透传 MQTT 5 properties 给 RPC 用）。
- `@mqttkit/asyncapi` 从路由生成 AsyncAPI 3.0 文档，并通过 HTTP 提供可浏览的文档页面。
- 面向 Bun 与 TypeScript。

## 安装

```bash
bun add @mqttkit/core @mqttkit/aedes aedes
```

如果只需要 core 类型、router 或自定义 broker adapter，可以只安装 `@mqttkit/core`。

## 快速开始

```ts
import { aedes } from '@mqttkit/aedes'
import { MqttApp, router } from '@mqttkit/core'

type Services = {
  audit: {
    log(event: string, fields: Record<string, unknown>): Promise<void>
  }
}

const app = new MqttApp<{ principal?: { uid: string }; services: Services }>()
  .decorate('audit', {
    async log(event, fields) {
      console.log(event, fields)
    },
  })
  .use(
    aedes({
      tcp: { port: 1883 },
      ws: { port: 8888, path: '/mqtt' },
      authenticate({ clientId, username }) {
        if (!username) return false
        return { uid: username || clientId }
      },
    }),
  )
  .use(async (ctx, next) => {
    await ctx.services.audit.log('mqtt.message', {
      clientId: ctx.clientId,
      topic: ctx.topic,
    })
    await next()
  })
  .use(
    router<{ principal?: { uid: string }; services: Services }>()
      .topic('devices/:uid/events', {
        publish: ({ params, principal }) => params.uid === principal?.uid,
        async onMessage(ctx) {
          await ctx.publish(`server/${ctx.params.uid}/echo`, ctx.payload, { qos: 0 })
        },
      })
      .topic('server/:uid/echo', {
        subscribe: ({ params, principal }) => params.uid === principal?.uid,
      }),
  )

await app.listen()
```

客户端使用标准 MQTT TCP 或 MQTT-over-WebSocket 连接：

```ts
import mqtt from 'mqtt'

const client = mqtt.connect('ws://localhost:8888/mqtt', {
  username: 'demo',
})

client.subscribe('server/demo/echo')
client.publish('devices/demo/events', JSON.stringify({ temperature: 22 }), { qos: 0 })
```

## Router

MQTT 只有 topic，没有 HTTP method。mqttkit 使用 `topic(pattern, config)` 同时声明 route、发布策略、订阅策略和可选的消息 handler。

```ts
router()
  .topic('devices/:uid/events', {
    publish: ({ params, principal }) => params.uid === principal?.uid,
    subscribe: false,
    async onMessage(ctx) {
      console.log(ctx.params.uid, ctx.payload.toString())
    },
  })
  .topic('server/:uid/commands', {
    publish: false,
    subscribe: ({ params, principal }) => params.uid === principal?.uid,
  })
```

默认策略：

- 配置了 `onMessage` 的 topic 默认允许 client publish，默认不允许 subscribe。
- 未配置 `onMessage` 的 topic 默认不允许 client publish，默认允许 subscribe。

## Middleware

`use()` 按注册顺序执行。middleware 不调用 `next()` 时，后续 middleware 与 route handler 不会继续执行。

```ts
const app = new MqttApp()
  .use(async (ctx, next) => {
    console.log('[mqtt]', ctx.clientId, ctx.topic)
    await next()
  })
  .use(
    router()
      .use(async (ctx, next) => {
        if (ctx.params.uid === 'blocked') return
        await next()
      })
      .topic('devices/:uid/events', {
        onMessage(ctx) {
          console.log(ctx.payload.toString())
        },
      }),
  )
```

执行顺序：

```text
app middleware -> route middleware -> onMessage
```

## 事件监听

`app.on()` 接收 broker lifecycle events。Aedes adapter 当前转发：

```ts
import type { MqttEventName } from '@mqttkit/core'

const eventNames: MqttEventName[] = [
  'client',
  'clientReady',
  'clientDisconnect',
  'keepaliveTimeout',
  'clientError',
  'connectionError',
  'connackSent',
  'ping',
  'publish',
  'ack',
  'subscribe',
  'unsubscribe',
]

for (const eventName of eventNames) {
  app.on(eventName, (event) => {
    console.log(event.type, event.clientId, event.topic)
  })
}
```

ACK 由 broker 按 MQTT packet lifecycle 产生。mqttkit 不定义自定义 JSON ack。

## Service Push

外部服务、定时任务、worker、队列 consumer 或 Kafka consumer 都可以调用 `app.publish()` 把消息送入 broker，再由 broker 投递给已订阅的 MQTT client。

```text
外部服务 / worker / consumer
  -> app.publish(topic, payload, options)
  -> @mqttkit/aedes adapter
  -> Aedes broker
  -> 已订阅的 MQTT clients
```

声明一个由服务端主动发布、client 只能订阅不能发布的 topic：

```ts
const app = new MqttApp()
  .use(aedes({ tcp: { port: 1886 } }))
  .use(
    router().topic('users/:uid/notifications', {
      subscribe: true,
      publish: false,
    }),
  )

billing.onInvoicePaid(async (event) => {
  await app.publish(`users/${event.uid}/notifications`, event.payload, { qos: 1 })
})
```

## Kafka Bridge

Kafka、数据库和其他服务通过 `decorate()` 注入。MQTT -> Kafka 在 `onMessage` 中处理；Kafka -> MQTT 由 consumer 调用 `app.publish()` 透传给订阅中的 MQTT client。

```ts
type Kafka = {
  produce(topic: string, value: Buffer, key: string): Promise<void>
  onCommands(handler: (message: { key: string; value: Buffer }) => Promise<void>): void
}

const app = new MqttApp<{ services: { kafka: Kafka } }>()
  .decorate('kafka', kafka)
  .use(aedes({ tcp: { port: 1883 } }))
  .use(
    router<{ services: { kafka: Kafka } }>()
      .topic('devices/:uid/events', {
        async onMessage(ctx) {
          await ctx.services.kafka.produce('device.events', ctx.payload, ctx.params.uid)
        },
      })
      .topic('server/:uid/commands'),
  )

kafka.onCommands(async (message) => {
  await app.publish(`server/${message.key}/commands`, message.value, { qos: 1 })
})
```

客户端只需要普通 MQTT 订阅：

```ts
const client = mqtt.connect('mqtt://localhost:1885')
client.subscribe('server/demo/commands', { qos: 1 })
client.on('message', (topic, payload) => {
  console.log(topic, payload.toString())
})
```

## Aedes 集成

`@mqttkit/aedes` 支持：

- 由 mqttkit 创建 Aedes instance。
- 接入外部 Aedes instance。
- 启动 TCP MQTT server。
- 启动标准 MQTT-over-WebSocket server。
- 透传 Aedes `persistence` 配置。
- 将 Aedes lifecycle events 转发给 `app.on()`。
- 通过 `authenticate` 返回 `principal`，并注入 policy 与 handler context。
- 通过 mqttkit route policy 控制 publish / subscribe。

```ts
import { aedes } from '@mqttkit/aedes'

new MqttApp()
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
```

离线队列、retain、QoS session 和持久化请使用 Aedes persistence adapter。mqttkit 只负责应用层组织与策略。

## 示例

- `examples/aedes-basic`：TCP broker、认证、middleware、topic route、服务端 publish。
- `examples/aedes-ws`：标准 MQTT-over-WebSocket，mqtt.js 连接 `ws://localhost:8888/mqtt`。
- `examples/events`：监听 broker lifecycle events。
- `examples/service-push`：外部服务调用 `app.publish()`，消息经 Aedes 投递到订阅中的 MQTT client。
- `examples/kafka-bridge`：MQTT 消息写入 Kafka，并把 Kafka consumer 消息透传给 MQTT client。
- `examples/schema-validation`：zod、TypeBox 以及两者共存的 payload 校验示例。
- `examples/rpc`：用 `app.request()` 与 `ctx.reply()` 完成 MQTT 5 RPC 往返。
- `examples/asyncapi-docs`：通过 `@mqttkit/asyncapi` 提供 AsyncAPI 文档与浏览页面（独立 HTTP 端口），`dev:zod` 版本演示 zod + `jsonify`。
- `examples/asyncapi-elysia`：Elysia 端口同时承载 AsyncAPI 文档与 MQTT-over-WebSocket（aedes ws 复用同一个 `http.Server`）。

运行示例：

```bash
bun install
bun run --cwd examples/aedes-basic dev
```

## 文档

- [快速开始](docs/zh/getting-started.md) / [English](docs/getting-started.md)
- [Aedes adapter](docs/zh/aedes.md) / [English](docs/aedes.md)
- [事件监听](docs/zh/events.md) / [English](docs/events.md)
- [Service Push](docs/zh/service-push.md) / [English](docs/service-push.md)
- [Kafka bridge](docs/zh/kafka-bridge.md) / [English](docs/kafka-bridge.md)

## 开发

```bash
bun run test
bun run typecheck
bun run build
```

## 包

- `@mqttkit/core`：core application、router、middleware、context、schema 校验、RPC、event types、broker adapter 接口，以及 `@mqttkit/core/testing` 内存 broker。
- `@mqttkit/aedes`：Aedes adapter，提供 TCP MQTT 与 MQTT-over-WebSocket（透传 MQTT 5 properties 给 RPC 用）。
- `@mqttkit/asyncapi`：基于路由生成 AsyncAPI 3.0 文档与 HTTP 浏览页面。
- `@mqttkit/typebox`：TypeBox schema 适配——注册一次，直接传原始 `Type.X(...)`。
- `@mqttkit/zod`：给 zod schema 挂上 JSON Schema 表达，让 AsyncAPI 输出完整 payload。
