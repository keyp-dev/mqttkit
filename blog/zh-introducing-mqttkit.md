# 给 MQTT 写应用，为什么不能像写 Elysia / Hono 一样？

> mqttkit：在 Aedes / EMQX 之上加一层应用框架——有序中间件、类型化 topic 路由、MQTT 5 RPC、自动生成 AsyncAPI 文档。

## 起因：MQTT 的应用层一直是一片散沙

只要在 Node 里写过认真一点的 MQTT 后端，下面这段代码你大概率写过：

```ts
client.on('message', (topic, payload) => {
  if (topic.startsWith('devices/') && topic.endsWith('/events')) {
    const uid = topic.split('/')[1]
    // 临时手写鉴权
    // 临时手写 JSON.parse + 校验
    // 临时手写错误处理
    // 临时手写埋点
    // ...
  } else if (topic.startsWith('server/')) {
    // ...
  }
})
```

这就是 HTTP 世界十年前那种 `http.createServer((req, res) => { if (req.url === '/users') ... })` 的写法——只不过换成了 MQTT。HTTP 那边我们靠 Express、Koa、Fastify，最近还有 Hono、Elysia 把这个模式彻底解决了。**MQTT 这边一直没有。**

[mqttkit](https://github.com/keyp/mqttkit) 想补齐的就是这一层。

## 设计决策：不重新实现 MQTT 协议

Node 生态本来就有很好的 broker：

- [Aedes](https://github.com/moscajs/aedes) — 嵌入式 broker，CONNECT / SUBSCRIBE / PUBLISH / QoS / retain / session / persistence / MQTT-over-WebSocket 全套都给你。
- EMQX、Mosquitto、NanoMQ — 真要扛百万连接时用这些。

这些东西没必要重写。真正缺的是**应用层**：

- 怎么声明式地说「这个 topic 必须经过 XX 鉴权」？
- 怎么用我已经在 HTTP 路由里用着的同一份 schema 校验 MQTT 的 payload？
- 怎么用 MQTT 5 做请求/响应，而不用手工管理 correlationData？
- 怎么白嫖一份 AsyncAPI 文档？
- 怎么接 Prometheus / OpenTelemetry，而不用去 hack broker？

mqttkit 就是这一层。通过 `@mqttkit/aedes` 适配到 Aedes，broker 是可插拔的——你也可以自己写适配器接 EMQX、NanoMQ。

## 代码长这样

```ts
import { aedes } from '@mqttkit/aedes'
import { MqttApp, router } from '@mqttkit/core'
import { z } from 'zod'

const app = new MqttApp<{ principal?: { uid: string } }>()
  .use(
    aedes({
      tcp: { port: 1883 },
      ws: { port: 8888, path: '/mqtt' },
      authenticate({ clientId, username }) {
        if (!username) return false
        return { uid: username || clientId }
      },
    }),
  )
  .use(
    router<{ principal?: { uid: string } }>()
      .topic('devices/:uid/events', {
        publish: ({ params, principal }) => params.uid === principal?.uid,
        schema: { body: z.object({ temperature: z.number() }) },
        timeout: 1_000,
        concurrency: 100,
        async onMessage(ctx) {
          // ctx.params.uid       → string
          // ctx.body.temperature → number（已校验、有类型）
          await ctx.publish(`server/${ctx.params.uid}/ack`, 'ok')
        },
      }),
  )

await app.listen()
```

写过 Elysia / Hono 的肌肉记忆可以直接迁移：`use()`、有序中间件、泛型驱动的类型推断、plugin 组合。

## 这些特性是真正省时间的部分

### 1. Topic 参数 + Standard Schema 校验

```ts
router().topic('devices/:uid/events', {
  schema: { body: z.object({ temperature: z.number() }) },
  async onMessage(ctx) {
    ctx.params.uid          // string，从 topic 模式抽出来
    ctx.body.temperature    // number，校验过、有类型
  },
})
```

任何 [Standard Schema](https://standardschema.dev/) 实现都能用：zod、valibot、arktype。不需要学 mqttkit 专属的 schema 方言。

### 2. 发布/订阅策略写成数据，而不是散落各处的回调

```ts
.topic('devices/:uid/events', {
  publish:   ({ params, principal }) => params.uid === principal?.uid,
  subscribe: ({ params, principal }) => params.uid === principal?.uid,
})
```

像路由定义一样易读，在正确的阶段被调用。再也不用满项目搜 `aedes.authorizePublish`。

### 3. MQTT 5 RPC 带重试

```ts
const reply = await app.request('devices/alpha/cmd', 'reboot', {
  timeout: 500,
  retries: 2,
  retryDelay: 20,
})
```

correlationData、responseTopic、超时、重试，全部处理好。设备端用 `ctx.reply(...)` 收尾。

### 4. 路由级护栏

```ts
.topic('expensive/op', {
  timeout: 1_000,          // 超时直接 fail-fast
  concurrency: 100,        // 路由级过载保护
  onError: ({ error }) => metrics.routeFailures.inc(),
  async onMessage(ctx) { /* ... */ },
})
```

超时和并发上限内置，触发后会以命名 phase 走 `onError`：`timeout` / `overload` / `validation` / `policy` / `handler` / `middleware` / `publish`。

### 5. AsyncAPI 3.0 文档零成本生成

```ts
import { asyncapi } from '@mqttkit/asyncapi'

app.use(asyncapi({
  info: { title: 'My IoT API', version: '1.0.0' },
  http: { port: 9000 },     // 9000 端口直接看文档
}))
```

topic 路由本来就是声明式的——mqttkit 遍历一遍就能吐出 AsyncAPI 3.0。配 `@mqttkit/zod` 或 `@mqttkit/typebox`，payload 的 JSON Schema 也会一起带上。

### 6. 结构化指标接 Prometheus / OTel

```ts
app.onMetric((evt) => {
  // evt.kind: 'dispatch' | 'publish'
  // evt.route, evt.topic, evt.durationMs, evt.outcome
  prometheus.observe(evt)
})
```

不用 monkey-patch broker，不用包装 handler。框架本身就知道每次 dispatch 的开始和结束。

### 7. 共享订阅、生命周期事件、服务端主动 publish

```ts
router().topic('$share/workers/jobs/+/run', { /* 多实例扇出 */ })

app.on('client.connect', ({ clientId }) => audit.log('connect', clientId))
app.publish('server/broadcast', JSON.stringify({ shutdown: true }))
```

### 8. 内存版 `TestBroker` 跑单测

```ts
import { createTestApp } from '@mqttkit/core/testing'

const { app, broker } = createTestApp()
// 不开 TCP、不开 socket，dispatch 走的是同一条 pipeline
```

毫秒级跑完真实的中间件 / router / RPC 链路。

## 什么时候适合 mqttkit，什么时候不适合

**适合：**

- 在做 IoT 后端、设备遥测管线、实时游戏服、或者任何 TypeScript 的 MQTT 应用。
- 想要鉴权 / 校验 / 指标 / 文档，但不想重复写五遍。
- 喜欢 Elysia / Hono / Fastify 的心智模型。
- 用 Bun（一等公民）或 Node 20+。

**不适合：**

- 你需要的是一个能扛十万连接的 broker——那应该直接用 EMQX 或 NanoMQ，mqttkit 是应用层，不是 broker 层。
- 你写的是五行的桥接脚本——`mqtt.js` 就够了。

## 安装

```bash
bun add @mqttkit/core @mqttkit/aedes aedes
# 或
npm install @mqttkit/core @mqttkit/aedes aedes
```

包的分工：

- `@mqttkit/core` — app、router、middleware、RPC、testing broker
- `@mqttkit/aedes` — Aedes 适配器（TCP + WebSocket）
- `@mqttkit/asyncapi` — AsyncAPI 3.0 生成器
- `@mqttkit/typebox`、`@mqttkit/zod` — schema helper

## 链接

- **文档：** <https://mqttkit.keyp.dev/zh/>
- **仓库：** <https://github.com/keyp/mqttkit>
- **示例：** [`examples/`](https://github.com/keyp/mqttkit/tree/main/examples) — aedes-basic、aedes-ws、asyncapi-docs、asyncapi-elysia、custom-logger、events、kafka-bridge、metrics-prometheus、rpc、schema-validation、service-push。

写过 MQTT 后端、踩过同样的坑的朋友，欢迎来仓库提 issue、PR 或者直接反馈你觉得还缺什么。觉得有用顺手给个 star——这是最便宜的支持方式。

---

*mqttkit 是 MIT 协议，面向 Bun + TypeScript 构建。*
