import { aedes } from '@mqttkit/aedes'
import { MqttApp, router, type MqttEventName } from '@mqttkit/core'

const app = new MqttApp()
  .use(aedes({ tcp: { port: 1884 }, ws: { port: 8889, path: '/mqtt' } }))
  .use(
    router()
      .topic('events/:id/inbound', {
        onMessage(ctx) {
          console.log('handler', ctx.params.id, ctx.payload.toString())
        },
      })
      .topic('events/:id/outbound'),
  )

const eventNames: MqttEventName[] = [
  'client',
  'clientReady',
  'clientDisconnect',
  'keepaliveTimeout',
  'clientError',
  'connectionError',
  'connackSent',
  'ping',
  'publish',
  'ack',
  'subscribe',
  'unsubscribe',
]

for (const eventName of eventNames) {
  app.on(eventName, (event) => {
    console.log('mqtt event', event.type, {
      clientId: event.clientId,
      topic: event.topic,
      error: event.error instanceof Error ? event.error.message : undefined,
    })
  })
}

await app.listen()
console.log('mqttkit events example listening on mqtt://localhost:1884 and ws://localhost:8889/mqtt')
