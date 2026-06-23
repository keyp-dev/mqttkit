# Metrics

`app.onMetric(handler)` emits a structured event once per inbound dispatch and once per `app.publish()`. Use it to feed Prometheus, OpenTelemetry, statsd, or plain logs without writing middleware around every route.

## Event shape

```ts
type MqttMetricEvent =
  | {
      type: 'dispatch'
      topic: string
      route?: { pattern: string; meta?: unknown }
      durationMs: number
      result: 'ok' | 'rejected' | 'error'
      errorPhase?: MqttErrorPhase
    }
  | {
      type: 'publish'
      topic: string
      durationMs: number
      result: 'ok' | 'error'
      errorPhase?: 'publish'
    }
```

- `result: 'ok'` — handler ran to completion / broker accepted the publish.
- `result: 'rejected'` (dispatch only) — no route matched, or a `publish` policy returned `false`.
- `result: 'error'` — pipeline threw. Check `errorPhase` for the precise stage: `validation` / `policy` / `middleware` / `handler` / `timeout` / `overload` / `publish`.

`durationMs` is measured with `process.hrtime.bigint()` and includes middleware + handler time for dispatch, or schema-check + broker `publish()` for publish.

## Prometheus example

```ts
import { Histogram } from 'prom-client'

const dispatchHist = new Histogram({
  name: 'mqtt_dispatch_seconds',
  help: 'mqttkit dispatch duration',
  labelNames: ['route', 'result', 'error_phase'],
  buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1, 5],
})

const publishHist = new Histogram({
  name: 'mqtt_publish_seconds',
  help: 'mqttkit publish duration',
  labelNames: ['topic', 'result'],
  buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1],
})

app.onMetric((event) => {
  if (event.type === 'dispatch') {
    dispatchHist
      .labels(event.route?.pattern ?? 'unmatched', event.result, event.errorPhase ?? '')
      .observe(event.durationMs / 1000)
  } else {
    publishHist.labels(event.topic, event.result).observe(event.durationMs / 1000)
  }
})
```

The `route.pattern` label keeps cardinality bounded (it's the pattern, not the concrete topic), so a million `devices/:uid/events` messages collapse into one time series.

## OpenTelemetry example

```ts
import { metrics as otel } from '@opentelemetry/api'

const meter = otel.getMeter('mqttkit')
const dispatch = meter.createHistogram('mqtt.dispatch.duration', { unit: 'ms' })
const publish = meter.createHistogram('mqtt.publish.duration', { unit: 'ms' })

app.onMetric((event) => {
  if (event.type === 'dispatch') {
    dispatch.record(event.durationMs, {
      'mqtt.route': event.route?.pattern ?? 'unmatched',
      'mqtt.result': event.result,
      'mqtt.error_phase': event.errorPhase ?? '',
    })
  } else {
    publish.record(event.durationMs, {
      'mqtt.topic': event.topic,
      'mqtt.result': event.result,
    })
  }
})
```

## Runnable example

[`examples/metrics-prometheus`](https://github.com/keyp-dev/mqttkit/tree/main/examples/metrics-prometheus) wires `onMetric`, `onError`, and `app.getRoutes()` into `prom-client` and serves `/metrics` on port 9090. Use it as a starting template:

```bash
bun install
bun run --cwd examples/metrics-prometheus dev
# MQTT broker on mqtt://localhost:1883
# Prometheus scrape endpoint on http://localhost:9090/metrics
```

It exposes `mqtt_dispatch_seconds`, `mqtt_publish_seconds`, `mqtt_inflight`, `mqtt_active_total`, `mqtt_overload_total`, and `mqtt_timeout_total` — enough to alert on backlog, slow handlers, and dropped messages without writing any aggregation glue yourself.

## Handler safety

Multiple handlers run in registration order and are awaited. If a handler throws, the failure is caught and reported through the active [`MqttLogger`](./logger) as `logger.error('metric handler threw', { error })` so a bad exporter cannot break message processing.

## What you do not get

`onMetric` is intentionally narrow — one event per dispatch, one per publish. It does not expose gauges like "current in-flight count" or "queue depth". If you need those, derive them from `inflight` tracking in your own code (or poll [`app.getRoutes()`](https://github.com/keyp-dev/mqttkit/blob/main/packages/core/src/app.ts) — `inflight` is on `TopicRoute`).
