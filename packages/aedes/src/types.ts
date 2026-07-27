import type { Server as HttpServer } from 'node:http'
import type { Server as NetServer } from 'node:net'
import type { Aedes, AedesOptions } from 'aedes'
import type { Client } from 'aedes'
import type { MqttApp, MqttAppState } from '@mqttkit/core'

export type AedesInstance = Aedes

export type AedesAuthenticateInput = {
  clientId: string
  username?: string
  password?: Buffer
  client: Client
}

export type AedesAdapterTcpOptions = {
  port?: number
  host?: string
  server?: NetServer
}

export type AedesAdapterWsOptions = {
  port?: number
  host?: string
  path?: string
  server?: HttpServer
}

export type AedesAdapterOptions<TPrincipal = unknown> = {
  instance?: AedesInstance
  aedes?: Omit<AedesOptions, 'authenticate' | 'authorizePublish' | 'authorizeSubscribe'>
  persistence?: unknown
  tcp?: false | AedesAdapterTcpOptions
  ws?: false | AedesAdapterWsOptions
  authenticate?(input: AedesAuthenticateInput): TPrincipal | null | false | Promise<TPrincipal | null | false>
}

export type AedesPluginSetup<TState extends MqttAppState> = {
  app: MqttApp<TState>
}

export type AedesAdapterRuntime<TPrincipal = unknown> = {
  app: MqttApp<{ principal?: TPrincipal }>
}
