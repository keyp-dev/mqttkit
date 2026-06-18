import { aedes } from '@mqttkit/aedes'
import { MqttApp, router } from '@mqttkit/core'

type Services = {
  audit: {
    log(event: string, fields: Record<string, unknown>): Promise<void>
  }
}

const app = new MqttApp<{ principal?: { uid: string }; services: Services }>()
  .decorate('audit', {
    async log(event: string, fields: Record<string, unknown>) {
      console.log(event, fields)
    },
  })
  .use(
    aedes({
      tcp: { port: 1883 },
      authenticate: ({ clientId, username }) => {
        if (!username) return false
        return { uid: username || clientId }
      },
    }),
  )
  .use(async (ctx, next) => {
    await ctx.services.audit.log('mqtt.message', {
      clientId: ctx.clientId,
      topic: ctx.topic,
    })
    await next()
  })
  .use(
    router<{ principal?: { uid: string }; services: Services }>()
      .topic('devices/:uid/events', {
        publish: ({ params, principal }) => params.uid === principal?.uid,
        async onMessage(ctx) {
          await ctx.publish(`server/${ctx.params.uid}/echo`, ctx.payload, { qos: 0 })
        },
      })
      .topic('server/:uid/echo', {
        subscribe: ({ params, principal }) => params.uid === principal?.uid,
      }),
  )

await app.listen()
console.log('mqttkit Aedes TCP example listening on mqtt://localhost:1883')
