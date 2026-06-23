/**
 * 自定义 logger 演示。
 *
 * mqttkit 内部所有 warn/error（drain 超时、校验失败、metric handler 抛错、
 * onError handler 自身抛错）都走 `app.logger(logger)`。这里实现一个最小的
 * JSON 行 logger，把 meta 一并打到 stdout——真实项目里换成 pino /
 * OpenTelemetry / Sentry 即可。
 */
import { MqttApp, type MqttLogger, router } from '@mqttkit/core'
import { createTestApp } from '@mqttkit/core/testing'

const jsonLogger: MqttLogger = {
  debug: (msg, meta) => process.stdout.write(JSON.stringify({ level: 'debug', msg, ...meta }) + '\n'),
  info: (msg, meta) => process.stdout.write(JSON.stringify({ level: 'info', msg, ...meta }) + '\n'),
  warn: (msg, meta) => process.stdout.write(JSON.stringify({ level: 'warn', msg, ...meta }) + '\n'),
  error: (msg, meta) => process.stdout.write(JSON.stringify({ level: 'error', msg, ...meta }) + '\n'),
}

const { app, broker } = createTestApp()

app
  .logger(jsonLogger)
  .onMetric(() => {
    // 故意抛错：本应被 logger.error("metric handler threw") 接住。
    throw new Error('metrics exporter offline')
  })
  .use(
    router().topic('devices/:uid/events', {
      // 没有 schema 也没有 onError → 校验或处理错误会经 logger.warn/error 报出。
      schema: {
        '~standard': {
          version: 1 as const,
          vendor: 'demo',
          // 永远报错的校验器，用来演示 logger.warn 接住 schema 失败。
          validate: () => ({ issues: [{ message: 'temperature missing', path: ['temperature'] }] }),
        },
      },
      onMessage() {
        // 不会被调用，因为上面 schema 总是失败。
      },
    }),
  )

await app.listen()

// 触发一次会被校验拒绝的派发——观察 stdout 会先出现 schema warn，再出现
// metric error（因为 onMetric handler 自己抛了错）。
await broker.dispatch({
  topic: 'devices/abc/events',
  payload: Buffer.from('{}'),
  clientId: 'demo-client',
})

await app.stop()

// 也演示一下 listen 之外的纯 API 入口
const standalone = new MqttApp().logger(jsonLogger)
standalone.getLogger().info('mqttkit ready', { component: 'custom-logger-example' })
