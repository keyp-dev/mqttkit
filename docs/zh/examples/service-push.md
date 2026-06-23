# Service Push

业务服务（例如计费的"发票已支付"）触发 MQTT publish。演示 `app.publish()` 怎么接到正常请求/响应之外的服务事件流上。

```bash
bun run --cwd examples/service-push dev
```

## 源码

<<< ../../../examples/service-push/src/index.ts

[在 GitHub 查看](https://github.com/keyp-dev/mqttkit/tree/main/examples/service-push) · [Service Push 指南](../service-push)
