# Kafka Bridge

Bidirectional MQTT ↔ Kafka bridge. MQTT inbound events are produced to Kafka; Kafka command topics are pushed back as MQTT publishes. Uses an in-memory Kafka stub so it runs without infrastructure.

```bash
bun run --cwd examples/kafka-bridge dev
```

## Source

<<< ../../examples/kafka-bridge/src/index.ts

[View on GitHub](https://github.com/keyp-dev/mqttkit/tree/main/examples/kafka-bridge) · [Kafka Bridge guide](../kafka-bridge)
