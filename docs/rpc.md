# RPC

::: tip Coming soon
This page is a placeholder while the full guide is written. See the [`@mqttkit/core` README — RPC](https://github.com/keyp-dev/mqttkit/blob/main/packages/core/README.md#rpc) for current reference material.
:::

mqttkit implements MQTT 5 request/response over `responseTopic` + `correlationData`. The service side calls `app.request(topic, payload, { timeout })` and awaits a reply; the device side handles the message with a `topic({ onMessage })` handler that calls `ctx.reply(payload)`.

`@mqttkit/aedes` forwards the MQTT 5 publish properties (`responseTopic`, `correlationData`, `contentType`, `messageExpiryInterval`, `userProperties`, `payloadFormatIndicator`) required to make round-trips work.

## Round-trip

```mermaid
sequenceDiagram
  participant S as Service (app.request)
  participant B as Broker
  participant D as Device handler

  S->>S: generate correlationData
  S->>B: SUBSCRIBE reply topic
  S->>B: PUBLISH cmd/restart<br/>responseTopic = $rpc/reply/abc<br/>correlationData = xyz
  B->>D: deliver cmd/restart
  D->>D: onMessage(ctx)<br/>ctx.reply(result)
  D->>B: PUBLISH $rpc/reply/abc<br/>correlationData = xyz
  B->>S: deliver reply
  S->>S: match correlationData<br/>resolve promise
```

The service-side `app.request()` resolves with the device's reply payload, or rejects with a timeout if no matching `correlationData` arrives in time.

## Example

See [`examples/rpc`](https://github.com/keyp-dev/mqttkit/tree/main/examples/rpc) for a runnable end-to-end demo.
