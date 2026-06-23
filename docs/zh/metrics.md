# 指标

`app.onMetric(handler)` 在每条入站消息分发完成时、每次 `app.publish()` 完成时各触发一次结构化事件。用它把数据喂给 Prometheus / OpenTelemetry / statsd / 日志，不用为每个路由手写中间件。

## 事件结构

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

- `result: 'ok'`：handler 跑完 / broker 接受了 publish。
- `result: 'rejected'`（仅 dispatch）：没有路由匹配，或 `publish` 策略返回 `false`。
- `result: 'error'`：pipeline 抛错。看 `errorPhase` 确定阶段：`validation` / `policy` / `middleware` / `handler` / `timeout` / `overload` / `publish`。

`durationMs` 用 `process.hrtime.bigint()` 测量。dispatch 包括 middleware + handler；publish 包括 schema 校验 + broker 的 `publish()`。

## Prometheus 示例

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

`route.pattern` label 保持基数可控（是 pattern 而不是具体 topic），所以一百万条 `devices/:uid/events` 消息汇聚成一条时间序列。

## OpenTelemetry 示例

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

## 可运行示例

[`examples/metrics-prometheus`](https://github.com/keyp-dev/mqttkit/tree/main/examples/metrics-prometheus) 把 `onMetric`、`onError`、`app.getRoutes()` 接到 `prom-client`，并在 9090 端口暴露 `/metrics`，直接当模板用：

```bash
bun install
bun run --cwd examples/metrics-prometheus dev
# MQTT broker: mqtt://localhost:1883
# Prometheus 抓取地址: http://localhost:9090/metrics
```

输出了 `mqtt_dispatch_seconds`、`mqtt_publish_seconds`、`mqtt_inflight`、`mqtt_active_total`、`mqtt_overload_total`、`mqtt_timeout_total`——足够覆盖堆积告警、慢 handler、丢消息三个核心维度，不用自己拼聚合逻辑。

## handler 安全

多个 handler 按注册顺序运行并被 `await`。某个 handler 抛错时会被捕获并打印（`[mqttkit] metric handler threw: …`），不会中断消息处理。

## 不包含的内容

`onMetric` 故意保持窄接口——每次 dispatch 一个事件、每次 publish 一个事件。不暴露"当前 in-flight 数"、"队列深度"等 gauge。需要时自己埋点（或者从 [`app.getRoutes()`](https://github.com/keyp-dev/mqttkit/blob/main/packages/core/src/app.ts) 读取 `TopicRoute.inflight`）。
