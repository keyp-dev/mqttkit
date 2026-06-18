import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { aedes } from '@mqttkit/aedes'
import { createAsyncApiHandlers } from '@mqttkit/asyncapi'
import { MqttApp, router } from '@mqttkit/core'
import { Elysia } from 'elysia'

type Principal = { uid: string }
type State = { principal?: Principal }

const PORT = 3300
const WS_PATH = '/mqtt'

// 1. A Node http.Server that both aedes (for MQTT-over-WS) and Elysia share.
const httpServer = createServer()

// 2. mqttkit app. aedes attaches MQTT-over-WS to `httpServer` on /mqtt
//    instead of starting its own ws server.
const mqttApp = new MqttApp<State>()
  .use(
    aedes({
      tcp: { port: 1883 },
      ws: { server: httpServer, path: WS_PATH },
      authenticate: ({ username }) => (username ? { uid: username } : false),
    }),
  )
  .use(
    router<State>()
      .topic('devices/:uid/events', {
        publish: ({ params, principal }) => params.uid === principal?.uid,
        qos: 1,
        schema: {
          type: 'object',
          required: ['temperature'],
          properties: {
            temperature: { type: 'number', description: 'Celsius' },
            ts: { type: 'integer' },
          },
        },
        async onMessage(ctx) {
          await ctx.publish(`server/${ctx.params.uid}/echo`, ctx.payload)
        },
        meta: { summary: 'Device telemetry uplink', tags: ['device'] },
      })
      .topic('server/:uid/echo', {
        subscribe: ({ params, principal }) => params.uid === principal?.uid,
        qos: 0,
        meta: { summary: 'Server echo channel', tags: ['device'] },
      })
      .topic('users/:uid/notifications', {
        subscribe: ({ params, principal }) => params.uid === principal?.uid,
        publish: false,
        qos: 1,
        retain: true,
        meta: { summary: 'User notifications', tags: ['notifications'] },
      }),
  )

await mqttApp.listen()

// 3. AsyncAPI handlers wired into Elysia routes.
const docs = createAsyncApiHandlers(mqttApp, {
  info: { title: 'mqttkit + Elysia', version: '0.1.0' },
  servers: {
    tcp: { host: `localhost:1883`, protocol: 'mqtt' },
    ws: { host: `localhost:${PORT}`, protocol: 'ws', pathname: WS_PATH },
  },
  prefix: '/docs/mqtt',
})

const elysia = new Elysia()
  .get('/', () => 'mqttkit + Elysia: HTTP + MQTT-over-WS on a single port')
  .get(docs.paths.json, ({ set }) => {
    set.headers['content-type'] = 'application/json; charset=utf-8'
    return docs.json()
  })
  .get(docs.paths.yaml, ({ set }) => {
    set.headers['content-type'] = 'application/yaml; charset=utf-8'
    return docs.yaml()
  })
  .get(docs.paths.docs, ({ set }) => {
    set.headers['content-type'] = 'text/html; charset=utf-8'
    return docs.html()
  })

// 4. Bridge Node http requests to Elysia.handle(Request) → Response.
httpServer.on('request', async (req: IncomingMessage, res: ServerResponse) => {
  try {
    const response = await elysia.handle(toFetchRequest(req))
    sendFetchResponse(res, response)
  } catch (error) {
    res.statusCode = 500
    res.end(String(error))
  }
})

await new Promise<void>((resolve, reject) => {
  httpServer.once('error', reject)
  httpServer.listen(PORT, () => {
    httpServer.off('error', reject)
    resolve()
  })
})

console.log(`mqtt://localhost:1883             (TCP)`)
console.log(`ws://localhost:${PORT}${WS_PATH}              (MQTT-over-WS, same port as docs)`)
console.log(`http://localhost:${PORT}${docs.paths.docs}    (docs page)`)
console.log(`http://localhost:${PORT}${docs.paths.json}    (AsyncAPI JSON)`)

function toFetchRequest(req: IncomingMessage): Request {
  const host = req.headers.host ?? `localhost:${PORT}`
  const url = `http://${host}${req.url ?? '/'}`
  const init: RequestInit & { duplex?: 'half' } = {
    method: req.method ?? 'GET',
    headers: req.headers as Record<string, string>,
  }
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = Readable.toWeb(req) as unknown as ReadableStream
    init.duplex = 'half'
  }
  return new Request(url, init as RequestInit)
}

async function sendFetchResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status
  response.headers.forEach((value, key) => res.setHeader(key, value))
  if (!response.body) {
    res.end()
    return
  }
  const reader = response.body.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    res.write(value)
  }
  res.end()
}
