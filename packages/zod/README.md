# @mqttkit/zod

[Zod](https://zod.dev) helpers for [`@mqttkit/core`](../core). Attaches a JSON Schema representation to a zod schema so `@mqttkit/asyncapi` can publish the full payload schema in the generated AsyncAPI document.

## Why

zod 3.24+ already implements [Standard Schema](https://standardschema.dev/), so **runtime validation works out-of-the-box**:

```ts
router().topic('users/:id', {
  schema: z.object({ name: z.string() }), // works as-is, no helper needed
})
```

The remaining gap is that zod does not expose its schema as JSON Schema by default, so `@mqttkit/asyncapi` falls back to `{ description: 'Validated by zod' }` in the doc.

`jsonify()` closes that gap. It runs `zod-to-json-schema` once and attaches the result as `~jsonSchema` (a field `@mqttkit/asyncapi` already recognizes). A single zod schema declaration now drives:

1. **Runtime validation** — zod's native Standard Schema
2. **`ctx.body` type inference** — zod's static type
3. **AsyncAPI doc payload** — the attached JSON Schema

## Install

```bash
bun add @mqttkit/core @mqttkit/zod zod zod-to-json-schema
```

`zod` (`^3.24 || ^4`) and `zod-to-json-schema` (`^3.23`) are `peerDependencies`.

## Usage

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
        // ctx.body inferred as { name: string; age: number }
        console.log(ctx.params.id, ctx.body.name)
      },
    }),
  )
```

`jsonify` mutates the schema in place and returns the same instance, so it composes cleanly with chained zod calls.

## With AsyncAPI

```ts
import { asyncapi } from '@mqttkit/asyncapi'

app.use(asyncapi({ info: { title: 'demo', version: '0.1.0' } }))
```

The AsyncAPI document now contains the full JSON Schema (`type`, `properties`, `required`, descriptions, …) instead of a `Validated by zod` placeholder.

## API

### `jsonify(schema, options?)`

Attaches a JSON Schema representation under `~jsonSchema` and returns the same zod schema instance.

```ts
jsonify(z.object({ /* … */ }), {
  // forwarded to zod-to-json-schema; defaults: target jsonSchema7, $refStrategy 'none'
  target: 'jsonSchema7',
  $refStrategy: 'none',
})
```

## When not to use this

You don't need `jsonify` if you are not generating an AsyncAPI document. Runtime validation works on a bare `z.object({...})`.

## License

MIT
