# Kafka Bridge

MQTT ↔ Kafka 双向桥接。入站的 MQTT 事件 produce 到 Kafka，Kafka 命令 topic 反向 publish 回 MQTT。用内存版 Kafka stub，免装基础设施。

```bash
bun run --cwd examples/kafka-bridge dev
```

## 源码

<<< ../../../examples/kafka-bridge/src/index.ts

[在 GitHub 查看](https://github.com/keyp-dev/mqttkit/tree/main/examples/kafka-bridge) · [Kafka Bridge 指南](../kafka-bridge)
