# Prometheus 指标

完整可观测性模板：`onMetric` + `onError` + `app.getRoutes()` 接到 `prom-client`，在 9090 端口暴露 `/metrics`。同时开了 `timeout` + `concurrency` 路由护栏，方便 `overload` / `timeout` 计数器有触发机会。

```bash
bun run --cwd examples/metrics-prometheus dev
```

- MQTT broker: `mqtt://localhost:1883`
- Prometheus 抓取地址: `http://localhost:9090/metrics`

## 暴露的指标

| 指标 | 类型 | 来源 |
|---|---|---|
| `mqtt_dispatch_seconds` | histogram | `onMetric`（dispatch 事件） |
| `mqtt_publish_seconds` | histogram | `onMetric`（publish 事件） |
| `mqtt_inflight` | gauge | `app.getRoutes()` 的 `inflight` |
| `mqtt_active_total` | gauge | `app.activeCount()` |
| `mqtt_overload_total` | counter | `onError({ phase: 'overload' })` |
| `mqtt_timeout_total` | counter | `onError({ phase: 'timeout' })` |

## 源码

<<< ../../../examples/metrics-prometheus/src/index.ts

[在 GitHub 查看](https://github.com/keyp-dev/mqttkit/tree/main/examples/metrics-prometheus) · [指标指南](../metrics) · [Handler 超时与并发指南](../handler-limits)
