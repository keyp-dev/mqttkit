# AsyncAPI + Elysia

Shares one `node:http` server between MQTT-over-WebSocket (handled by aedes) and an Elysia HTTP app that serves AsyncAPI docs. Useful when you don't want two separate ports.

```bash
bun run --cwd examples/asyncapi-elysia dev
```

Everything lives on `:3300` — MQTT WS on `/mqtt`, AsyncAPI HTTP routes alongside.

## Source

<<< ../../examples/asyncapi-elysia/src/index.ts

[View on GitHub](https://github.com/keyp-dev/mqttkit/tree/main/examples/asyncapi-elysia)
