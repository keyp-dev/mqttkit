/**
 * Minimal Standard Schema v1 spec ({@link https://standardschema.dev/}).
 *
 * Declared inline so consumers can plug in any compatible validator
 * (zod ≥3.24, valibot ≥1, arktype, typebox-validator, etc.) without
 * mqttkit having to depend on the @standard-schema/spec package.
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': StandardSchemaV1.Props<Input, Output>
}

export namespace StandardSchemaV1 {
  export interface Props<Input = unknown, Output = Input> {
    readonly version: 1
    readonly vendor: string
    readonly validate: (
      value: unknown,
    ) => Result<Output> | Promise<Result<Output>>
    readonly types?: Types<Input, Output>
  }

  export type Result<Output> = SuccessResult<Output> | FailureResult

  export interface SuccessResult<Output> {
    readonly value: Output
    readonly issues?: undefined
  }

  export interface FailureResult {
    readonly issues: ReadonlyArray<Issue>
  }

  export interface Issue {
    readonly message: string
    readonly path?: ReadonlyArray<PropertyKey | PathSegment>
  }

  export interface PathSegment {
    readonly key: PropertyKey
  }

  export interface Types<Input = unknown, Output = Input> {
    readonly input: Input
    readonly output: Output
  }

  export type InferInput<S extends StandardSchemaV1> = NonNullable<
    S['~standard']['types']
  >['input']

  export type InferOutput<S extends StandardSchemaV1> = NonNullable<
    S['~standard']['types']
  >['output']
}

export function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  return (
    typeof value === 'object'
    && value !== null
    && '~standard' in value
    && typeof (value as { '~standard'?: unknown })['~standard'] === 'object'
    && (value as StandardSchemaV1)['~standard'].version === 1
  )
}

/**
 * Bridge between a non-Standard-Schema validator (e.g. raw typebox `TSchema`)
 * and mqttkit's Standard Schema pipeline.
 *
 * Third-party adapter packages (e.g. `@mqttkit/typebox`) export a value of
 * this shape; users register it via `app.addSchemaProvider(...)`. After
 * registration, any route whose `schema` matches `detect()` will be wrapped
 * into a Standard Schema at app init time.
 */
export interface SchemaProvider {
  readonly vendor: string
  detect(schema: unknown): boolean
  validate(
    schema: unknown,
    value: unknown,
  ):
    | StandardSchemaV1.Result<unknown>
    | Promise<StandardSchemaV1.Result<unknown>>
}

/** Wrap a SchemaProvider + raw schema into a Standard Schema facade. */
export function wrapSchemaProvider(
  provider: SchemaProvider,
  schema: unknown,
): StandardSchemaV1 {
  return {
    '~standard': {
      version: 1,
      vendor: provider.vendor,
      validate(value) {
        return provider.validate(schema, value)
      },
    },
  }
}

export class SchemaValidationError extends Error {
  readonly issues: ReadonlyArray<StandardSchemaV1.Issue>

  constructor(issues: ReadonlyArray<StandardSchemaV1.Issue>, topic: string) {
    const summary = issues
      .map((issue) => `${formatPath(issue.path)}: ${issue.message}`)
      .join('; ')
    super(`Schema validation failed for topic "${topic}": ${summary}`)
    this.name = 'SchemaValidationError'
    this.issues = issues
  }
}

function formatPath(path?: ReadonlyArray<PropertyKey | StandardSchemaV1.PathSegment>): string {
  if (!path || path.length === 0) return '(root)'
  return path
    .map((segment) => (typeof segment === 'object' ? String(segment.key) : String(segment)))
    .join('.')
}

/**
 * Decode an MQTT payload Buffer into a JS value for validation.
 * Defaults to UTF-8 JSON; falls back to the raw string if JSON.parse fails.
 */
export function decodePayloadForSchema(payload: Buffer): unknown {
  if (payload.length === 0) return undefined
  const text = payload.toString('utf8')
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export async function runSchema<S extends StandardSchemaV1>(
  schema: S,
  value: unknown,
): Promise<StandardSchemaV1.Result<StandardSchemaV1.InferOutput<S>>> {
  const result = schema['~standard'].validate(value)
  return (result instanceof Promise ? await result : result) as StandardSchemaV1.Result<
    StandardSchemaV1.InferOutput<S>
  >
}
