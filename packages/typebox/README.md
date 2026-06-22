# @mqttkit/typebox

TypeBox adapter for [`@mqttkit/core`](../core). Lets you pass raw `Type.X(...)` schemas to `topic({ schema })` without writing a Standard Schema wrapper, and gives you free AsyncAPI documentation as a bonus — because TypeBox schemas *are* JSON Schema.

## Why

[TypeBox](https://github.com/sinclairzx81/typebox) does **not** implement the [Standard Schema](https://standardschema.dev/) interface. mqttkit's core only knows about Standard Schema, so without this adapter you would need to wrap every TypeBox schema by hand. This package registers a `SchemaProvider` that the core consults whenever a route's schema is not Standard Schema.

The same TypeBox schema then drives three things:

1. **Runtime validation** via `Value.Check` / `Value.Errors`
2. **`ctx.body` type inference** via TypeBox's `Static<T>`
3. **AsyncAPI doc payload** — TypeBox schemas are valid JSON Schema, so `@mqttkit/asyncapi` embeds them directly

## Install

```bash
bun add @mqttkit/core @mqttkit/typebox @sinclair/typebox
```

`@sinclair/typebox` is a `peerDependency` (>=0.34, <1).

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

When a payload arrives, mqttkit calls `Value.Check` against the schema. On failure, the error is routed through `onError({ phase: 'validation' })` and the handler is skipped.

## With AsyncAPI

```ts
import { asyncapi } from '@mqttkit/asyncapi'

app.use(
  asyncapi({
    info: { title: 'mqttkit demo', version: '0.1.0' },
    servers: { tcp: { host: 'localhost:1883', protocol: 'mqtt' } },
  }),
)
```

The generated AsyncAPI document embeds the full TypeBox JSON Schema — `type`, `properties`, `required`, `description`, `enum`, etc. — with no extra configuration.

## Mixing with zod / valibot / arktype

Standard Schema implementations are recognized by core directly. You can freely mix them with TypeBox in the same app:

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

A `SchemaProvider` (`{ vendor, detect, validate }`) ready to be passed to `app.addSchemaProvider(...)`. Detects schemas by the `Symbol(TypeBox.Kind)` property and validates with `@sinclair/typebox/value`.

## License

MIT
