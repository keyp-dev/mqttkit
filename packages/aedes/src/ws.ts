import type { Server as HttpServer, IncomingMessage } from 'node:http'
import { createRequire } from 'node:module'
import type { Duplex } from 'node:stream'
import type { AedesInstance } from './types.js'

const require = createRequire(import.meta.url)

type WebSocketServer = {
  close(callback?: (error?: Error) => void): void
}

type WebsocketStreamModule = {
  createServer(
    options: { server: HttpServer; path?: string },
    handler: (stream: Duplex, request?: IncomingMessage) => void,
  ): WebSocketServer
}

export function attachWebSocketServer(aedes: AedesInstance, server: HttpServer, path = '/'): WebSocketServer {
  const websocketStream = requireWebsocketStream()

  return websocketStream.createServer({ server, path }, (stream, request) => {
    aedes.handle(stream, request)
  })
}

function requireWebsocketStream(): WebsocketStreamModule {
  return require('websocket-stream') as WebsocketStreamModule
}
