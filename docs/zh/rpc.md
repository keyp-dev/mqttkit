# RPC

::: tip 完整指南正在编写中
本页为占位页。当前请参考 [`@mqttkit/core` README — RPC](https://github.com/keyp/mqttkit/blob/main/packages/core/README.zh-CN.md#rpc) 获取详细信息。
:::

mqttkit 基于 MQTT 5 的 `responseTopic` + `correlationData` 实现 request/response。服务端调用 `app.request(topic, payload, { timeout })` 并等待回复；设备端通过 `topic({ onMessage })` handler 处理消息，并调用 `ctx.reply(payload)` 回复。

`@mqttkit/aedes` 会透传 RPC 所需的 MQTT 5 publish properties（`responseTopic`、`correlationData`、`contentType`、`messageExpiryInterval`、`userProperties`、`payloadFormatIndicator`）。

## 示例

参考 [`examples/rpc`](https://github.com/keyp/mqttkit/tree/main/examples/rpc) 中的端到端示例。
