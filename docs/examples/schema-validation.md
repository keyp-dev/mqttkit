# Schema Validation

Shows TypeBox and zod payload validation side-by-side. Demonstrates inbound vs outbound validation modes and `onError` handling for `phase: 'validation'` failures.

```bash
bun run --cwd examples/schema-validation dev
```

## Source

::: code-group
<<< ../../examples/schema-validation/src/zod.ts [zod.ts]
<<< ../../examples/schema-validation/src/typebox.ts [typebox.ts]
<<< ../../examples/schema-validation/src/manual.ts [manual.ts]
<<< ../../examples/schema-validation/src/coexist.ts [coexist.ts]
:::

[View on GitHub](https://github.com/keyp-dev/mqttkit/tree/main/examples/schema-validation) · [Schema guide](../schema)
