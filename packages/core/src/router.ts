import type {
  MqttAppState,
  MqttErrorHandler,
  MqttHandler,
  MqttMiddleware,
  MqttTopicPolicy,
} from './context.js'
import { compileTopicPattern, joinTopic } from './matcher.js'
import type { InferParams } from './pattern.js'
import type { MqttPlugin } from './plugin.js'
import type { StandardSchemaV1 } from './standard-schema.js'

/**
 * Type-only extension registry. Third-party schema adapter packages augment
 * this interface so that raw schemas of their kind (e.g. raw typebox `TSchema`
 * objects) get correct `ctx.body` inference without `@mqttkit/core` having to
 * depend on those libraries.
 *
 * @example
 * ```ts
 * // @mqttkit/typebox
 * import type { TSchema, Static } from '@sinclair/typebox'
 * declare module '@mqttkit/core' {
 *   interface MqttkitInferExtensions<T> {
 *     typebox: T extends TSchema ? Static<T> : never
 *   }
 * }
 * ```
 */
// biome-ignore lint/correctness/noUnusedVariables: extension point — T is used by augmentations
export interface MqttkitInferExtensions<T> {}

type InferExtensionsLookup<T> = MqttkitInferExtensions<T>[keyof MqttkitInferExtensions<T>]

export type ValidateMode = 'inbound' | 'outbound' | 'both' | false

export type TopicConfig<
  TState extends MqttAppState = MqttAppState,
  TSchema = unknown,
  TParams extends Record<string, string> = Record<string, string>,
> = {
  publish?: MqttTopicPolicy<TState['principal'], TParams>
  subscribe?: MqttTopicPolicy<TState['principal'], TParams>
  onMessage?: MqttHandler<TState, TParams, InferBody<TSchema>>
  qos?: 0 | 1 | 2
  retain?: boolean
  /**
   * Topic message schema. Accepts any Standard Schema implementation
   * (zod / valibot / arktype / typebox-validator …) for runtime validation,
   * or a plain JSON Schema object for documentation-only use.
   */
  schema?: TSchema
  /**
   * When validation runs. Defaults to `'inbound'` whenever a Standard Schema
   * is provided. Set to `false` to disable; `'outbound'` to validate only on
   * server-side publish; `'both'` to validate both directions.
   */
  validate?: ValidateMode
  /**
   * Maximum time (ms) the handler pipeline (route middleware + onMessage) may
   * run. When exceeded, the handler is abandoned and the failure is routed
   * through `onError` with `phase: 'timeout'`. Default: unlimited.
   */
  timeout?: number
  /**
   * Maximum number of in-flight handler invocations for this route. When the
   * limit is reached, additional inbound messages are dropped and reported
   * through `onError` with `phase: 'overload'`. Default: unlimited.
   */
  concurrency?: number
  /** Route-scoped error handler. Runs before any app-level `onError`. */
  onError?: MqttErrorHandler<TState>
  meta?: unknown
}

export type InferBody<TSchema> = TSchema extends StandardSchemaV1
  ? StandardSchemaV1.InferOutput<TSchema>
  : [InferExtensionsLookup<TSchema>] extends [never]
    ? unknown
    : InferExtensionsLookup<TSchema>

export type TopicRoute<TState extends MqttAppState = MqttAppState> = {
  pattern: string
  compiled: ReturnType<typeof compileTopicPattern>
  publish: MqttTopicPolicy<TState['principal']>
  subscribe: MqttTopicPolicy<TState['principal']>
  onMessage?: MqttHandler<TState, Record<string, string>, unknown>
  middleware: MqttMiddleware<TState>[]
  config: TopicConfig<TState, unknown, Record<string, string>>
  /** Raw schema from config (may be a non-Standard-Schema such as raw typebox). */
  userSchema?: unknown
  /** Resolved Standard Schema — populated at app init via `~standard` detection or registered providers. */
  schema?: StandardSchemaV1
  /** Whether the user explicitly set `validate`; if not, the default is re-derived at app init. */
  explicitValidate?: ValidateMode
  validate: ValidateMode
  timeout?: number
  concurrency?: number
  /** Mutated by the dispatcher to track in-flight handler invocations. */
  inflight: number
  onError?: MqttErrorHandler<TState>
  meta?: unknown
}

export type RouterOptions = {
  prefix?: string
  meta?: unknown
}

export class MqttRouter<TState extends MqttAppState = MqttAppState> implements MqttPlugin<TState> {
  readonly name = 'router'
  readonly routes: TopicRoute<TState>[] = []
  private readonly middleware: MqttMiddleware<TState>[] = []

  constructor(private readonly options: RouterOptions = {}) {}

  use(router: MqttRouter<TState>): this
  use(middleware: MqttMiddleware<TState>): this
  use(routerOrMiddleware: MqttRouter<TState> | MqttMiddleware<TState>): this {
    if (typeof routerOrMiddleware === 'function') {
      this.middleware.push(routerOrMiddleware)
      return this
    }

    for (const route of routerOrMiddleware.routes) {
      this.addRoute(route.pattern, route.config, route.middleware)
    }

    return this
  }

  topic<Pattern extends string, TSchema = unknown>(
    pattern: Pattern,
    config: TopicConfig<TState, TSchema, InferParams<Pattern>> = {},
  ): this {
    this.addRoute(pattern, config as unknown as TopicConfig<TState, unknown, Record<string, string>>)
    return this
  }

  setup(app: { addRoute(route: TopicRoute<TState>): void }): void {
    for (const route of this.routes) {
      app.addRoute(route)
    }
  }

  private addRoute(
    pattern: string,
    config: TopicConfig<TState, unknown, Record<string, string>>,
    inheritedMiddleware: MqttMiddleware<TState>[] = [],
  ): void {
    const fullPattern = joinTopic(this.options.prefix, pattern)
    const publish = config.publish ?? Boolean(config.onMessage)
    const subscribe = config.subscribe ?? !config.onMessage
    const userSchema = config.schema
    const standardSchema = isStandardSchemaLike(userSchema) ? (userSchema as StandardSchemaV1) : undefined
    // Initial defaults; MqttApp.initialize re-derives them after providers run.
    const validate = config.validate ?? (standardSchema ? 'inbound' : false)

    this.routes.push({
      pattern: fullPattern,
      compiled: compileTopicPattern(fullPattern),
      publish,
      subscribe,
      onMessage: config.onMessage as MqttHandler<TState, Record<string, string>, unknown> | undefined,
      middleware: [...this.middleware, ...inheritedMiddleware],
      config,
      userSchema,
      schema: standardSchema,
      explicitValidate: config.validate,
      validate,
      timeout: config.timeout,
      concurrency: config.concurrency,
      inflight: 0,
      onError: config.onError,
      meta: config.meta ?? this.options.meta,
    })
  }
}

export function router<TState extends MqttAppState = MqttAppState>(
  options?: RouterOptions,
): MqttRouter<TState> {
  return new MqttRouter<TState>(options)
}

function isStandardSchemaLike(value: unknown): value is StandardSchemaV1 {
  return (
    typeof value === 'object'
    && value !== null
    && '~standard' in value
    && typeof (value as { '~standard'?: unknown })['~standard'] === 'object'
  )
}
