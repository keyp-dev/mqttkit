# Examples

Runnable examples live in [`examples/`](https://github.com/keyp-dev/mqttkit/tree/main/examples). Every example uses workspace dependencies, so a single `bun install` at the repo root is enough.

```bash
bun install
bun run --cwd examples/<name> dev
```

## Getting Started

- [Aedes Basic (TCP)](./aedes-basic) — minimal TCP broker with username auth, audit middleware, and a publish-policy route.
- [Aedes WebSocket](./aedes-ws) — same shape but exposes MQTT over WebSocket only.
- [Lifecycle Events](./events) — subscribe to broker-level events (`client`, `publish`, `subscribe`, …) via `app.on(eventName)`.

## Message Handling

- [Schema Validation](./schema-validation) — TypeBox and zod payload validation, plus `onError` for failed messages.
- [MQTT 5 RPC](./rpc) — request/response over MQTT 5 using the in-memory `TestBroker` from `@mqttkit/core/testing`.

## Integration

- [Service Push](./service-push) — push notifications from a business service into MQTT topics.
- [Kafka Bridge](./kafka-bridge) — bidirectional bridge between MQTT and Kafka, both directions.
- [AsyncAPI Standalone](./asyncapi-docs) — generate AsyncAPI 3.0 + browsable HTML on its own HTTP server.
- [AsyncAPI + Elysia](./asyncapi-elysia) — share a single Node http.Server between MQTT-over-WS and an Elysia HTTP app.

## Observability

- [Prometheus Metrics](./metrics-prometheus) — full `onMetric` + `onError` + `inflight` gauges wired into `prom-client`.
- [Custom Logger](./custom-logger) — plug a JSON-line logger into `app.logger()` and watch all framework-emitted warn/error flow through it.
