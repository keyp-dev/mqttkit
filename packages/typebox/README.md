# @mqttkit/typebox

[简体中文](README.zh-CN.md)

TypeBox adapter for [`@mqttkit/core`](../core). Register once, then pass raw `Type.X(...)` schemas to `topic({ schema })`. Because TypeBox schemas *are* JSON Schema, `@mqttkit/asyncapi` documents the full payload with no extra work.

Full documentation: **<https://mqttkit.keyp.dev/schema>**.

## Install

```bash
bun add @mqttkit/core @mqttkit/typebox @sinclair/typebox
```

`@sinclair/typebox` is a peer dependency (`>=0.34, <1`).

## Usage

```ts
import { MqttApp, router } from '@mqttkit/core'
import { typeboxProvider } from '@mqttkit/typebox'
import { Type } from '@sinclair/typebox'

const app = new MqttApp()
  .addSchemaProvider(typeboxProvider) // register once
  .use(
    router().topic('devices/:uid/readings', {
      schema: Type.Object({
        temperature: Type.Number({ description: 'Celsius' }),
        ts: Type.Optional(Type.Integer()),
      }),
      async onMessage(ctx) {
        // ctx.body inferred as { temperature: number; ts?: number }
        console.log(ctx.params.uid, ctx.body.temperature)
      },
    }),
  )

await app.listen()
```

One TypeBox schema drives runtime validation (`Value.Check`), `ctx.body` type inference (`Static<T>`), and AsyncAPI documentation. Validation failures surface as `onError({ phase: 'validation' })` and skip `onMessage`. Mix freely with Standard-Schema validators (zod, valibot, arktype) in the same app.

## API

`typeboxProvider` — a `SchemaProvider` (`{ vendor, detect, validate }`). Detects schemas by `Symbol(TypeBox.Kind)` and validates with `@sinclair/typebox/value`.
