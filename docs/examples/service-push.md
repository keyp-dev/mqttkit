# Service Push

Drives MQTT publishes from a business service (e.g., billing → "invoice paid" notifications). Shows how `app.publish()` integrates with arbitrary service events outside the request/response cycle.

```bash
bun run --cwd examples/service-push dev
```

## Source

<<< ../../examples/service-push/src/index.ts

[View on GitHub](https://github.com/keyp-dev/mqttkit/tree/main/examples/service-push) · [Service Push guide](../service-push)
