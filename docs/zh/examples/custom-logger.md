# 自定义 Logger

把结构化 logger（这里用 JSON 行；pino / OpenTelemetry / Sentry 同理）接到 `app.logger(...)`，就能接住框架内部产生的所有 warn/error：schema 校验失败、`onMetric` handler 抛错、以及主动调用 `app.getLogger().info` 的入口。

```bash
bun run --cwd examples/custom-logger dev
```

## 源码

<<< ../../../examples/custom-logger/src/index.ts

[在 GitHub 查看](https://github.com/keyp-dev/mqttkit/tree/main/examples/custom-logger) · [Logger 指南](../logger)
