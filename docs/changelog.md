---
sidebar: false
aside: false
---

# Changelog

All notable changes to this monorepo are recorded here. Releases for each
package follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html); the
entries below are grouped by version-date so cross-package changes that ship
together stay readable.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/).

## 2026-07-27 — aedes 2.x / MQTT 5 rejections

`@mqttkit/aedes@0.3.0-beta.0` (prerelease, `next` dist-tag —
`npm i @mqttkit/aedes@next aedes@2`) and `@mqttkit/asyncapi@0.2.2`.

### Changed — `@mqttkit/aedes` 0.3.0-beta.0

- **Targets aedes 2.x** (`peerDependencies: aedes >=2.0.0-beta.1 <3`). Breaking:
  aedes 2.0 is ESM-only and needs Node >= 20. The adapter now imports the
  `Aedes` class (the `createBroker` named export was removed) and awaits the new
  async `broker.listen()` inside `start()` — aedes 2.x moved persistence setup
  and heartbeat there. Bring your own `aedes@2`.
- **Schema failures now reject with an MQTT 5 reason code instead of dropping
  the connection.** Inbound dispatch runs inside `authorizePublish` (before the
  broker acks/forwards), so a failed `validate: 'inbound'` route rejects the
  publish before any subscriber sees it. On aedes 2.x an MQTT 5 publisher gets a
  `0x87` (Not authorized) PUBACK/PUBREC and stays connected; v3/v4 clients have
  no reason-code channel and are still disconnected.
- **`@mqttkit/core` moved to `peerDependencies`** (was a regular dependency).
  The adapter plugs into the user's `MqttApp`, so core must be the single shared
  copy — otherwise a version split yields two `@mqttkit/core` instances and
  `app.use(aedes(...))` fails to type-check. Now consistent with `@mqttkit/zod`
  and `@mqttkit/typebox`. Install core yourself (the README already shows this).

### Changed — `@mqttkit/asyncapi` 0.2.2

- **`@mqttkit/core` moved to `peerDependencies`** (was a regular dependency),
  the same fix as `@mqttkit/aedes` above. As a plugin over the user's app it
  must share the single core copy. Now consistent with all other adapters.

### Added — examples

- `examples/aedes-schema-reject` — end-to-end demo: an MQTT 5 client publishes a
  valid then an invalid payload; the invalid one is rejected with a reason code
  while the connection stays up and the handler never runs.

### Tooling

- `scripts/publish.mjs` routes prerelease versions (any version containing a `-`)
  to the npm `next` dist-tag so betas never land on `latest`.

## 2026-06-23 — quality pass

`@mqttkit/core@0.2.2`, `@mqttkit/asyncapi@0.2.1`, `@mqttkit/zod@0.1.1`.
`@mqttkit/aedes` and `@mqttkit/typebox` have no shipped changes this round.

### Added — `@mqttkit/core` 0.2.2

- **Pluggable logger** (`app.logger(logger)`). Replaces internal `console.*`
  calls used for drain timeouts, validation failures with no `onError`
  handler, and exceptions thrown inside user metric/error chains. Default
  remains console-backed (`consoleLogger`); pass `noopLogger` for silence or
  your own implementation to forward into pino / OpenTelemetry / Sentry. App
  plugins can read the active logger via `app.getLogger()`.
- **`MqttPacket` type export**. Re-export of the broker-native packet alias
  with documentation explaining why it stays structurally opaque
  (`readPacketProperties` handles the safe read).
- **Stricter shared-subscription parsing** (`parseSharedSubscription`).
  Rejects malformed filters that previously slipped through: filter that
  collapses to only `/`, NUL bytes in the group name, and MQTT wildcards
  (`+`, `#`) in non-conforming positions inside the remainder.

### Changed — `@mqttkit/asyncapi` 0.2.1

- Built-in HTTP server now wraps `listen()` errors with the host/port we
  tried (so port conflicts produce an actionable message instead of a bare
  `EADDRINUSE`) and attaches a long-lived `error` listener for post-startup
  failures. Startup log line moved from `console.log` to `app.getLogger()`.
- New test suite covering builder schema resolution, YAML emission edge
  cases, handler cache invalidation, and end-to-end HTTP routing including
  port-conflict surfacing.

### Fixed — `@mqttkit/zod` 0.1.1

- `peerDependencies` now declares `@mqttkit/core`. Previously the constraint
  lived only on `typebox`, so a lone `zod` install could silently resolve a
  mismatched core version.

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
