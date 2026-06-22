import type { MqttPayload, PublishOptions } from './broker.js'

/**
 * Mutable view passed to every `app.onBeforePublish()` hook.
 *
 * Hooks may mutate `options` directly — typical uses include adding MQTT 5
 * user properties (trace headers, correlation IDs) or rewriting QoS / retain
 * per environment.
 *
 * `options` is always a fresh shallow copy so caller-supplied options aren't
 * mutated by accident; `options.properties` and `options.properties.userProperties`
 * are NOT deep-cloned, so a hook that wants to merge userProperties should do
 * so itself with object spread.
 */
export type MqttBeforePublishContext = {
  topic: string
  payload: MqttPayload
  options: PublishOptions
}

export type MqttBeforePublishHook = (
  ctx: MqttBeforePublishContext,
) => void | Promise<void>
