import type { MqttApp, TopicRoute } from '@mqttkit/core'
import type { AsyncApiDocument, BuildOptions, RouteDocMeta } from './types.js'

export function buildAsyncApi(app: MqttApp<any>, options: BuildOptions): AsyncApiDocument {
  return buildFromRoutes(app.getRoutes() as readonly TopicRoute[], options)
}

export function buildFromRoutes(
  routes: readonly TopicRoute[],
  { info, servers }: BuildOptions,
): AsyncApiDocument {
  const channels: Record<string, unknown> = {}
  const operations: Record<string, unknown> = {}

  for (const route of routes) {
    const channelId = toChannelId(route.pattern)
    const address = toAsyncApiAddress(route.pattern)
    const params = extractParams(route.pattern)
    const hasCatchAll = /(^|\/)\*(?=\/|$)/.test(route.pattern)
    const meta = (route.meta ?? {}) as RouteDocMeta
    const schema = route.config.schema
    const messageId = meta.message?.name ?? 'payload'

    const message = pruneEmpty({
      name: messageId,
      contentType: meta.message?.contentType ?? 'application/json',
      payload: schema ?? { type: 'object' },
      examples: meta.examples?.map((payload) => ({ payload })),
    })

    const parameters: Record<string, { description: string }> = Object.fromEntries(
      params.map((name) => [name, { description: `Path parameter :${name}` }]),
    )
    if (hasCatchAll) parameters.rest = { description: 'Catch-all remaining path segments' }

    channels[channelId] = pruneEmpty({
      address,
      description: meta.description,
      parameters: Object.keys(parameters).length ? parameters : undefined,
      messages: { [messageId]: message },
      tags: meta.tags?.map((name) => ({ name })),
    })

    const bindings = route.config.qos !== undefined || route.config.retain !== undefined
      ? { mqtt: { qos: route.config.qos ?? 0, retain: route.config.retain ?? false } }
      : undefined

    const publishAllowed = route.publish !== false
    const subscribeAllowed = route.subscribe !== false

    if (publishAllowed) {
      operations[`${channelId}.send`] = pruneEmpty({
        action: 'send',
        channel: { $ref: `#/channels/${channelId}` },
        summary: meta.summary ?? `Client publishes to ${route.pattern}`,
        messages: [{ $ref: `#/channels/${channelId}/messages/${messageId}` }],
        bindings,
      })
    }

    if (subscribeAllowed) {
      operations[`${channelId}.receive`] = pruneEmpty({
        action: 'receive',
        channel: { $ref: `#/channels/${channelId}` },
        summary: meta.summary ?? `Client subscribes to ${route.pattern}`,
        messages: [{ $ref: `#/channels/${channelId}/messages/${messageId}` }],
        bindings,
      })
    }
  }

  return pruneEmpty({
    asyncapi: '3.0.0',
    info,
    servers,
    channels,
    operations,
  })
}

function toChannelId(pattern: string): string {
  return pattern
    .split('/')
    .filter(Boolean)
    .map((seg) => {
      if (seg.startsWith(':')) return `{${seg.slice(1)}}`
      if (seg === '*') return '{rest}'
      return seg
    })
    .join('.')
}

function toAsyncApiAddress(pattern: string): string {
  return pattern.replace(/:(\w+)/g, '{$1}').replace(/(^|\/)\*(?=\/|$)/g, '$1{rest}')
}

function extractParams(pattern: string): string[] {
  return [...pattern.matchAll(/:(\w+)/g)].map((m) => m[1])
}

function pruneEmpty<T extends Record<string, unknown>>(input: T): T {
  for (const key of Object.keys(input)) {
    const value = input[key]
    if (value === undefined) delete input[key]
    else if (Array.isArray(value) && value.length === 0) delete input[key]
    else if (typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length === 0) {
      delete input[key]
    }
  }
  return input
}
