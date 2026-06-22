/**
 * `@mqttkit/zod` — zod helpers for mqttkit.
 *
 * zod 3.24+ already implements Standard Schema, so runtime validation works
 * out-of-the-box (no provider registration needed). The remaining gap is that
 * zod does not expose its schema as JSON Schema by default, so `@mqttkit/asyncapi`
 * cannot embed the payload schema in the generated AsyncAPI document.
 *
 * `jsonify()` attaches a `~jsonSchema` field (the convention `@mqttkit/asyncapi`
 * already recognizes) so a single zod schema declaration drives:
 *   1) runtime validation (via zod's native Standard Schema)
 *   2) `ctx.body` type inference (via zod's static type)
 *   3) AsyncAPI doc payload (via the attached `~jsonSchema`)
 *
 * @example
 * ```ts
 * import { jsonify } from '@mqttkit/zod'
 * import { z } from 'zod'
 *
 * router().topic('users/:id', {
 *   schema: jsonify(z.object({ name: z.string(), age: z.number().int() })),
 *   onMessage(ctx) {
 *     // ctx.body: { name: string; age: number }
 *   },
 * })
 * ```
 */
import { zodToJsonSchema, type Options } from 'zod-to-json-schema'
import type { ZodSchema } from 'zod'

export type JsonifyOptions = Partial<Options>

/**
 * Attach a JSON Schema representation to a zod schema so that
 * `@mqttkit/asyncapi` can publish the full payload schema in the generated
 * doc. Runtime validation still goes through zod's native Standard Schema.
 *
 * The same schema instance is returned (mutated in-place) for ergonomic chaining.
 */
export function jsonify<T extends ZodSchema>(schema: T, options?: JsonifyOptions): T {
  const jsonSchema = zodToJsonSchema(schema, {
    target: 'jsonSchema7',
    $refStrategy: 'none',
    ...options,
  })
  Object.assign(schema, { '~jsonSchema': jsonSchema })
  return schema
}
