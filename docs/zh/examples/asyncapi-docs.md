# AsyncAPI 独立服务

从注册的路由生成 AsyncAPI 3.0，独立 HTTP 服务上挂渲染好的浏览页面。一份 TypeBox schema 同时承担运行时校验、`ctx.body` 静态类型、AsyncAPI payload 文档三件事。

```bash
bun run --cwd examples/asyncapi-docs dev
```

- MQTT: `mqtt://localhost:1883`
- AsyncAPI JSON: `http://localhost:9000/asyncapi.json`
- AsyncAPI YAML: `http://localhost:9000/asyncapi.yaml`
- 渲染文档: `http://localhost:9000/docs`

## 源码

::: code-group
<<< ../../../examples/asyncapi-docs/src/index.ts [index.ts]
<<< ../../../examples/asyncapi-docs/src/zod.ts [zod.ts]
:::

[在 GitHub 查看](https://github.com/keyp-dev/mqttkit/tree/main/examples/asyncapi-docs)
