# Testing

::: tip Coming soon
This page is a placeholder while the full guide is written. See the [`@mqttkit/core` README — Testing](https://github.com/keyp/mqttkit/blob/main/packages/core/README.md#testing) for current reference material.
:::

`@mqttkit/core/testing` ships an in-memory `TestBroker` and `createTestApp()` helper so applications can be unit-tested without spawning an actual MQTT broker. The test broker exposes `dispatch()` to inject messages and `onPublish` to assert server-side publishes — no network, no aedes process.

```ts
import { createTestApp } from '@mqttkit/core/testing'

const { app, broker } = createTestApp(/* setup */)
await broker.dispatch('devices/abc/events', { temperature: 22 })
```

Use it for fast, deterministic route + middleware tests in your suite.
