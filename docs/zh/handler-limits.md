# Handler 超时与并发

两个路由级护栏防止失控的 handler 和流量尖峰拖垮生产环境：

- `timeout`：handler 跑太久就放弃等待。
- `concurrency`：限制单个路由可同时执行的 handler 数。

两者都会走 `onError` 链，所以你可以自己决定怎么报警。

## Timeout

```ts
router().topic('devices/:uid/events', {
  timeout: 5000, // 毫秒
  async onMessage(ctx) {
    await persist(ctx.body)
    await kafka.produce('device.events', ctx.payload)
  },
})
```

handler 超过 `timeout` 时，mqttkit 会：

1. 用 `HandlerTimeoutError` 拒绝 handler promise。
2. 通过 `onError` 链上报，`phase: 'timeout'`。
3. `dispatch` 返回 `false`。

handler 协程**并不会被终止**——JavaScript 没有抢占机制。计时器触发、dispatch 返回，handler 仍在后台跑。把 timeout 当作**探测信号**，不是 kill switch。真正的取消要在 handler 内实现（例如把 `AbortController` 串到 HTTP / DB 客户端）。

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

mqttkit 维护每个路由的 `inflight` 计数。当 `inflight >= concurrency` 又有新消息到达时，**直接丢弃**这条消息，不进 handler，并通过 `phase: 'overload'` 报告。丢弃含义：不入队、不重试——MQTT 协议层的 QoS 行为不受影响（PUBACK 照常发），但应用层忽略这条消息。

```ts
app.onError(({ phase, error }) => {
  if (phase !== 'overload') return
  const { concurrency, inflight } = error as { concurrency: number; inflight: number }
  log.warn({ concurrency, inflight }, 'mqtt route overloaded')
  metrics.handlerOverload.inc()
})
```

## 用哪个？

| 症状 | 用 |
|---|---|
| handler 可能因为下游慢而卡住 | `timeout` |
| 流量尖峰超过 handler 消费速度 | `concurrency` |
| 想要双重保险 | 两个一起用——互不冲突 |

`timeout` 针对单条慢消息，`concurrency` 针对整体队列深度，组合使用最合理。

## 与指标联动

两个 phase 都会落进 [metrics](./metrics) 的 `result: 'error', errorPhase: 'timeout' | 'overload'`，可以直接画丢弃率图，无需自己埋点。
