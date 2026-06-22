# Schema 校验

::: tip 完整指南正在编写中
本页为占位页。当前请参考 [`@mqttkit/core` README — Schema Validation](https://github.com/keyp/mqttkit/blob/main/packages/core/README.zh-CN.md#schema-validation) 获取详细信息。
:::

`topic({ schema })` 接受任意符合 [Standard Schema v1](https://standardschema.dev/) 的校验器：zod ≥3.24、valibot ≥1、arktype 等。通过校验的 payload 会出现在 `ctx.body` 上，并保留完整的类型推导。`validate` 选项用于控制校验方向（`'inbound' | 'outbound' | 'both' | false`）。

## 相关包

- **[`@mqttkit/typebox`](https://github.com/keyp/mqttkit/tree/main/packages/typebox)** —— 注册一次 `app.addSchemaProvider(typeboxProvider)` 之后，可以直接传 `Type.X(...)`。TypeBox 自身就是 JSON Schema，`@mqttkit/asyncapi` 能自动写出完整 payload。
- **[`@mqttkit/zod`](https://github.com/keyp/mqttkit/tree/main/packages/zod)** —— `jsonify(schema)` 为 zod schema 附加 JSON Schema 表达，让 `@mqttkit/asyncapi` 输出完整 payload（运行时校验在 zod 3.x 上已经通过 Standard Schema 自动可用）。

## 示例

参考 [`examples/schema-validation`](https://github.com/keyp/mqttkit/tree/main/examples/schema-validation) 中的 `zod`、`typebox`、`coexist`、`manual` 四个变体。
