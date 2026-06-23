# Prometheus Metrics

Full observability template: `onMetric` + `onError` + `app.getRoutes()` wired into `prom-client`, exposing `/metrics` on port 9090. Demonstrates `timeout` + `concurrency` route guards so the `overload` / `timeout` counters have something to fire on.

```bash
bun run --cwd examples/metrics-prometheus dev
```

- MQTT broker: `mqtt://localhost:1883`
- Prometheus scrape: `http://localhost:9090/metrics`

## Exposed metrics

| Metric | Type | Source |
|---|---|---|
| `mqtt_dispatch_seconds` | histogram | `onMetric` (dispatch events) |
| `mqtt_publish_seconds` | histogram | `onMetric` (publish events) |
| `mqtt_inflight` | gauge | `app.getRoutes()` per-route `inflight` |
| `mqtt_active_total` | gauge | `app.activeCount()` |
| `mqtt_overload_total` | counter | `onError({ phase: 'overload' })` |
| `mqtt_timeout_total` | counter | `onError({ phase: 'timeout' })` |

## Source

<<< ../../examples/metrics-prometheus/src/index.ts

[View on GitHub](https://github.com/keyp-dev/mqttkit/tree/main/examples/metrics-prometheus) · [Metrics guide](../metrics) · [Handler Limits guide](../handler-limits)
