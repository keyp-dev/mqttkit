# Aedes WebSocket

跟 Aedes 基础结构一致，但关掉 TCP，broker 监听在 `ws://localhost:8888/mqtt`。适合浏览器端 MQTT 客户端（`mqtt.js` over WebSocket）。

```bash
bun run --cwd examples/aedes-ws dev
```

## 源码

<<< ../../../examples/aedes-ws/src/index.ts

[在 GitHub 查看](https://github.com/keyp-dev/mqttkit/tree/main/examples/aedes-ws)
