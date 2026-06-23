import { createServer as createHttpServer } from 'node:http'
import type { IncomingMessage, Server as HttpServer, ServerResponse } from 'node:http'
import type { MqttAppState, MqttPlugin } from '@mqttkit/core'
import { createAsyncApiHandlers } from './handlers.js'
import type { AsyncApiHandlersOptions } from './handlers.js'

export type AsyncApiPluginOptions = AsyncApiHandlersOptions & {
  server?: HttpServer
  port?: number
  host?: string
}

const DEFAULT_PORT = 9000

export function asyncapi<TState extends MqttAppState = MqttAppState>(
  options: AsyncApiPluginOptions,
): MqttPlugin<TState> {
  return {
    name: '@mqttkit/asyncapi',
    setup(app) {
      let ownedServer: HttpServer | undefined
      let attachedServer: HttpServer | undefined
      let listener: AttachedListener | undefined

      app.onStart(async () => {
        const handlers = createAsyncApiHandlers(app, {
          info: options.info,
          servers: options.servers,
          prefix: options.prefix,
        })
        const { paths } = handlers

        listener = (req, res) => {
          if (!req.url || req.method !== 'GET') return false
          const url = req.url.split('?')[0]
          if (url === paths.json) return respond(res, 'application/json; charset=utf-8', handlers.json())
          if (url === paths.yaml) return respond(res, 'application/yaml; charset=utf-8', handlers.yaml())
          if (url === paths.docs) return respond(res, 'text/html; charset=utf-8', handlers.html())
          return false
        }

        if (options.server) {
          attachedServer = options.server
          attachListener(attachedServer, listener)
          return
        }

        ownedServer = createHttpServer((req, res) => {
          if (!listener!(req, res)) {
            res.statusCode = 404
            res.end('Not Found')
          }
        })

        const desiredPort = options.port ?? DEFAULT_PORT
        const desiredHost = options.host
        try {
          await listen(ownedServer, desiredPort, desiredHost)
        } catch (error) {
          // Wrap with the address we tried so port conflicts produce an
          // actionable message instead of a bare EADDRINUSE.
          throw new Error(
            `[mqttkit/asyncapi] failed to bind http://${desiredHost ?? 'localhost'}:${desiredPort}: ${(error as Error).message}`,
            { cause: error },
          )
        }

        // Surface post-startup runtime errors (e.g. ECONNRESET storms) instead
        // of letting them crash the process as 'uncaughtException'.
        ownedServer.on('error', (err) => {
          app.getLogger().error('asyncapi http server error', { error: err })
        })

        const address = ownedServer.address()
        const port = typeof address === 'object' && address ? address.port : desiredPort
        const host = desiredHost ?? 'localhost'
        app.getLogger().info(`asyncapi docs ready`, {
          url: `http://${host}:${port}${paths.docs}`,
          json: `http://${host}:${port}${paths.json}`,
          yaml: `http://${host}:${port}${paths.yaml}`,
        })
      })

      app.onStop(async () => {
        if (ownedServer) {
          await new Promise<void>((resolve, reject) => {
            ownedServer!.close((err) => (err ? reject(err) : resolve()))
          })
          ownedServer = undefined
        }
        if (attachedServer && listener) {
          detachListener(attachedServer, listener)
        }
      })
    },
  }
}

function respond(res: ServerResponse, type: string, body: string): true {
  res.statusCode = 200
  res.setHeader('content-type', type)
  res.setHeader('cache-control', 'no-store')
  res.end(body)
  return true
}

type AttachedListener = (req: IncomingMessage, res: ServerResponse) => boolean

const proxies = new WeakMap<AttachedListener, (req: IncomingMessage, res: ServerResponse) => void>()

function attachListener(server: HttpServer, listener: AttachedListener): void {
  const proxy = (req: IncomingMessage, res: ServerResponse) => {
    listener(req, res)
  }
  proxies.set(listener, proxy)
  server.prependListener('request', proxy)
}

function detachListener(server: HttpServer, listener: AttachedListener): void {
  const proxy = proxies.get(listener)
  if (proxy) {
    server.off('request', proxy)
    proxies.delete(listener)
  }
}

function listen(server: HttpServer, port: number, host?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      resolve()
    })
  })
}
