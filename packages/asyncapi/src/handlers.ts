import type { MqttApp, MqttAppState } from '@mqttkit/core'
import { buildAsyncApi } from './builder.js'
import type { AsyncApiDocument, BuildOptions } from './types.js'
import { toYaml } from './yaml.js'

export type AsyncApiHandlersOptions = BuildOptions & {
  prefix?: string
}

export type AsyncApiPaths = {
  json: string
  yaml: string
  docs: string
}

export type AsyncApiHandlers = {
  paths: AsyncApiPaths
  document(): AsyncApiDocument
  json(): string
  yaml(): string
  html(): string
  invalidate(): void
}

export function createAsyncApiHandlers<TState extends MqttAppState = MqttAppState>(
  app: MqttApp<TState>,
  options: AsyncApiHandlersOptions,
): AsyncApiHandlers {
  const prefix = normalizePrefix(options.prefix ?? '')
  const paths: AsyncApiPaths = {
    json: `${prefix}/asyncapi.json`,
    yaml: `${prefix}/asyncapi.yaml`,
    docs: `${prefix}/docs`,
  }

  let cachedDoc: AsyncApiDocument | undefined
  let cachedJson: string | undefined
  let cachedYaml: string | undefined
  let cachedHtml: string | undefined

  const document = (): AsyncApiDocument => {
    cachedDoc ??= buildAsyncApi(app, { info: options.info, servers: options.servers })
    return cachedDoc
  }

  return {
    paths,
    document,
    json() {
      cachedJson ??= JSON.stringify(document(), null, 2)
      return cachedJson
    },
    yaml() {
      cachedYaml ??= toYaml(document())
      return cachedYaml
    },
    html() {
      cachedHtml ??= renderAsyncApiHtml(document(), paths.json)
      return cachedHtml
    },
    invalidate() {
      cachedDoc = undefined
      cachedJson = undefined
      cachedYaml = undefined
      cachedHtml = undefined
    },
  }
}

export function renderAsyncApiHtml(doc: AsyncApiDocument, jsonUrl: string): string {
  const title = (doc.info as { title?: string } | undefined)?.title ?? 'AsyncAPI'
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)} - AsyncAPI</title>
  <link rel="stylesheet" href="https://unpkg.com/@asyncapi/react-component@2.6.3/styles/default.min.css" />
  <style>html,body,#asyncapi{margin:0;padding:0;height:100%;}</style>
</head>
<body>
  <div id="asyncapi"></div>
  <script src="https://unpkg.com/@asyncapi/react-component@2.6.3/browser/standalone/index.js"></script>
  <script>
    fetch(${JSON.stringify(jsonUrl)})
      .then((r) => r.json())
      .then((schema) => {
        AsyncApiStandalone.render({
          schema,
          config: { show: { sidebar: true, info: true, servers: true, operations: true, messages: true, schemas: true } }
        }, document.getElementById('asyncapi'))
      })
  </script>
</body>
</html>`
}

export function normalizePrefix(prefix: string): string {
  if (!prefix) return ''
  const trimmed = prefix.startsWith('/') ? prefix : `/${prefix}`
  return trimmed.replace(/\/+$/, '')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
