/**
 * Request/Response over MQTT 5 — 用 `@mqttkit/core/testing` 演示。
 *
 * 注意：当前的 aedes 0.51.3 broker 还没有 MQTT 5 支持，在派发给订阅者
 * 时会丢掉 `packet.properties`（responseTopic / correlationData）。所以
 * 想端到端跑 RPC 时，要么换支持 MQTT 5 的 broker，要么像这里一样用
 * 内存版 `TestBroker` 验证逻辑。
 */
import { router } from '@mqttkit/core'
import { createTestApp } from '@mqttkit/core/testing'

const { app, broker } = createTestApp()

// 在同一个 app 里同时扮演「服务端」和「设备」：
// - server/echo: 服务端命令，收到请求直接 ctx.reply
// - devices/:uid/cmd: 模拟设备，收到请求后异步 ctx.reply
app
  .onError((payload) => {
    console.error('[mqttkit error]', payload.phase, payload.topic, payload.error)
  })
  .use(
    router()
      .topic('server/echo', {
        async onMessage(ctx) {
          await ctx.reply(`server echoed: ${ctx.payload.toString()}`)
        },
      })
      .topic('devices/:uid/cmd', {
        async onMessage(ctx) {
          await ctx.reply(`device(${ctx.params.uid}) got: ${ctx.payload.toString()}`)
        },
      }),
  )

// TestBroker 的 publish 默认只是记录到 published[]。这里把它当成最朴素
// 的「网络」：任何外发 PUBLISH 都立刻回环到 dispatch，让订阅方收到。
// 真实 broker（支持 MQTT 5 时）会自动完成这一步。
broker.onPublish = (entry) => {
  queueMicrotask(() => {
    void broker.dispatch({
      topic: entry.topic,
      payload: entry.payload,
      clientId: 'loopback',
      packet: entry.options?.properties ? { properties: entry.options.properties } : undefined,
    })
  })
}

await app.listen()

const deviceReply = await app.request('devices/alpha/cmd', 'ping', { timeout: 500 })
console.log('server <- device:', deviceReply.payload.toString())

const echoReply = await app.request('server/echo', 'hello', { timeout: 500 })
console.log('server <- server:', echoReply.payload.toString())

await app.stop()
