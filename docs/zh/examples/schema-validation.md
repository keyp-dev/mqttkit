# Schema 校验

TypeBox 与 zod payload 校验对照演示，覆盖入站/出站校验模式，以及 `phase: 'validation'` 失败的 `onError` 处理。

```bash
bun run --cwd examples/schema-validation dev
```

## 源码

::: code-group
<<< ../../../examples/schema-validation/src/zod.ts [zod.ts]
<<< ../../../examples/schema-validation/src/typebox.ts [typebox.ts]
<<< ../../../examples/schema-validation/src/manual.ts [manual.ts]
<<< ../../../examples/schema-validation/src/coexist.ts [coexist.ts]
:::

[在 GitHub 查看](https://github.com/keyp-dev/mqttkit/tree/main/examples/schema-validation) · [Schema 指南](../schema)
