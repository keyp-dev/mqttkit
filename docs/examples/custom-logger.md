# Custom Logger

Plug a structured logger (JSON lines here; pino / OpenTelemetry / Sentry work the same way) into `app.logger(...)` and watch every framework-emitted warn/error flow through it: schema-validation failure, `onMetric` handler crash, and the `app.getLogger().info` entry point.

```bash
bun run --cwd examples/custom-logger dev
```

## Source

<<< ../../examples/custom-logger/src/index.ts

[View on GitHub](https://github.com/keyp-dev/mqttkit/tree/main/examples/custom-logger) · [Logger guide](../logger)
