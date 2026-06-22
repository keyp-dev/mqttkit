# Testing

::: tip 完整指南正在编写中
本页为占位页。当前请参考 [`@mqttkit/core` README — Testing](https://github.com/keyp-dev/mqttkit/blob/main/packages/core/README.zh-CN.md#testing) 获取详细信息。
:::

`@mqttkit/core/testing` 提供内存版 `TestBroker` 与 `createTestApp()` 工具，可以在不启动真实 MQTT broker 的情况下对应用做单测。`TestBroker` 提供 `dispatch()` 注入消息，`onPublish` 断言服务端 publish —— 无需网络、无需启动 aedes。

```ts
import { createTestApp } from '@mqttkit/core/testing'

const { app, broker } = createTestApp(/* setup */)
await broker.dispatch('devices/abc/events', { temperature: 22 })
```

适合做快速、可重复的 route 与 middleware 测试。
