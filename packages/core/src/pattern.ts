/**
 * Compile-time pattern → params type inference.
 *
 *   InferParams<'devices/:uid/files/*'>  → { uid: string; '*': string }
 *   InferParams<'server/:uid/events'>    → { uid: string }
 *   InferParams<'devices/online'>        → {}
 *
 * Mirrors the runtime matcher: `:name` becomes a named string param,
 * `*` (only allowed as the final segment) becomes the catch-all key.
 * Literal segments contribute nothing.
 */
export type InferParams<Pattern extends string> = Simplify<MergeSegments<Pattern>>

type MergeSegments<Pattern extends string> = Pattern extends `${infer Head}/${infer Tail}`
  ? InferSegment<Head> & MergeSegments<Tail>
  : InferSegment<Pattern>

type InferSegment<Segment extends string> = Segment extends `:${infer Name}`
  ? { [K in Name]: string }
  : Segment extends '*'
    ? { '*': string }
    : Record<never, never>

type Simplify<T> = T extends Record<never, never>
  ? { [K in keyof T]: T[K] } & {}
  : T
