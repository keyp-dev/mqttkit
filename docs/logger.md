# Logger

mqttkit emits warnings and errors from inside the framework itself — drain timeouts, schema-validation failures with no `onError` handler, exceptions thrown by user `onMetric` / `onError` handlers, internal lifecycle notes. All of these flow through a single pluggable `MqttLogger`.

The default is `consoleLogger` (backed by `console.debug` / `console.info` / `console.warn` / `console.error`). Swap it once with `app.logger(...)` to forward into pino, OpenTelemetry, Sentry, or any structured log pipeline.

## Interface

```ts
type MqttLogger = {
  debug(message: string, meta?: Record<string, unknown>): void
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}
```

Every call passes a human message plus a `meta` bag. The keys are stable per call site (e.g. `topic` / `phase` for validation, `timeoutMs` / `inflight` for drain timeouts, `error` for caught exceptions).

## API

```ts
import { MqttApp, consoleLogger, noopLogger } from '@mqttkit/core'

const app = new MqttApp()
  .logger(noopLogger) // silence the framework entirely
// app.logger(consoleLogger) // restore default
// app.getLogger() returns the active logger — plugins can use it.
```

Calling `app.logger(...)` replaces the active logger; there is no chain.

## What gets logged

| Trigger | Level | `message` | `meta` keys |
| --- | --- | --- | --- |
| Schema validation fails and no `onError` is wired | `warn` | `Schema validation failed for topic "<topic>": <issues>` | `topic`, `phase: 'validation'` |
| `onMetric` handler throws | `error` | `metric handler threw` | `error` |
| `onError` handler itself throws | `error` | `error handler threw` | `error` |
| `app.stop({ drain: true })` times out before inflight reaches 0 | `warn` | `mqttkit drain timed out; some handlers may still be running` | `timeoutMs`, `inflight` |

This list is intentionally small. mqttkit does not log per-message activity — that is what `onMetric` is for.

## pino example

```ts
import { MqttApp, type MqttLogger } from '@mqttkit/core'
import { pino } from 'pino'

const log = pino({ name: 'mqttkit' })

const logger: MqttLogger = {
  debug: (msg, meta) => log.debug(meta, msg),
  info: (msg, meta) => log.info(meta, msg),
  warn: (msg, meta) => log.warn(meta, msg),
  error: (msg, meta) => log.error(meta, msg),
}

new MqttApp().logger(logger)
```

## OpenTelemetry / Sentry example

```ts
import { logs } from '@opentelemetry/api-logs'
import * as Sentry from '@sentry/node'
import type { MqttLogger } from '@mqttkit/core'

const otelLogger = logs.getLogger('mqttkit')

const logger: MqttLogger = {
  debug: (body, attributes) => otelLogger.emit({ severityText: 'DEBUG', body, attributes }),
  info: (body, attributes) => otelLogger.emit({ severityText: 'INFO', body, attributes }),
  warn: (body, attributes) => otelLogger.emit({ severityText: 'WARN', body, attributes }),
  error: (body, attributes) => {
    otelLogger.emit({ severityText: 'ERROR', body, attributes })
    const err = attributes?.error
    if (err instanceof Error) Sentry.captureException(err, { tags: { source: 'mqttkit' } })
  },
}
```

## Silencing

```ts
import { MqttApp, noopLogger } from '@mqttkit/core'

const app = new MqttApp().logger(noopLogger)
```

Useful in tests, or when you forward everything to `onError` / `onMetric` and want zero stderr noise.

## Runnable example

[`examples/custom-logger`](https://github.com/keyp-dev/mqttkit/tree/main/examples/custom-logger) ships a minimal JSON-line logger and triggers all three of the warn/error paths so you can see the shape of the `meta` payloads.
