/**
 * `@mqttkit/typebox` — TypeBox adapter for mqttkit.
 *
 * Register the exported `typeboxProvider` via `app.addSchemaProvider(...)`
 * to use raw typebox schemas directly:
 *
 * ```ts
 * import { typeboxProvider } from '@mqttkit/typebox'
 * import { Type } from '@sinclair/typebox'
 *
 * app
 *   .addSchemaProvider(typeboxProvider)
 *   .use(router().topic('devices/:uid/readings', {
 *     schema: Type.Object({ temperature: Type.Number() }),
 *     async onMessage(ctx) {
 *       // ctx.body inferred as { temperature: number }
 *     },
 *   }))
 * ```
 */
import type { SchemaProvider, StandardSchemaV1 } from '@mqttkit/core'
import { Kind, type Static, type TSchema } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'

export const typeboxProvider: SchemaProvider = {
  vendor: 'typebox',
  detect(schema: unknown): boolean {
    return (
      typeof schema === 'object'
      && schema !== null
      && Kind in (schema as Record<symbol, unknown>)
    )
  },
  validate(schema: unknown, value: unknown): StandardSchemaV1.Result<unknown> {
    const s = schema as TSchema
    if (Value.Check(s, value)) {
      return { value }
    }
    const issues = [...Value.Errors(s, value)].map((err) => ({
      message: err.message,
      path: err.path.split('/').filter(Boolean),
    }))
    return { issues }
  },
}

// Type-level extension: when a route's `schema` is a raw typebox TSchema,
// `ctx.body` infers as `Static<TSchema>`.
declare module '@mqttkit/core' {
  interface MqttkitInferExtensions<T> {
    typebox: T extends TSchema ? Static<T> : never
  }
}

// Re-export for users who want to keep imports minimal.
export type { Static, TSchema } from '@sinclair/typebox'
