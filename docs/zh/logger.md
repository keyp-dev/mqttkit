# Logger

mqttkit 框架自身会产出告警和错误：drain 超时、没有 `onError` 时的 schema 校验失败、用户 `onMetric` / `onError` handler 抛出的异常、内部生命周期信息——这些全部经过同一个可插拔的 `MqttLogger`。

默认实现是 `consoleLogger`（背后是 `console.debug` / `console.info` / `console.warn` / `console.error`）。通过 `app.logger(...)` 一次替换，即可把这些日志接入 pino、OpenTelemetry、Sentry 或任意结构化日志管道。

## 接口

```ts
type MqttLogger = {
  debug(message: string, meta?: Record<string, unknown>): void
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}
```

每次调用都带一条人类可读 message 和一个 `meta` 字典。`meta` 的 key 在同一调用点是稳定的（例如校验失败带 `topic` / `phase`，drain 超时带 `timeoutMs` / `inflight`，异常捕获带 `error`）。

## API

```ts
import { MqttApp, consoleLogger, noopLogger } from '@mqttkit/core'

const app = new MqttApp()
  .logger(noopLogger) // 完全静音框架日志
// app.logger(consoleLogger) // 恢复默认
// app.getLogger() 返回当前激活的 logger，供插件复用
```

`app.logger(...)` 是替换语义，没有链式叠加。

## 都记录些什么

| 触发场景 | 级别 | `message` | `meta` 字段 |
| --- | --- | --- | --- |
| Schema 校验失败且未注册 `onError` | `warn` | `Schema validation failed for topic "<topic>": <issues>` | `topic`, `phase: 'validation'` |
| `onMetric` handler 抛错 | `error` | `metric handler threw` | `error` |
| `onError` handler 自身抛错 | `error` | `error handler threw` | `error` |
| `app.stop({ drain: true })` 在 inflight 归零前超时 | `warn` | `mqttkit drain timed out; some handlers may still be running` | `timeoutMs`, `inflight` |

这个清单刻意做得很短。mqttkit **不会**记录每条消息的活动——那是 `onMetric` 的职责。

## pino 接入

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

## OpenTelemetry / Sentry 接入

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

## 静音

```ts
import { MqttApp, noopLogger } from '@mqttkit/core'

const app = new MqttApp().logger(noopLogger)
```

适合在测试中使用，或者你已经把所有信号转给 `onError` / `onMetric`，不希望 stderr 有任何噪音的场景。

## 可运行示例

[`examples/custom-logger`](https://github.com/keyp-dev/mqttkit/tree/main/examples/custom-logger) 给出一个最小 JSON 行 logger，并主动触发上表里的三条 warn/error 路径，方便观察 `meta` 的形状。
