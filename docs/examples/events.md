# Lifecycle Events

Demonstrates broker-level events: `client`, `clientReady`, `clientDisconnect`, `keepaliveTimeout`, `publish`, `subscribe`, etc. Each event is logged with `app.on(name, handler)` — handy for connection tracing and debugging.

```bash
bun run --cwd examples/events dev
```

Listens on `mqtt://localhost:1884` and `ws://localhost:8889/mqtt`.

## Source

<<< ../../examples/events/src/index.ts

[View on GitHub](https://github.com/keyp-dev/mqttkit/tree/main/examples/events) · [Events guide](../events)
