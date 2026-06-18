export type AsyncApiInfo = {
  title: string
  version: string
  description?: string
  termsOfService?: string
  contact?: { name?: string; url?: string; email?: string }
  license?: { name: string; url?: string }
}

export type AsyncApiServer = {
  host: string
  protocol: 'mqtt' | 'mqtts' | 'ws' | 'wss'
  pathname?: string
  description?: string
}

export type RouteDocMeta = {
  summary?: string
  description?: string
  tags?: string[]
  examples?: unknown[]
  message?: {
    name?: string
    contentType?: string
  }
}

export type BuildOptions = {
  info: AsyncApiInfo
  servers?: Record<string, AsyncApiServer>
}

export type AsyncApiDocument = Record<string, unknown>
