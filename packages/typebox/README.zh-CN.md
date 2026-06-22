# @mqttkit/typebox

为 [`@mqttkit/core`](../core) 提供的 TypeBox 适配器。注册一次后即可把原始的 `Type.X(...)` schema 直接传给 `topic({ schema })`，并且自动获得完整的 AsyncAPI 文档输出——因为 TypeBox 的 schema 本身就是合法的 JSON Schema。

## 背景

[TypeBox](https://github.com/sinclairzx81/typebox) **没有**实现 [Standard Schema](https://standardschema.dev/) 接口。mqttkit 的核心只认 Standard Schema，所以默认情况下需要手写一层 wrapper。本包通过注册一个 `SchemaProvider`，让 core 在遇到非 Standard Schema 时把它交给 TypeBox 校验。

一份 TypeBox schema 同时驱动三件事：

1. **运行时校验**：`Value.Check` / `Value.Errors`
2. **`ctx.body` 类型推断**：TypeBox 的 `Static<T>`
3. **AsyncAPI 文档 payload**：TypeBox schema 即 JSON Schema，`@mqttkit/asyncapi` 直接拿来用

## 安装

```bash
bun add @mqttkit/core @mqttkit/typebox @sinclair/typebox
```

`@sinclair/typebox` 是 `peerDependency`（>=0.34, <1）。

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

payload 到达时 mqttkit 用 `Value.Check` 跑校验。失败时通过 `onError({ phase: 'validation' })` 上抛，并跳过 `onMessage`。

## 与 AsyncAPI 协作

```ts
import { asyncapi } from '@mqttkit/asyncapi'

app.use(
  asyncapi({
    info: { title: 'mqttkit demo', version: '0.1.0' },
    servers: { tcp: { host: 'localhost:1883', protocol: 'mqtt' } },
  }),
)
```

生成的 AsyncAPI 文档完整保留 TypeBox JSON Schema：`type` / `properties` / `required` / `description` / `enum` 等，**无需任何额外配置**。

## 与 zod / valibot / arktype 混用

实现 Standard Schema 的库（zod / valibot / arktype 等）会被 core 直接识别，可以和 TypeBox 在同一个 app 里自由混用：

```ts
import { typeboxProvider } from '@mqttkit/typebox'
import { jsonify } from '@mqttkit/zod'
import { Type } from '@sinclair/typebox'
import { z } from 'zod'

app
  .addSchemaProvider(typeboxProvider)
  .use(
    router()
      .topic('devices/:uid/readings', { schema: Type.Object({ /* … */ }) })
      .topic('users/:id', { schema: jsonify(z.object({ /* … */ })) }),
  )
```

## API

### `typeboxProvider`

一个现成的 `SchemaProvider`（`{ vendor, detect, validate }`），传给 `app.addSchemaProvider(...)` 即可。它通过 `Symbol(TypeBox.Kind)` 识别 schema，并用 `@sinclair/typebox/value` 完成校验。

## License

MIT
