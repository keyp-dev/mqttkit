# AsyncAPI Standalone

Generates AsyncAPI 3.0 from registered routes and serves browsable docs on its own HTTP server. One TypeBox schema powers runtime validation, static `ctx.body` typing, and AsyncAPI payload at once.

```bash
bun run --cwd examples/asyncapi-docs dev
```

- MQTT: `mqtt://localhost:1883`
- AsyncAPI JSON: `http://localhost:9000/asyncapi.json`
- AsyncAPI YAML: `http://localhost:9000/asyncapi.yaml`
- Rendered docs: `http://localhost:9000/docs`

## Source

::: code-group
<<< ../../examples/asyncapi-docs/src/index.ts [index.ts]
<<< ../../examples/asyncapi-docs/src/zod.ts [zod.ts]
:::

[View on GitHub](https://github.com/keyp-dev/mqttkit/tree/main/examples/asyncapi-docs)
