import { createServer as createHttpServer } from 'node:http'
import type { Server as HttpServer } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import type { Server as NetServer } from 'node:net'
import { Aedes } from 'aedes'
import type { Client, PublishPacket, Subscription } from 'aedes'
import type {
  BrokerStartOptions,
  MqttBrokerAdapter,
  MqttPayload,
  MqttPublishProperties,
  PublishOptions,
  PublishResult,
} from '@mqttkit/core'
import { toPayloadBuffer } from '@mqttkit/core'
import type { AedesAdapterOptions, AedesAdapterTcpOptions, AedesAdapterWsOptions, AedesInstance } from './types.js'
import { attachWebSocketServer } from './ws.js'

const principalByClient = new WeakMap<Client, unknown>()

export class AedesBrokerAdapter<TPrincipal = unknown> implements MqttBrokerAdapter<TPrincipal> {
  readonly broker: AedesInstance
  private runtime?: BrokerStartOptions<TPrincipal>
  private tcpServer?: NetServer
  private wsHttpServer?: HttpServer
  private wsServer?: { close(callback?: (error?: Error) => void): void }
  private ownsBroker = false
  private ownsTcpServer = false
  private ownsWsHttpServer = false
  private started = false

  constructor(private readonly options: AedesAdapterOptions<TPrincipal> = {}) {
    this.broker = options.instance ?? new Aedes({
      ...options.aedes,
      persistence: options.persistence ?? options.aedes?.persistence,
    })
    this.ownsBroker = !options.instance
  }

  async start(runtime: BrokerStartOptions<TPrincipal>): Promise<void> {
    if (this.started) return
    this.runtime = runtime
    // aedes 2.x moved broker readiness (persistence.setup, heartbeat) into an
    // async listen(). `new Aedes()` alone leaves persistence undefined, so own
    // brokers must be listened before they accept connections. A caller-supplied
    // instance is assumed already listened (e.g. via `await Aedes.createBroker()`).
    if (this.ownsBroker) await this.broker.listen()
    this.installHooks()
    await this.startTcp(this.options.tcp)
    await this.startWebSocket(this.options.ws)
    this.started = true
  }

  async stop(): Promise<void> {
    await Promise.all([
      this.closeWebSocketServer(),
      this.closeServer(this.tcpServer),
      this.closeServer(this.wsHttpServer),
      this.ownsBroker ? this.closeBroker() : Promise.resolve(),
    ])
  }

  async publish(topic: string, payload: MqttPayload, options: PublishOptions = {}): Promise<PublishResult> {
    const packet: PublishPacket = {
      cmd: 'publish',
      topic,
      payload: toPayloadBuffer(payload),
      qos: options.qos ?? 0,
      retain: options.retain ?? false,
      dup: false,
    }

    const properties = toAedesProperties(options.properties)
    if (properties) {
      ;(packet as PublishPacket & { properties: typeof properties }).properties = properties
    }

    await new Promise<void>((resolve, reject) => {
      this.broker.publish(packet, (error) => {
        if (error) reject(error)
        else resolve()
      })
    })

    return { topic }
  }

  getTcpAddress(): { port: number; host?: string } | undefined {
    return addressOf(this.tcpServer)
  }

  getWebSocketAddress(): { port: number; host?: string } | undefined {
    return addressOf(this.wsHttpServer)
  }

  private installHooks(): void {
    this.broker.authenticate = (async (client, username, password, done) => {
      try {
        if (!this.options.authenticate) {
          done(null, true)
          return
        }

        const principal = await this.options.authenticate({
          clientId: client.id,
          username,
          password,
          client,
        })

        if (principal === false || principal == null) {
          done(null, false)
          return
        }

        principalByClient.set(client, principal)
        done(null, true)
      } catch (error) {
        done(error as Error & { returnCode: number }, false)
      }
    }) satisfies AedesInstance['authenticate']

    this.broker.authorizePublish = (async (client, packet, callback) => {
      if (!this.runtime || !client) {
        callback()
        return
      }

      try {
        const allowed = await this.runtime.dispatch({
          topic: packet.topic,
          payload: toPayloadBuffer(packet.payload),
          clientId: client.id,
          principal: principalByClient.get(client) as TPrincipal | undefined,
          packet,
        })
        callback(allowed ? undefined : new Error(`Publish is not allowed for topic: ${packet.topic}`))
      } catch (error) {
        callback(error as Error)
      }
    }) satisfies AedesInstance['authorizePublish']

    this.broker.authorizeSubscribe = (async (client, subscription, callback) => {
      if (!this.runtime) {
        callback(null, subscription)
        return
      }

      try {
        const result = await this.runtime.canSubscribe({
          topic: subscription.topic,
          clientId: client.id,
          principal: principalByClient.get(client) as TPrincipal | undefined,
          packet: subscription,
        })

        callback(null, result.allowed ? subscription : null)
      } catch (error) {
        callback(error as Error)
      }
    }) satisfies AedesInstance['authorizeSubscribe']

    this.forwardEvents()
  }

  private forwardEvents(): void {
    const emit = async (type: string, event: Record<string, unknown>) => {
      await this.runtime?.emit(type, { type, ...event })
    }

    this.broker.on('client', (client) => {
      void emit('client', clientEvent(client))
    })
    this.broker.on('clientReady', (client) => {
      void emit('clientReady', clientEvent(client))
    })
    this.broker.on('clientDisconnect', (client) => {
      void emit('clientDisconnect', clientEvent(client))
    })
    this.broker.on('keepaliveTimeout', (client) => {
      void emit('keepaliveTimeout', clientEvent(client))
    })
    this.broker.on('clientError', (client, error) => {
      void emit('clientError', { ...clientEvent(client), error })
    })
    this.broker.on('connectionError', (client, error) => {
      void emit('connectionError', { ...clientEvent(client), error })
    })
    this.broker.on('connackSent', (packet, client) => {
      void emit('connackSent', { ...clientEvent(client), packet })
    })
    this.broker.on('ping', (packet, client) => {
      void emit('ping', { ...clientEvent(client), packet })
    })
    this.broker.on('publish', (packet, client) => {
      void emit('publish', {
        ...(client ? clientEvent(client) : {}),
        topic: packet.topic,
        packet,
      })
    })
    this.broker.on('ack', (packet, client) => {
      void emit('ack', {
        ...clientEvent(client),
        topic: packet && typeof packet === 'object' && 'topic' in packet ? packet.topic : undefined,
        packet,
      })
    })
    this.broker.on('subscribe', (subscriptions, client) => {
      void emit('subscribe', {
        ...clientEvent(client),
        topic: subscriptions.map((subscription: Subscription) => subscription.topic).join(','),
        packet: subscriptions,
      })
    })
    this.broker.on('unsubscribe', (unsubscriptions, client) => {
      void emit('unsubscribe', {
        ...clientEvent(client),
        topic: unsubscriptions.join(','),
        packet: unsubscriptions,
      })
    })
  }

  private async startTcp(tcp: false | AedesAdapterTcpOptions | undefined): Promise<void> {
    if (tcp === false) return

    const server = tcp?.server ?? createNetServer(this.broker.handle)
    this.tcpServer = server
    this.ownsTcpServer = !tcp?.server

    if (!tcp?.server && tcp) {
      await listen(server, tcp.port ?? 1883, tcp.host)
    }
  }

  private async startWebSocket(ws: false | AedesAdapterWsOptions | undefined): Promise<void> {
    if (ws === false || !ws) return

    const server = ws.server ?? createHttpServer()
    this.wsHttpServer = server
    this.ownsWsHttpServer = !ws.server
    this.wsServer = attachWebSocketServer(this.broker, server, ws.path ?? '/')

    if (!ws.server) {
      await listen(server, ws.port ?? 8888, ws.host)
    }
  }

  private async closeServer(server: NetServer | HttpServer | undefined): Promise<void> {
    if (!server) return
    if (server === this.tcpServer && !this.ownsTcpServer) return
    if (server === this.wsHttpServer && !this.ownsWsHttpServer) return

    await new Promise<void>((resolve, reject) => {
      server.close((error?: Error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  }

  private async closeWebSocketServer(): Promise<void> {
    if (!this.wsServer) return

    await new Promise<void>((resolve, reject) => {
      this.wsServer?.close((error?: Error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  }

  private async closeBroker(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.broker.close(resolve)
    })
  }
}

type AedesPublishProperties = {
  payloadFormatIndicator?: boolean
  messageExpiryInterval?: number
  responseTopic?: string
  correlationData?: Buffer
  userProperties?: Record<string, string | string[]>
  contentType?: string
}

function toAedesProperties(properties: MqttPublishProperties | undefined): AedesPublishProperties | undefined {
  if (!properties) return undefined
  const out: AedesPublishProperties = {}
  if (properties.responseTopic !== undefined) out.responseTopic = properties.responseTopic
  if (properties.contentType !== undefined) out.contentType = properties.contentType
  if (properties.messageExpiryInterval !== undefined) out.messageExpiryInterval = properties.messageExpiryInterval
  if (properties.userProperties !== undefined) out.userProperties = properties.userProperties
  if (properties.payloadFormatIndicator !== undefined) {
    out.payloadFormatIndicator = properties.payloadFormatIndicator === 1
  }
  if (properties.correlationData !== undefined) {
    out.correlationData = toBuffer(properties.correlationData)
  }
  return Object.keys(out).length === 0 ? undefined : out
}

function toBuffer(value: Buffer | Uint8Array | string): Buffer {
  if (Buffer.isBuffer(value)) return value
  if (typeof value === 'string') return Buffer.from(value, 'utf8')
  return Buffer.from(value)
}

function clientEvent<TPrincipal>(client: Client): { clientId: string; principal?: TPrincipal } {
  return {
    clientId: client.id,
    principal: principalByClient.get(client) as TPrincipal | undefined,
  }
}

function listen(server: NetServer | HttpServer, port: number, host?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      resolve()
    })
  })
}

function addressOf(server: NetServer | HttpServer | undefined): { port: number; host?: string } | undefined {
  const address = server?.address()
  if (!address || typeof address === 'string') return undefined

  return {
    port: address.port,
    host: address.address,
  }
}
