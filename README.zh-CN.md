# mqttkit

[English](README.md)

用 Elysia 风格组织 MQTT 应用：通过 `new MqttApp().use(...).use(router(...))` 组合 broker adapter、middleware、topic router、认证、事件监听和业务服务。

mqttkit 不重新实现 MQTT 协议。CONNECT、SUBSCRIBE、PUBLISH、QoS、retain、session、persistence、MQTT-over-WebSocket 等协议语义由 Aedes 等 broker 负责；mqttkit 负责应用层组织。

完整文档：**<https://mqttkit.keyp.dev/zh/>** ([English](https://mqttkit.keyp.dev))

## 特性

- 有序 `use()` middleware，可用于鉴权、日志、审计、校验和拦截。
- `router().topic()` 声明 MQTT topic route 及发布 / 订阅策略。
- topic 参数（`devices/:uid/events`），payload 校验支持任意 [Standard Schema](https://standardschema.dev/) 校验器，`ctx` 上可注入业务服务。
- MQTT 5 RPC：`app.request()` + `ctx.reply()`。
- MQTT 5 共享订阅（`$share/<group>/<filter>`），原生支持多实例扇出。
- 路由级 `timeout` / `concurrency` 护栏，触发后通过 `onError` 阶段上报。
- `app.onMetric()` 在每次 dispatch / publish 完成时发结构化事件，方便接 Prometheus / OpenTelemetry。
- `app.on()` 监听 broker lifecycle events；`app.publish()` 让 worker 主动推送消息。
- 适配器：`@mqttkit/aedes`（TCP + WebSocket）与 `@mqttkit/asyncapi`（AsyncAPI 3.0 文档）。
- 内存版 `TestBroker` 用于单测。面向 Bun 与 TypeScript。

## 安装

```bash
bun add @mqttkit/core @mqttkit/aedes aedes
```

## 快速开始

```ts
import { aedes } from '@mqttkit/aedes'
import { MqttApp, router } from '@mqttkit/core'

const app = new MqttApp<{ principal?: { uid: string } }>()
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
  .use(
    router<{ principal?: { uid: string } }>()
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

## Schema 校验

`topic({ schema })` 接受任意 [Standard Schema](https://standardschema.dev/) 校验器（zod、valibot、arktype 等）。校验后的 payload 暴露在 `ctx.body` 上，并自动推断类型。

```ts
import { z } from 'zod'

router().topic('devices/:uid/events', {
  schema: { body: z.object({ temperature: z.number() }) },
  async onMessage(ctx) {
    ctx.body.temperature // 自动推断为 number
  },
})
```

原始 TypeBox 用 [`@mqttkit/typebox`](https://mqttkit.keyp.dev/zh/schema)，给 zod 挂 JSON Schema 让 `@mqttkit/asyncapi` 输出完整 payload 用 [`@mqttkit/zod`](https://mqttkit.keyp.dev/zh/schema)。

router、middleware、events、RPC、Kafka 桥接等详见 [快速开始](https://mqttkit.keyp.dev/zh/getting-started)。

## 包

- `@mqttkit/core`：core application、router、middleware、context、schema 校验、RPC、event types、broker adapter 接口，以及 `@mqttkit/core/testing` 内存 broker。
- `@mqttkit/aedes`：Aedes adapter，提供 TCP MQTT 与 MQTT-over-WebSocket（透传 MQTT 5 properties 给 RPC 用）。
- `@mqttkit/asyncapi`：基于路由生成 AsyncAPI 3.0 文档与 HTTP 浏览页面。
- `@mqttkit/typebox`：TypeBox schema 适配——注册一次，直接传原始 `Type.X(...)`。
- `@mqttkit/zod`：给 zod schema 挂上 JSON Schema 表达，让 AsyncAPI 输出完整 payload。

## 示例

[`examples/`](./examples) 下有可运行示例：TCP / WebSocket broker、lifecycle events、service push、Kafka bridge、schema 校验、MQTT 5 RPC、AsyncAPI 文档（独立 HTTP 或与 Elysia 复用端口）、Prometheus 指标。

```bash
bun install
bun run --cwd examples/aedes-basic dev
```

## 开发

```bash
bun run test
bun run typecheck
bun run build
```
