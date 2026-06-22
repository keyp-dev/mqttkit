# @mqttkit/zod

为 [`@mqttkit/core`](../core) 提供的 [zod](https://zod.dev) 辅助工具。给 zod schema 挂上 JSON Schema 表达，让 `@mqttkit/asyncapi` 能把完整 payload schema 输出到生成的 AsyncAPI 文档里。

## 背景

zod 3.24+ 已经原生实现 [Standard Schema](https://standardschema.dev/)，**运行时校验开箱即用**：

```ts
router().topic('users/:id', {
  schema: z.object({ name: z.string() }), // 直接传，无需辅助函数
})
```

唯一的缺口是 zod 默认不导出 JSON Schema，所以 `@mqttkit/asyncapi` 在 doc 里只能写 `{ description: 'Validated by zod' }`。

`jsonify()` 补上这一段：用 `zod-to-json-schema` 跑一次转换，结果挂到 schema 的 `~jsonSchema` 字段上（`@mqttkit/asyncapi` 已经认这个字段）。一份 zod schema 现在同时驱动三件事：

1. **运行时校验**：zod 原生 Standard Schema
2. **`ctx.body` 类型推断**：zod 的静态类型
3. **AsyncAPI 文档 payload**：挂上去的 JSON Schema

## 安装

```bash
bun add @mqttkit/core @mqttkit/zod zod zod-to-json-schema
```

`zod`（`^3.24 || ^4`）和 `zod-to-json-schema`（`^3.23`）是 `peerDependencies`。

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

`jsonify` 是原地修改：返回的是同一个 zod schema 实例，可以和后续 zod 链式调用自由组合。

## 与 AsyncAPI 协作

```ts
import { asyncapi } from '@mqttkit/asyncapi'

app.use(asyncapi({ info: { title: 'demo', version: '0.1.0' } }))
```

生成的 AsyncAPI 文档里 payload 现在是完整的 JSON Schema（`type` / `properties` / `required` / `description` …），不再是 `Validated by zod` 占位。

## API

### `jsonify(schema, options?)`

把 JSON Schema 表达挂到 `~jsonSchema`，并返回同一个 zod schema 实例。

```ts
jsonify(z.object({ /* … */ }), {
  // 透传给 zod-to-json-schema；默认值：target jsonSchema7, $refStrategy 'none'
  target: 'jsonSchema7',
  $refStrategy: 'none',
})
```

## 什么时候不需要这个包

如果你不生成 AsyncAPI 文档，**不需要** `jsonify`。直接 `z.object({...})` 就能跑运行时校验。

## License

MIT
