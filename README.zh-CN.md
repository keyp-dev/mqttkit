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

## App API 一览

下列方法都返回 `this`，可以链式调用：

| 方法 | 用途 |
| --- | --- |
| `use(plugin \| middleware)` | 注册 plugin（`router()`、broker 适配器…）或全局 middleware。 |
| `decorate(key, value)` | 把服务注入 `ctx.services`，类型推断会沿用到 App 泛型。 |
| `on(eventName, handler)` | 监听 broker lifecycle event（`client.connect`、`client.subscribe`…）。 |
| `onStart(hook)` / `onStop(hook)` | `listen()` 成功后或 `stop()` 之前运行的钩子。 |
| `onError(handler)` | 应用级错误漏斗——接收 `{ error, topic, phase, route, ctx }`。 |
| `onMetric(handler)` | 每次 dispatch / publish 完成时发结构化指标，对接 Prometheus / OTel。 |
| `onBeforePublish(hook)` | 出站发布前修改 `{ topic, payload, options }`（例如注入 `traceparent`）。 |
| `logger(logger)` | 把 mqttkit 内部告警导入 pino / OpenTelemetry / Sentry 管线。 |
| `addSchemaProvider(provider)` | 注册非 Standard-Schema 的校验器（如裸 TypeBox）。 |
| `publish(topic, payload, opts?)` | 服务端主动发布（同样走 `onBeforePublish`）。 |
| `request(topic, payload, opts?)` | MQTT 5 RPC，支持 `retries` / `retryDelay`。 |
| `stop({ drain?, timeout? })` | 优雅停机——默认会等 in-flight handler 排空。 |

### 错误处理示例

```ts
import { MqttApp, router } from '@mqttkit/core'

const app = new MqttApp()
  .use(adapter)
  .onError(({ error, phase, topic }) => {
    // phase 取值: middleware | handler | validation | policy | publish | timeout | overload
    sentry.captureException(error, { tags: { topic, phase } })
  })
  .use(
    router().topic('devices/:uid/events', {
      timeout: 1_000,
      concurrency: 100,
      onError: ({ error }) => metrics.routeFailures.inc(), // 路由级，先于应用级运行
      async onMessage(ctx) {
        await doWork(ctx)
      },
    }),
  )
```

### 自定义 logger

```ts
import { MqttApp, type MqttLogger } from '@mqttkit/core'
import { pino } from 'pino'

const log = pino({ name: 'mqttkit' })
const logger: MqttLogger = {
  debug: (msg, meta) => log.debug(meta, msg),
  info: (msg, meta) => log.info(meta, msg),
  warn: (msg, meta) => log.warn(meta, msg),
  error: (msg, meta) => log.error(meta, msg),
}

new MqttApp().logger(logger)
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

[`examples/`](./examples) 下有可运行示例：TCP / WebSocket broker、lifecycle events、service push、Kafka bridge、schema 校验、MQTT 5 RPC（含 `app.request({ retries, retryDelay })`）、AsyncAPI 文档（独立 HTTP 或与 Elysia 复用端口）、Prometheus 指标，以及自定义 JSON logger（`examples/custom-logger`）。

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

## 发布

`scripts/publish.mjs` 会把每个包的本地版本和 npm registry 比较，**只发布**本地版本领先（或 npm 上还不存在）的包；已经同步的包会被静默跳过。

```bash
bun run publish:status      # 仅打印 local vs npm 状态，不发布
bun run publish:dry-run     # 跑一次 dry-run 流水线
bun run publish:packages    # 发布所有需要发布的包

# 指定单个包（同样会先做版本检查）
bun run publish:core

# 跳过检查强制发布（一般用不到）
node scripts/publish.mjs --force
```
