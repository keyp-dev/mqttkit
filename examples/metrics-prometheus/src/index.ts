import { aedes } from '@mqttkit/aedes'
import { MqttApp, router } from '@mqttkit/core'
import { Counter, Gauge, Histogram, register } from 'prom-client'
import http from 'node:http'

const DISPATCH_BUCKETS = [0.01, 0.05, 0.1, 0.5, 1, 5, 10]

const dispatchHist = new Histogram({
  name: 'mqtt_dispatch_seconds',
  help: 'mqttkit dispatch duration',
  labelNames: ['route', 'result', 'error_phase'],
  buckets: DISPATCH_BUCKETS,
})

const publishHist = new Histogram({
  name: 'mqtt_publish_seconds',
  help: 'mqttkit publish duration',
  labelNames: ['topic', 'result'],
  buckets: DISPATCH_BUCKETS,
})

const overloadCounter = new Counter({
  name: 'mqtt_overload_total',
  help: 'Messages dropped because route concurrency was full',
  labelNames: ['route'],
})

const timeoutCounter = new Counter({
  name: 'mqtt_timeout_total',
  help: 'Handlers that exceeded route timeout',
  labelNames: ['route'],
})

const app = new MqttApp()
  .use(aedes({ tcp: { port: 1883 } }))
  .use(
    router()
      .topic('devices/:uid/events', {
        timeout: 5_000,
        concurrency: 100,
        async onMessage(ctx) {
          await new Promise((r) => setTimeout(r, Math.random() * 200))
          await ctx.publish(`server/${ctx.params.uid}/ack`, ctx.payload, { qos: 0 })
        },
      })
      .topic('server/:uid/ack'),
  )

new Gauge({
  name: 'mqtt_inflight',
  help: 'In-flight handler count per route',
  labelNames: ['route'],
  collect() {
    for (const route of app.getRoutes()) {
      this.labels(route.pattern).set(route.inflight)
    }
  },
})

new Gauge({
  name: 'mqtt_active_total',
  help: 'Sum of in-flight handlers across all routes',
  collect() {
    this.set(app.activeCount())
  },
})

app.onMetric((event) => {
  if (event.type === 'dispatch') {
    dispatchHist
      .labels(event.route?.pattern ?? 'unmatched', event.result, event.errorPhase ?? '')
      .observe(event.durationMs / 1000)
  } else {
    publishHist.labels(event.topic, event.result).observe(event.durationMs / 1000)
  }
})

app.onError(({ phase, route }) => {
  const pattern = route?.pattern ?? ''
  if (phase === 'overload') overloadCounter.labels(pattern).inc()
  if (phase === 'timeout') timeoutCounter.labels(pattern).inc()
})

const metricsPort = 9090
http
  .createServer(async (req, res) => {
    if (req.url !== '/metrics') {
      res.statusCode = 404
      res.end('not found')
      return
    }
    res.setHeader('Content-Type', register.contentType)
    res.end(await register.metrics())
  })
  .listen(metricsPort, () => {
    console.log(`metrics exposed on http://localhost:${metricsPort}/metrics`)
  })

await app.listen()
console.log('mqttkit metrics-prometheus example listening on mqtt://localhost:1883')
