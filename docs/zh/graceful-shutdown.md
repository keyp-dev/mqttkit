# 优雅关停

线上部署要的就是干净收尾：Kubernetes 发 SIGTERM 时，进程必须先把在飞的 handler 跑完再关 broker socket，否则消息会处理到一半被丢。

`app.stop()` 默认就走 drain：拒绝新的入站 dispatch、等所有 route 的 `inflight` 归零（或超时），再依次跑 `onStop` hook、取消未完成的 RPC、关闭 broker adapter。

## API

```ts
await app.stop({
  drain: true,      // 默认；传 false 走老的立即关闭
  timeout: 30_000,  // 最多等多少毫秒
})
```

`app.activeCount()` 返回当前在飞总数，做健康检查或 drain 过程的日志很合适。

## SIGTERM 接线

```ts
const shutdown = async (signal: NodeJS.Signals) => {
  console.log(`[server] received ${signal}, draining…`)
  await app.stop({ drain: true, timeout: 30_000 })
  process.exit(0)
}
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
```

## 执行顺序

```mermaid
flowchart LR
  Stop([调用 app.stop]) --> Closing[dispatcher.closing = true<br/>拒绝新 dispatch]
  Closing --> Drain[等 activeCount = 0<br/>或超时]
  Drain --> Hooks[倒序跑 onStop hook]
  Hooks --> Rpc[取消在飞 RPC]
  Rpc --> Broker[broker.stop]
  Broker --> Done([进程可以退出])
```

## 不做的事

- **Broker 在 drain 期间仍接受新 TCP 连接。** mqttkit 只拒绝 dispatch，自带的 Aedes adapter 并不会暂停 listener。要做无感滚动发布，请先在负载均衡 / readiness probe 上把流量切走。
- **不会取消 handler。** JavaScript 没有抢占——handler 死循环就只会撞 drain 超时然后打 warning。配合 [route 级 `timeout`](./handler-limits) 防止个别 handler 阻塞整个 drain。
- **不会重发失败的 publish。** 需要在 `onStop` 里 flush 状态的，自行 `await publish`。

## 超时行为

drain 超时但仍有 handler 在跑：

- `app.stop()` 打印 `[mqttkit] stop() drain timed out after Xms; N handler(s) still in-flight`。
- 关停流程继续——`onStop` 跑、RPC 取消、broker 关闭。
- 残留的 handler 仍会一路跑到底，或者跟着进程退出一起死。

超时按 SLA 调：通常取「最长合理 handler 运行时间 + 少量 buffer」。
