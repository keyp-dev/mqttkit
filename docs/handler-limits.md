# Handler Timeout & Concurrency

Two route-level guards protect production deployments from runaway handlers and traffic spikes:

- `timeout` — kill a handler that runs too long.
- `concurrency` — cap how many handler invocations may be in flight for a route.

Both surface through the `onError` chain so you can choose how loud to be.

## Timeout

```ts
router().topic('devices/:uid/events', {
  timeout: 5000, // ms
  async onMessage(ctx) {
    await persist(ctx.body)
    await kafka.produce('device.events', ctx.payload)
  },
})
```

When the handler exceeds `timeout`, mqttkit:

1. Rejects the handler promise with `HandlerTimeoutError`.
2. Routes the error through the `onError` chain with `phase: 'timeout'`.
3. Returns `false` from dispatch.

The handler coroutine is **not** terminated — JavaScript has no preemption. The timer fires, dispatch returns, and the handler continues running in the background. Use timeout as a **detection** signal, not a kill switch. Real cancellation must be implemented inside the handler (e.g. `AbortController` plumbed into your HTTP / DB clients).

```ts
app.onError(({ phase, error, topic }) => {
  if (phase !== 'timeout') return
  const ttl = (error as { timeoutMs: number }).timeoutMs
  log.warn({ topic, timeoutMs: ttl }, 'mqtt handler timed out')
  metrics.handlerTimeouts.inc({ topic })
})
```

## Concurrency

```ts
router().topic('devices/:uid/events', {
  concurrency: 100,
  async onMessage(ctx) { ... },
})
```

mqttkit tracks `inflight` per route. When `inflight >= concurrency` and a new message arrives, the message is **dropped** before the handler runs and surfaces as `phase: 'overload'`. Dropped means: not queued, not retried — MQTT QoS handling on the broker is unaffected (PUBACK still fires), but the application layer ignores the message.

```ts
app.onError(({ phase, error }) => {
  if (phase !== 'overload') return
  const { concurrency, inflight } = error as { concurrency: number; inflight: number }
  log.warn({ concurrency, inflight }, 'mqtt route overloaded')
  metrics.handlerOverload.inc()
})
```

## When to use which

| Symptom | Guard |
|---|---|
| A handler may hang on a slow downstream service | `timeout` |
| Traffic spikes can pile up faster than handlers can drain | `concurrency` |
| You need both safety nets | combine — they're independent |

`timeout` triggers on individual slow messages; `concurrency` triggers on overall queue depth. They compose.

## Metrics integration

Both phases show up in [metrics](./metrics) as `result: 'error', errorPhase: 'timeout' | 'overload'`, so you can chart drop rates without writing custom counters.

See [`examples/metrics-prometheus`](https://github.com/keyp-dev/mqttkit/tree/main/examples/metrics-prometheus) for a runnable setup that wires `timeout` + `concurrency` + Prometheus exporters together.
