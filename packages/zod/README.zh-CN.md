# @mqttkit/zod

[English](README.md)

[`@mqttkit/core`](../core) 的 [Zod](https://zod.dev) 辅助工具。给 zod schema 挂上 JSON Schema 表达，让 `@mqttkit/asyncapi` 在生成的 AsyncAPI 文档里输出完整 payload。

完整文档：**<https://mqttkit.keyp.dev/zh/schema>**。

## 安装

```bash
bun add @mqttkit/core @mqttkit/zod zod zod-to-json-schema
```

`zod`（`^3.24 || ^4`）和 `zod-to-json-schema`（`^3.23`）是 peer dependencies。

## 使用

```ts
import { MqttApp, router } from '@mqttkit/core'
import { jsonify } from '@mqttkit/zod'
import { z } from 'zod'

const userSchema = jsonify(
  z.object({
    name: z.string(),
    age: z.number().int().positive(),
  }),
)

const app = new MqttApp()
  .use(
    router().topic('users/:id', {
      schema: userSchema,
      async onMessage(ctx) {
        // ctx.body 自动推断为 { name: string; age: number }
        console.log(ctx.params.id, ctx.body.name)
      },
    }),
  )
```

zod 3.24+ 已经原生实现 Standard Schema，**运行时校验直接传裸 `z.object({...})` 即可** —— `jsonify` 只在你同时要生成 AsyncAPI 文档时才需要。它用 `zod-to-json-schema` 跑一次转换，结果挂到 `~jsonSchema`（`@mqttkit/asyncapi` 已经识别这个字段），并原地修改返回同一个 zod 实例，可以继续链式组合。

## API

`jsonify(schema, options?)` —— 把 JSON Schema 挂到 `~jsonSchema` 并返回同一个 zod schema。`options` 透传给 `zod-to-json-schema`（默认 `target: 'jsonSchema7'`、`$refStrategy: 'none'`）。
