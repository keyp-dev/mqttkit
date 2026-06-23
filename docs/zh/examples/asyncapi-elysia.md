# AsyncAPI + Elysia

一个 `node:http` server 同时挂 MQTT-over-WebSocket（aedes 处理）和 Elysia HTTP app（serve AsyncAPI 文档）。适合不想开两个端口的场景。

```bash
bun run --cwd examples/asyncapi-elysia dev
```

所有东西都在 `:3300`——MQTT WS 在 `/mqtt`，AsyncAPI HTTP 路由并列。

## 源码

<<< ../../../examples/asyncapi-elysia/src/index.ts

[在 GitHub 查看](https://github.com/keyp-dev/mqttkit/tree/main/examples/asyncapi-elysia)
