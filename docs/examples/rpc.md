# MQTT 5 RPC

Request/response over MQTT 5 properties (`responseTopic` + `correlationData`). Uses the in-memory `TestBroker` from `@mqttkit/core/testing` because aedes 0.51.3 strips MQTT 5 properties when delivering to subscribers.

```bash
bun run --cwd examples/rpc dev
```

## Source

<<< ../../examples/rpc/src/index.ts

[View on GitHub](https://github.com/keyp-dev/mqttkit/tree/main/examples/rpc) · [RPC guide](../rpc)
