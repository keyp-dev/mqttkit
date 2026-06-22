# Schema Validation

::: tip Coming soon
This page is a placeholder while the full guide is written. See the [`@mqttkit/core` README — Schema Validation](https://github.com/keyp-dev/mqttkit/blob/main/packages/core/README.md#schema-validation) for current reference material.
:::

`topic({ schema })` accepts any [Standard Schema v1](https://standardschema.dev/) validator: zod ≥3.24, valibot ≥1, arktype, and others. The validated payload is exposed on `ctx.body` with full type inference. The `validate` option controls direction (`'inbound' | 'outbound' | 'both' | false`).

## Related packages

- **[`@mqttkit/typebox`](https://github.com/keyp-dev/mqttkit/tree/main/packages/typebox)** — register once with `app.addSchemaProvider(typeboxProvider)` and pass raw `Type.X(...)` schemas directly. TypeBox schemas are JSON Schema natively, so `@mqttkit/asyncapi` emits the full payload automatically.
- **[`@mqttkit/zod`](https://github.com/keyp-dev/mqttkit/tree/main/packages/zod)** — `jsonify(schema)` attaches a JSON Schema representation to a zod schema so `@mqttkit/asyncapi` can emit the full payload (zod 3.x already speaks Standard Schema for runtime validation).

## Examples

See [`examples/schema-validation`](https://github.com/keyp-dev/mqttkit/tree/main/examples/schema-validation) for `zod`, `typebox`, `coexist`, and `manual` variants.
