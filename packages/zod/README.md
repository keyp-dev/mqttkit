# @mqttkit/zod

[简体中文](README.zh-CN.md)

[Zod](https://zod.dev) helpers for [`@mqttkit/core`](../core). Attaches a JSON Schema representation to a zod schema so `@mqttkit/asyncapi` can publish the full payload in the generated AsyncAPI document.

Full documentation: **<https://mqttkit.keyp.dev/schema>**.

## Install

```bash
bun add @mqttkit/core @mqttkit/zod zod zod-to-json-schema
```

`zod` (`^3.24 || ^4`) and `zod-to-json-schema` (`^3.23`) are peer dependencies.

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

zod 3.24+ implements Standard Schema, so **runtime validation works on a bare `z.object({...})`** — `jsonify` only matters when you also serve AsyncAPI docs. It runs `zod-to-json-schema` once and attaches the result as `~jsonSchema` (the field `@mqttkit/asyncapi` already recognizes), mutating and returning the same zod instance so chained calls still compose.

## API

`jsonify(schema, options?)` — attaches a JSON Schema under `~jsonSchema` and returns the same zod schema. `options` is forwarded to `zod-to-json-schema` (defaults: `target: 'jsonSchema7'`, `$refStrategy: 'none'`).
