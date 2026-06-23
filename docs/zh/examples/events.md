# 生命周期事件

演示 broker 级事件：`client`、`clientReady`、`clientDisconnect`、`keepaliveTimeout`、`publish`、`subscribe` 等。每个事件用 `app.on(name, handler)` 打日志——做连接追踪和排查很顺手。

```bash
bun run --cwd examples/events dev
```

监听 `mqtt://localhost:1884` 和 `ws://localhost:8889/mqtt`。

## 源码

<<< ../../../examples/events/src/index.ts

[在 GitHub 查看](https://github.com/keyp-dev/mqttkit/tree/main/examples/events) · [Events 指南](../events)
