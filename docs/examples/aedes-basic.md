# Aedes Basic (TCP)

Smallest possible mqttkit app: Aedes TCP broker, username-based auth, audit middleware, and a route that enforces `params.uid === principal.uid` on publish.

```bash
bun run --cwd examples/aedes-basic dev
```

Listens on `mqtt://localhost:1883`. Connect with any MQTT client.

## Source

<<< ../../examples/aedes-basic/src/index.ts

[View on GitHub](https://github.com/keyp-dev/mqttkit/tree/main/examples/aedes-basic)
