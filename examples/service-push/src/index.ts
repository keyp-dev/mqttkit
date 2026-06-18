import { aedes } from '@mqttkit/aedes'
import mqtt from 'mqtt'
import { MqttApp, router } from '@mqttkit/core'

class BillingService {
  private handler?: (event: { uid: string; payload: Buffer }) => Promise<void>

  onInvoicePaid(handler: (event: { uid: string; payload: Buffer }) => Promise<void>): void {
    this.handler = handler
  }

  async simulateInvoicePaid(uid: string): Promise<void> {
    await this.handler?.({
      uid,
      payload: Buffer.from(JSON.stringify({
        type: 'invoice.paid',
        uid,
        paidAt: new Date().toISOString(),
      })),
    })
  }
}

const billing = new BillingService()

const app = new MqttApp()
  .use(aedes({ tcp: { port: 1886 } }))
  .use(
    router().topic('users/:uid/notifications', {
      subscribe: true,
      publish: false,
    }),
  )

billing.onInvoicePaid(async (event) => {
  await app.publish(`users/${event.uid}/notifications`, event.payload, { qos: 1 })
  console.log('service -> mqtt', {
    topic: `users/${event.uid}/notifications`,
    payload: event.payload.toString(),
  })
})

await app.listen()
console.log('mqttkit service push example listening on mqtt://localhost:1886')

const demoClient = mqtt.connect('mqtt://localhost:1886', {
  clientId: 'demo-notification-client',
  reconnectPeriod: 0,
})

demoClient.on('connect', () => {
  demoClient.subscribe('users/demo/notifications', { qos: 1 })
})

demoClient.on('message', (topic, payload) => {
  console.log('mqtt client received', {
    topic,
    payload: payload.toString(),
  })
})

setInterval(() => {
  void billing.simulateInvoicePaid('demo')
}, 3_000)
