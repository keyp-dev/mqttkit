# Aedes 基础 (TCP)

最小 mqttkit app：Aedes TCP broker、用户名鉴权、审计中间件、publish 时校验 `params.uid === principal.uid`。

```bash
bun run --cwd examples/aedes-basic dev
```

监听 `mqtt://localhost:1883`，任意 MQTT 客户端可连。

## 源码

<<< ../../../examples/aedes-basic/src/index.ts

[在 GitHub 查看](https://github.com/keyp-dev/mqttkit/tree/main/examples/aedes-basic)
