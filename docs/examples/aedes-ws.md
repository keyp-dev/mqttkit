# Aedes WebSocket

Same as Aedes Basic but TCP is disabled and the broker listens on `ws://localhost:8888/mqtt`. Useful for browser-based MQTT clients (`mqtt.js` over WebSocket).

```bash
bun run --cwd examples/aedes-ws dev
```

## Source

<<< ../../examples/aedes-ws/src/index.ts

[View on GitHub](https://github.com/keyp-dev/mqttkit/tree/main/examples/aedes-ws)
