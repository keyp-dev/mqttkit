# Graceful Shutdown

Production deployments need a clean stop: when Kubernetes sends SIGTERM, the process must finish in-flight handlers before the broker socket closes, or messages get dropped half-processed.

`app.stop()` drains by default. It refuses new inbound dispatches, waits for every route's `inflight` counter to hit zero (or the timeout), then runs `onStop` hooks, cancels pending RPC requests, and closes the broker adapter.

## API

```ts
await app.stop({
  drain: true,      // default; set false for legacy immediate shutdown
  timeout: 30_000,  // max ms to wait for in-flight handlers
})
```

`app.activeCount()` returns the current in-flight total — useful for health checks or logs while a drain is in progress.

## SIGTERM wiring

```ts
const shutdown = async (signal: NodeJS.Signals) => {
  console.log(`[server] received ${signal}, draining…`)
  await app.stop({ drain: true, timeout: 30_000 })
  process.exit(0)
}
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
```

## Order of operations

```mermaid
flowchart LR
  Stop([app.stop call]) --> Closing[dispatcher.closing = true<br/>refuse new dispatches]
  Closing --> Drain[wait for activeCount = 0<br/>or timeout]
  Drain --> Hooks[run onStop hooks<br/>in reverse]
  Hooks --> Rpc[cancel in-flight RPC]
  Rpc --> Broker[broker.stop]
  Broker --> Done([process can exit])
```

## What it does not do

- **The broker keeps accepting new TCP connections during drain.** mqttkit refuses to *dispatch* anything once closing, but the bundled Aedes adapter does not pause its listener. For zero-disruption rolling deploys, stop sending traffic to the pod at the load balancer / readiness-probe level first.
- **It does not cancel handlers.** JavaScript has no preemption — if a handler blocks forever, drain hits its timeout and logs a warning. Combine with [route `timeout`](./handler-limits) so individual handlers cannot stall the drain.
- **It does not retry failed publishes during the drain.** `onStop` hooks that need to flush state should `await` the publish themselves.

## Drain timeout behaviour

If the timeout elapses with handlers still running:

- `app.stop()` logs `[mqttkit] stop() drain timed out after Xms; N handler(s) still in-flight`.
- Shutdown continues anyway — `onStop` hooks run, RPC is cancelled, the broker stops.
- The orphaned handlers keep running until they finish or the process exits.

Pick the timeout to match your SLA: typically the longest reasonable handler run-time plus a small buffer.
