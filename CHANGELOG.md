# Changelog

All notable changes to this monorepo are recorded here. Releases for each
package follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html); the
entries below are grouped by version-date so cross-package changes that ship
together stay readable.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/).

## 2026-06-22 — 0.2.1

`@mqttkit/core@0.2.1`

### Added — `@mqttkit/core` 0.2.1

- **MQTT 5 shared subscriptions** (`$share/<group>/<filter>`).
  `parseSharedSubscription()` follows §4.8.2; `canSubscribe()` strips the
  prefix before route matching and exposes `shared.group` to the subscribe
  policy. Lets you deploy multiple consumer instances behind one broker
  without custom load-balancing.
- **Per-route `timeout` and `concurrency`**. `topic({ timeout, concurrency })`
  guards handler execution. Timeout surfaces as `phase: 'timeout'`; concurrency
  rejection surfaces as `phase: 'overload'`. Inflight count is tracked on the
  route for use by metrics and graceful shutdown.
- **`app.onMetric(handler)`**. Emits a structured `MqttMetricEvent` once per
  dispatch and once per publish — `{ type, topic, route?, durationMs, result,
  errorPhase? }`. Designed to feed Prometheus / OpenTelemetry / statsd without
  middleware around every route.
- **Graceful shutdown**. `app.stop({ drain: true, timeout: 30_000 })` is now
  the default behaviour: the dispatcher refuses new inbound dispatches, polls
  every route's `inflight` count to zero (or until the timeout), then runs
  `onStop` hooks, cancels in-flight RPC, and stops the broker adapter.
  `app.activeCount()` reports the current sum of in-flight handlers for health
  checks. Pass `{ drain: false }` for the legacy immediate shutdown.
- **MQTT 5 user properties on `ctx`**. `ctx.userProperties` exposes inbound
  `packet.properties.userProperties` as a flat read view, so middleware can
  extract `traceparent`, correlation IDs, or any side-band metadata without
  touching adapter-specific packet shape.
- **Outbound publish hooks**. `app.onBeforePublish(hook)` runs immediately
  before every outbound publish (both `app.publish()` and `ctx.publish()` /
  `ctx.reply()` / `app.request()`, which all funnel through the same path).
  Hooks receive a mutable `{ topic, payload, options }` view and can mutate
  `options` — typical use is merging `traceparent` into
  `options.properties.userProperties` so OTel context propagates across
  brokers. A throw aborts the publish and surfaces through `onError` with
  `phase: 'publish'`.
- **Raw payload on `onError`**. `MqttErrorPayload.payload` carries the raw
  buffer for inbound phases (`validation` / `policy` / `middleware` / `handler` /
  `timeout` / `overload`) and the original `MqttPayload` for `publish`. Lets
  exporters (Sentry, structured logs) capture the offending message body, not
  just the topic.
- **New docs pages** under the Production section: `Shared Subscriptions`,
  `Handler Timeout & Concurrency`, `Metrics`, `Graceful Shutdown`,
  `Tracing & User Properties` (with full OpenTelemetry wiring example).

## 2026-06-22 — 0.2.0

`@mqttkit/core@0.2.0`, `@mqttkit/aedes@0.2.0`, `@mqttkit/asyncapi@0.2.0`,
`@mqttkit/typebox@0.1.0` (initial), `@mqttkit/zod@0.1.0` (initial).

### Added — `@mqttkit/core` 0.2.0

- **Schema validation**. `topic({ schema })` accepts any [Standard
  Schema v1](https://standardschema.dev/) validator (zod ≥3.24, valibot ≥1,
  arktype, …). Validated output is exposed on `ctx.body` with full type
  inference. `validate` option controls direction (`'inbound' | 'outbound' |
  'both' | false`).
- **SchemaProvider extension point**. `app.addSchemaProvider(provider)` lets
  non-Standard-Schema libraries (e.g. raw TypeBox) plug in without core
  depending on them. `MqttkitInferExtensions<T>` provides type-only registration
  for `ctx.body` inference.
- **RPC**. `app.request(topic, payload, options?)` sends a request using
  MQTT 5 `responseTopic` + `correlationData` and resolves on reply.
  `ctx.reply(payload)` answers on the device side.
- **Error lifecycle**. `app.onError(handler)` and per-route `onError` receive
  a structured `{ error, topic, phase, route, ctx }` payload. `phase` is one of
  `middleware | handler | validation | policy | publish`. Validation failures
  emit a `SchemaValidationError` and skip `onMessage`.
- **Testing entry**. New `@mqttkit/core/testing` sub-export ships
  `createTestApp()` and an in-memory `TestBroker` with `dispatch()` / `onPublish`
  hooks. Lets apps be unit-tested without spawning aedes.
- **Pattern module**. Topic-pattern matching extracted into `pattern.ts` and
  exported from the package root.

### Added — `@mqttkit/aedes` 0.2.0

- Forwards MQTT 5 publish properties (`responseTopic`, `correlationData`,
  `contentType`, `messageExpiryInterval`, `userProperties`,
  `payloadFormatIndicator`) when calling `broker.publish`. Required for
  `app.request()` RPC round-trips.
- Bumps `@mqttkit/core` peer to `^0.2.0`.

### Added — `@mqttkit/asyncapi` 0.2.0

- `resolvePayloadSchema()`: route schemas that implement Standard Schema are
  now reduced to a JSON Schema for the generated document. Order:
  1. raw JSON Schema object — used as-is
  2. Standard Schema with `~jsonSchema` attached — uses the attached schema
  3. fallback: `{ description: 'Validated by <vendor>' }`
- Lets `@mqttkit/zod`'s `jsonify()` (and TypeBox's native JSON Schema layout)
  flow into the AsyncAPI document.
- Bumps `@mqttkit/core` peer to `^0.2.0`.

### Added — `@mqttkit/typebox` 0.1.0 (initial)

- `typeboxProvider`: register with `app.addSchemaProvider(typeboxProvider)` and
  pass raw `Type.X(...)` schemas directly to `topic({ schema })`. TypeBox
  schemas detected by the `Kind` symbol and validated via
  `@sinclair/typebox/value`.
- Type-only module augmentation so `ctx.body` is inferred via `Static<T>`.
- TypeBox schemas are JSON Schema natively, so `@mqttkit/asyncapi` outputs the
  full payload automatically.

### Added — `@mqttkit/zod` 0.1.0 (initial)

- `jsonify(schema, options?)`: attaches a JSON Schema representation under
  `~jsonSchema` and returns the same zod instance. Closes the gap where
  `@mqttkit/asyncapi` falls back to `Validated by zod` because zod 3.x doesn't
  expose JSON Schema by default.
- zod ≥3.24 already implements Standard Schema, so runtime validation works
  without `jsonify` — this helper is only needed when emitting AsyncAPI docs.

### Examples

- New `examples/schema-validation` with `zod`, `typebox`, `coexist`, and
  `manual` variants.
- New `examples/rpc` demonstrating `app.request()` / `ctx.reply()`.
- `examples/asyncapi-docs` now defaults to the TypeBox variant; added a `dev:zod`
  script that shows zod + `jsonify` flowing into the AsyncAPI document.

### Internal

- Root `tsconfig.json` excludes `**/dist/**` to avoid a parallel-build race
  where one package's tsup pass discovered another package's mid-clean dist.

## 2026-XX-XX — initial release

`@mqttkit/core@0.1.0`, `@mqttkit/aedes@0.1.0`, `@mqttkit/asyncapi@0.1.0`.

Initial publish of the framework: ordered middleware, topic router, typed
context with `decorate()` service injection, broker lifecycle events,
`app.publish()` for service-side push, Aedes TCP + MQTT-over-WebSocket
adapter, and the AsyncAPI 3.0 documentation plugin.
