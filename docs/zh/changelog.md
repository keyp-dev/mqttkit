---
sidebar: false
aside: false
---

# 更新日志

本 monorepo 的所有重要变更都记录在这里。每个包的发布遵循 [语义化版本](https://semver.org/lang/zh-CN/spec/v2.0.0.html)；
下面的条目按版本日期分组，便于查看跨包同步发布的变更。

格式大致基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/)。

## 2026-06-23 — 质量优化

`@mqttkit/core@0.2.2`、`@mqttkit/asyncapi@0.2.1`、`@mqttkit/zod@0.1.1`。
`@mqttkit/aedes` 和 `@mqttkit/typebox` 本轮没有发布变更。

### 新增 — `@mqttkit/core` 0.2.2

- **可插拔 logger**（`app.logger(logger)`）。替换内部用于排空超时、未注册
  `onError` 时的校验失败、以及用户 metric/error 回调中抛出异常时使用的
  `console.*` 调用。默认仍为 console（`consoleLogger`）；可传入
  `noopLogger` 静音，或自定义实现将日志转发到 pino / OpenTelemetry /
  Sentry。App 插件可通过 `app.getLogger()` 读取当前 logger。
- **`MqttPacket` 类型导出**。重新导出 broker 原生的 packet 别名，并附带
  说明：为什么它在结构上保持不透明（由 `readPacketProperties` 负责安全
  读取）。
- **更严格的共享订阅解析**（`parseSharedSubscription`）。拒绝此前未被
  捕获的非法过滤器：折叠后仅剩 `/`、group 名称中包含 NUL 字节、以及
  MQTT 通配符（`+`、`#`）出现在 remainder 中不合规的位置。

### 变更 — `@mqttkit/asyncapi` 0.2.1

- 内置 HTTP 服务在 `listen()` 失败时会包装错误并带上 host/port（端口冲突
  会给出可操作的提示，而不是裸的 `EADDRINUSE`），并挂载常驻的 `error`
  监听器以捕获启动后的失败。启动日志从 `console.log` 改为
  `app.getLogger()`。
- 新增测试套件覆盖 builder schema 解析、YAML 输出的边界场景、handler
  缓存失效，以及端到端 HTTP 路由（包含端口冲突的错误表面）。

### 修复 — `@mqttkit/zod` 0.1.1

- `peerDependencies` 现在声明了 `@mqttkit/core`。此前该约束只存在于
  `typebox`，因此单独安装 `zod` 时可能默默解析到不匹配的 core 版本。

## 2026-06-22 — 0.2.1

`@mqttkit/core@0.2.1`

### 新增 — `@mqttkit/core` 0.2.1

- **MQTT 5 共享订阅**（`$share/<group>/<filter>`）。
  `parseSharedSubscription()` 遵循 §4.8.2；`canSubscribe()` 在路由匹配前
  剥离前缀，并将 `shared.group` 暴露给订阅策略。让你可以在一个 broker
  后部署多个消费实例，而无需自定义负载均衡。
- **每路由 `timeout` 与 `concurrency`**。`topic({ timeout, concurrency })`
  为 handler 执行加保护。超时表现为 `phase: 'timeout'`；并发拒绝表现为
  `phase: 'overload'`。Inflight 计数挂在路由上，供 metrics 与优雅关停
  使用。
- **`app.onMetric(handler)`**。每次 dispatch 与每次 publish 各发出一次
  结构化 `MqttMetricEvent` —— `{ type, topic, route?, durationMs, result,
  errorPhase? }`。设计为可直接对接 Prometheus / OpenTelemetry / statsd，
  无需在每个路由外包一层中间件。
- **优雅关停**。`app.stop({ drain: true, timeout: 30_000 })` 现在是默认
  行为：dispatcher 拒绝新的入站 dispatch、轮询每个路由的 `inflight` 直至
  归零（或超时），然后运行 `onStop` 钩子、取消进行中的 RPC、停止 broker
  适配器。`app.activeCount()` 报告当前所有在飞 handler 的总和，可用于
  健康检查。传入 `{ drain: false }` 可回退到旧的立即关停。
- **`ctx` 上的 MQTT 5 user properties**。`ctx.userProperties` 将入站的
  `packet.properties.userProperties` 暴露为扁平只读视图，中间件可以
  无需触碰适配器特定的 packet 结构即可提取 `traceparent`、关联 ID 或
  任意旁路元数据。
- **出站发布钩子**。`app.onBeforePublish(hook)` 在每次出站 publish 之前
  立即运行（包括 `app.publish()`、`ctx.publish()` / `ctx.reply()` /
  `app.request()`，它们都汇入同一条路径）。钩子接收一个可变的
  `{ topic, payload, options }` 视图，可以修改 `options` —— 典型用法是
  将 `traceparent` 合并进 `options.properties.userProperties`，让 OTel
  上下文跨 broker 传播。抛出异常会中止 publish，并通过 `onError` 以
  `phase: 'publish'` 浮出。
- **`onError` 携带原始 payload**。`MqttErrorPayload.payload` 对入站阶段
  （`validation` / `policy` / `middleware` / `handler` / `timeout` /
  `overload`）携带原始 buffer，对 `publish` 阶段携带原始 `MqttPayload`。
  让导出器（Sentry、结构化日志）能捕获导致问题的报文内容，而不仅是
  topic。
- **新增文档页面**（位于「生产部署」分组）：`共享订阅`、`Handler 超时
  与并发`、`指标`、`优雅关停`、`Tracing 与 User Properties`（含完整的
  OpenTelemetry 接线示例）。

## 2026-06-22 — 0.2.0

`@mqttkit/core@0.2.0`、`@mqttkit/aedes@0.2.0`、`@mqttkit/asyncapi@0.2.0`、
`@mqttkit/typebox@0.1.0`（首发）、`@mqttkit/zod@0.1.0`（首发）。

### 新增 — `@mqttkit/core` 0.2.0

- **Schema 校验**。`topic({ schema })` 接收任意 [Standard
  Schema v1](https://standardschema.dev/) 校验器（zod ≥3.24、valibot ≥1、
  arktype 等）。校验后的数据通过 `ctx.body` 暴露，并具备完整的类型
  推导。`validate` 选项控制方向（`'inbound' | 'outbound' | 'both' | false`）。
- **SchemaProvider 扩展点**。`app.addSchemaProvider(provider)` 让非
  Standard-Schema 库（如裸 TypeBox）可以接入，而 core 无需依赖它们。
  `MqttkitInferExtensions<T>` 提供仅类型层的注册，用于 `ctx.body` 推导。
- **RPC**。`app.request(topic, payload, options?)` 使用 MQTT 5
  `responseTopic` + `correlationData` 发送请求，并在收到回复时 resolve。
  `ctx.reply(payload)` 在设备侧应答。
- **错误生命周期**。`app.onError(handler)` 及每路由的 `onError` 接收
  结构化负载 `{ error, topic, phase, route, ctx }`。`phase` 取值为
  `middleware | handler | validation | policy | publish`。校验失败会发出
  `SchemaValidationError` 并跳过 `onMessage`。
- **测试入口**。新增 `@mqttkit/core/testing` 子导出，提供
  `createTestApp()` 与内存版的 `TestBroker`（含 `dispatch()` / `onPublish`
  钩子）。让应用可以在不启动 aedes 的情况下进行单元测试。
- **Pattern 模块**。Topic-pattern 匹配抽离到 `pattern.ts`，并从包根
  导出。

### 新增 — `@mqttkit/aedes` 0.2.0

- 调用 `broker.publish` 时转发 MQTT 5 publish 属性（`responseTopic`、
  `correlationData`、`contentType`、`messageExpiryInterval`、
  `userProperties`、`payloadFormatIndicator`）。这是 `app.request()` RPC
  往返所必需的。
- `@mqttkit/core` 的 peer 版本升至 `^0.2.0`。

### 新增 — `@mqttkit/asyncapi` 0.2.0

- `resolvePayloadSchema()`：实现 Standard Schema 的路由 schema 现在会被
  归约为生成文档所用的 JSON Schema。顺序：
  1. 原始 JSON Schema 对象 —— 直接采用
  2. 附带 `~jsonSchema` 的 Standard Schema —— 使用附带的 schema
  3. 兜底：`{ description: 'Validated by <vendor>' }`
- 让 `@mqttkit/zod` 的 `jsonify()`（以及 TypeBox 原生的 JSON Schema 形态）
  能流入 AsyncAPI 文档。
- `@mqttkit/core` 的 peer 版本升至 `^0.2.0`。

### 新增 — `@mqttkit/typebox` 0.1.0（首发）

- `typeboxProvider`：用 `app.addSchemaProvider(typeboxProvider)` 注册后，
  即可将裸 `Type.X(...)` schema 直接传给 `topic({ schema })`。通过
  `Kind` 符号识别 TypeBox schema，并经由 `@sinclair/typebox/value`
  校验。
- 仅类型层的模块增强，让 `ctx.body` 通过 `Static<T>` 推导。
- TypeBox schema 本身就是 JSON Schema，因此 `@mqttkit/asyncapi` 会自动
  输出完整 payload。

### 新增 — `@mqttkit/zod` 0.1.0（首发）

- `jsonify(schema, options?)`：在 `~jsonSchema` 下挂载 JSON Schema
  表示，并返回同一个 zod 实例。补齐了 `@mqttkit/asyncapi` 因为 zod 3.x
  默认不暴露 JSON Schema 而只能回退到 `Validated by zod` 的空白。
- zod ≥3.24 已经实现 Standard Schema，运行时校验无需 `jsonify` —— 该
  辅助函数仅在输出 AsyncAPI 文档时需要。

### 示例

- 新增 `examples/schema-validation`，含 `zod`、`typebox`、`coexist`、
  `manual` 四个变体。
- 新增 `examples/rpc`，演示 `app.request()` / `ctx.reply()`。
- `examples/asyncapi-docs` 默认改用 TypeBox 变体；新增 `dev:zod` 脚本，
  展示 zod + `jsonify` 流入 AsyncAPI 文档。

### 内部

- 根 `tsconfig.json` 排除 `**/dist/**`，避免并行构建时一个包的 tsup
  扫描到另一个包正在清理中的 dist 而出现竞态。

## 2026-XX-XX — 首次发布

`@mqttkit/core@0.1.0`、`@mqttkit/aedes@0.1.0`、`@mqttkit/asyncapi@0.1.0`。

框架首次发布：有序中间件、Topic 路由器、带 `decorate()` 服务注入的
强类型 context、broker 生命周期事件、用于服务侧推送的 `app.publish()`、
Aedes TCP + MQTT-over-WebSocket 适配器，以及 AsyncAPI 3.0 文档插件。
