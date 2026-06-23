# MQTT 5 RPC

基于 MQTT 5 properties（`responseTopic` + `correlationData`）的请求/响应。由于 aedes 0.51.3 在派发给订阅者时会丢掉这些 properties，示例用 `@mqttkit/core/testing` 的内存版 `TestBroker` 跑。

```bash
bun run --cwd examples/rpc dev
```

## 源码

<<< ../../../examples/rpc/src/index.ts

[在 GitHub 查看](https://github.com/keyp-dev/mqttkit/tree/main/examples/rpc) · [RPC 指南](../rpc)
