# @mqttkit/core

[English](README.md)

TypeScript 写的 Elysia 风格 MQTT 应用框架。提供运行时：有序 middleware、topic router、类型化 context、服务注入、lifecycle events、RPC、schema 校验、指标、优雅关停，以及 broker adapter 接口。

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
  .use(aedes({ tcp: { port: 1883 }, ws: { port: 8888, path: '/mqtt' } }))
  .use(
    router().topic('devices/:uid/events', {
      async onMessage(ctx) {
        await ctx.publish(`server/${ctx.params.uid}/echo`, ctx.payload)
      },
    }),
  )

await app.listen()
```

## 功能

- **路由与 middleware** —— `router().topic(pattern, config)` 用 Elysia 风格 `:param` / `*`；`app.use()` 有序 middleware；`app.decorate()` 注入业务服务。
- **Schema 校验** —— `topic({ schema })` 接任意 [Standard Schema v1](https://standardschema.dev/) 校验器；原始 TypeBox 通过 `addSchemaProvider` 接入。
- **MQTT 5 RPC** —— `app.request(topic, payload)` / `ctx.reply(payload)` 走 `responseTopic` + `correlationData`。
- **MQTT 5 共享订阅** —— 自动识别 `$share/<group>/<filter>`，剥前缀后用真正 filter 匹配路由，并把 group 透到 subscribe policy 的 `shared.group`。
- **路由级护栏** —— `topic({ timeout, concurrency })`；触发后 `onError` phase 分别是 `'timeout'` / `'overload'`。
- **指标** —— `app.onMetric(handler)` 每次 dispatch / publish 触发一次结构化事件。
- **优雅关停** —— `app.stop({ drain: true, timeout })` 等在飞 handler 跑完再关 broker；`app.activeCount()` 看在飞总数。
- **Tracing** —— `ctx.userProperties` 读入站 MQTT 5 user properties；`app.onBeforePublish(hook)` 给出站注 user properties（W3C `traceparent`、correlation ID 等）。
- **生命周期** —— `app.on(eventName, handler)` 监听 broker 事件；`app.onStart` / `app.onStop` 是应用边界。
- **测试** —— `@mqttkit/core/testing` 提供内存版 `TestBroker`，跑单测不用起 aedes。

`onError` 阶段：`validation | policy | middleware | handler | timeout | overload | publish`。错误负载里带原始 `payload`，方便 Sentry / 结构化日志拿到出错的消息内容。

## 文档

- [快速开始](https://mqttkit.keyp.dev/zh/getting-started)
- [Schema 校验](https://mqttkit.keyp.dev/zh/schema) · [RPC](https://mqttkit.keyp.dev/zh/rpc) · [事件监听](https://mqttkit.keyp.dev/zh/events)
- [共享订阅](https://mqttkit.keyp.dev/zh/shared-subscriptions) · [Handler 超时与并发](https://mqttkit.keyp.dev/zh/handler-limits) · [指标](https://mqttkit.keyp.dev/zh/metrics)
- [优雅关停](https://mqttkit.keyp.dev/zh/graceful-shutdown) · [Tracing 与 User Properties](https://mqttkit.keyp.dev/zh/tracing)
- [测试](https://mqttkit.keyp.dev/zh/testing)
