# 示例

可运行示例都在 [`examples/`](https://github.com/keyp-dev/mqttkit/tree/main/examples)。所有示例都用 workspace 依赖，仓库根目录 `bun install` 一次即可。

```bash
bun install
bun run --cwd examples/<name> dev
```

## 入门

- [Aedes 基础 (TCP)](./aedes-basic) —— 最小 TCP broker，含用户名鉴权、审计中间件、publish 策略路由。
- [Aedes WebSocket](./aedes-ws) —— 同结构但只暴露 MQTT-over-WebSocket。
- [生命周期事件](./events) —— 通过 `app.on(eventName)` 订阅 broker 级事件（`client`、`publish`、`subscribe` 等）。

## 消息处理

- [Schema 校验](./schema-validation) —— TypeBox 与 zod payload 校验对照，加 `onError` 处理失败消息。
- [MQTT 5 RPC](./rpc) —— 用 `@mqttkit/core/testing` 内存版 broker 演示请求/响应。

## 集成

- [Service Push](./service-push) —— 业务服务事件驱动 MQTT publish。
- [Kafka Bridge](./kafka-bridge) —— MQTT ↔ Kafka 双向桥接。
- [AsyncAPI 独立服务](./asyncapi-docs) —— 独立 HTTP 上输出 AsyncAPI 3.0 + 渲染页面。
- [AsyncAPI + Elysia](./asyncapi-elysia) —— 一个 Node http.Server 同时跑 MQTT-over-WS 与 Elysia HTTP。

## 可观测性

- [Prometheus 指标](./metrics-prometheus) —— `onMetric` + `onError` + `inflight` gauge 接入 `prom-client` 的完整模板。
