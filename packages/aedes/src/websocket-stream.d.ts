declare module 'websocket-stream' {
  import type { Server as HttpServer, IncomingMessage } from 'node:http'
  import type { Duplex } from 'node:stream'

  type WebSocketStreamOptions = {
    server?: HttpServer
    path?: string
    protocol?: string | string[]
    binary?: boolean
    objectMode?: boolean
  }

  type WebSocketStreamServer = {
    close(callback?: (error?: Error) => void): void
  }

  type WebSocketStream = ((target: string | object, protocols?: string[] | WebSocketStreamOptions, options?: WebSocketStreamOptions) => Duplex) & {
    createServer(
      options: { server: HttpServer; path?: string },
      handler: (stream: Duplex, request?: IncomingMessage) => void,
    ): WebSocketStreamServer
  }

  const websocketStream: WebSocketStream
  export = websocketStream
}
