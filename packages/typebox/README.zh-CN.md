# @mqttkit/typebox

[English](README.md)

[`@mqttkit/core`](../core) 的 TypeBox 适配器。注册一次后，直接把原始 `Type.X(...)` schema 传给 `topic({ schema })`。TypeBox schema 本身*就是* JSON Schema，所以 `@mqttkit/asyncapi` 会零配置生成完整 payload 文档。

完整文档：**<https://mqttkit.keyp.dev/zh/schema>**。

## 安装

```bash
bun add @mqttkit/core @mqttkit/typebox @sinclair/typebox
```

`@sinclair/typebox` 是 peer dependency（`>=0.34, <1`）。

## 使用

```ts
import { MqttApp, router } from '@mqttkit/core'
import { typeboxProvider } from '@mqttkit/typebox'
import { Type } from '@sinclair/typebox'

const app = new MqttApp()
  .addSchemaProvider(typeboxProvider) // 注册一次
  .use(
    router().topic('devices/:uid/readings', {
      schema: Type.Object({
        temperature: Type.Number({ description: 'Celsius' }),
        ts: Type.Optional(Type.Integer()),
      }),
      async onMessage(ctx) {
        // ctx.body 自动推断为 { temperature: number; ts?: number }
        console.log(ctx.params.uid, ctx.body.temperature)
      },
    }),
  )

await app.listen()
```

一份 TypeBox schema 同时驱动运行时校验（`Value.Check`）、`ctx.body` 类型推断（`Static<T>`）以及 AsyncAPI 文档。校验失败通过 `onError({ phase: 'validation' })` 暴露，并跳过 `onMessage`。可与 Standard-Schema 校验器（zod、valibot、arktype）在同一个 app 里自由混用。

## API

`typeboxProvider` —— 一个 `SchemaProvider`（`{ vendor, detect, validate }`）。通过 `Symbol(TypeBox.Kind)` 识别 schema，并用 `@sinclair/typebox/value` 完成校验。
