import { aedes } from '@mqttkit/aedes'
import mqtt from 'mqtt'
import { MqttApp, router } from '@mqttkit/core'

type KafkaMessage = {
  key: string
  value: Buffer
}

interface KafkaBridge {
  produce(topic: string, value: Buffer, key: string): Promise<void>
  onCommands(handler: (message: KafkaMessage) => Promise<void>): void
}

class InMemoryKafkaBridge implements KafkaBridge {
  private commandHandler?: (message: KafkaMessage) => Promise<void>

  async produce(topic: string, value: Buffer, key: string): Promise<void> {
    console.log('kafka produce', { topic, key, value: value.toString() })
  }

  onCommands(handler: (message: KafkaMessage) => Promise<void>): void {
    this.commandHandler = handler
  }

  async simulateCommand(uid: string, value: string): Promise<void> {
    await this.commandHandler?.({ key: uid, value: Buffer.from(value) })
  }
}

const kafkaSource = new InMemoryKafkaBridge()
const kafka: KafkaBridge = kafkaSource

const app = new MqttApp<{ services: { kafka: KafkaBridge } }>()
  .decorate('kafka', kafka)
  .use(aedes({ tcp: { port: 1885 } }))
  .use(
    router<{ services: { kafka: KafkaBridge } }>()
      .topic('devices/:uid/events', {
        async onMessage(ctx) {
          await ctx.services.kafka.produce('device.events', ctx.payload, ctx.params.uid)
        },
      })
      .topic('server/:uid/commands'),
  )

kafka.onCommands(async (message) => {
  await app.publish(`server/${message.key}/commands`, message.value, { qos: 1 })
})

await app.listen()
console.log('mqttkit kafka bridge example listening on mqtt://localhost:1885')

const demoClient = mqtt.connect('mqtt://localhost:1885', {
  clientId: 'demo-command-client',
  reconnectPeriod: 0,
})

demoClient.on('connect', () => {
  demoClient.subscribe('server/demo/commands', { qos: 1 })
})

demoClient.on('message', (topic, payload) => {
  console.log('mqtt client received', {
    topic,
    payload: payload.toString(),
  })
})

setInterval(() => {
  void kafkaSource.simulateCommand('demo', JSON.stringify({ action: 'sync', at: new Date().toISOString() }))
}, 10_000)
