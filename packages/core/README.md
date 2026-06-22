# @mqttkit/core

[简体中文](README.zh-CN.md)

Elysia-like MQTT application framework for TypeScript. Provides the runtime: ordered middleware, topic router, typed context, service injection, lifecycle events, RPC, schema validation, metrics, graceful shutdown, and the broker adapter interface.

Full documentation: **<https://mqttkit.keyp.dev>**.

## Install

```bash
bun add @mqttkit/core @mqttkit/aedes aedes
```

## Usage

```ts
import { aedes } from '@mqttkit/aedes'
import { MqttApp, router } from '@mqttkit/core'

const app = new MqttApp()
  .use(aedes({ tcp: { port: 1883 }, ws: { port: 8888, path: '/mqtt' } }))
  .use(
    router().topic('devices/:uid/events', {
      async onMessage(ctx) {
        await ctx.publish(`server/${ctx.params.uid}/echo`, ctx.payload)
      },
    }),
  )

await app.listen()
```

## What's Included

- **Routing & middleware** — `router().topic(pattern, config)` with Elysia-style `:param` / `*` syntax; ordered `app.use()` middleware; `app.decorate()` service injection.
- **Schema validation** — any [Standard Schema v1](https://standardschema.dev/) validator on `topic({ schema })`; raw TypeBox via `addSchemaProvider`.
- **MQTT 5 RPC** — `app.request(topic, payload)` / `ctx.reply(payload)` over `responseTopic` + `correlationData`.
- **MQTT 5 shared subscriptions** — `$share/<group>/<filter>` routed and surfaced to the subscribe policy as `shared.group`.
- **Per-route guards** — `topic({ timeout, concurrency })`; rejection surfaces as `onError` phase `'timeout'` / `'overload'`.
- **Metrics** — `app.onMetric(handler)` emits one structured event per dispatch / publish.
- **Graceful shutdown** — `app.stop({ drain: true, timeout })` drains in-flight handlers before closing the broker; `app.activeCount()` reports the in-flight total.
- **Tracing** — `ctx.userProperties` reads inbound MQTT 5 user properties; `app.onBeforePublish(hook)` injects them on outbound (W3C `traceparent`, correlation IDs).
- **Lifecycle** — `app.on(eventName, handler)` for broker events; `app.onStart` / `app.onStop` for app boundaries.
- **Testing** — `@mqttkit/core/testing` ships an in-memory `TestBroker` for unit tests without spawning aedes.

`onError` phases: `validation | policy | middleware | handler | timeout | overload | publish`. The error payload carries the raw `payload` so exporters can capture the offending message body.

## Docs

- [Getting Started](https://mqttkit.keyp.dev/getting-started)
- [Schema validation](https://mqttkit.keyp.dev/schema) · [RPC](https://mqttkit.keyp.dev/rpc) · [Events](https://mqttkit.keyp.dev/events)
- [Shared subscriptions](https://mqttkit.keyp.dev/shared-subscriptions) · [Timeout & concurrency](https://mqttkit.keyp.dev/handler-limits) · [Metrics](https://mqttkit.keyp.dev/metrics)
- [Graceful shutdown](https://mqttkit.keyp.dev/graceful-shutdown) · [Tracing & user properties](https://mqttkit.keyp.dev/tracing)
- [Testing](https://mqttkit.keyp.dev/testing)
