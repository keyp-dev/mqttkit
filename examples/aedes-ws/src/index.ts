import { aedes } from '@mqttkit/aedes'
import { MqttApp, router } from '@mqttkit/core'

const app = new MqttApp()
  .use(
    aedes({
      tcp: false,
      ws: { port: 8888, path: '/mqtt' },
    }),
  )
  .use(
    router()
      .topic('browser/:clientId/ping', {
        async onMessage(ctx) {
          await ctx.publish(`browser/${ctx.params.clientId}/pong`, ctx.payload, { qos: 0 })
        },
      })
      .topic('browser/:clientId/pong'),
  )

await app.listen()
console.log('mqttkit Aedes WS example listening on ws://localhost:8888/mqtt')
