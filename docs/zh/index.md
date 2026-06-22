---
layout: home

hero:
  name: mqttkit
  text: Elysia 风格的 MQTT 框架
  tagline: 用同一套 fluent API 组合 broker adapter、middleware、topic router、schema 校验与服务注入。
  actions:
    - theme: brand
      text: 快速开始
      link: /zh/getting-started
    - theme: alt
      text: 在 GitHub 查看
      link: https://github.com/keyp-dev/mqttkit

features:
  - title: Routing 与 Middleware
    details: 有序的 <code>use()</code> middleware，<code>router().topic()</code> 声明 route，topic 参数自动注入 <code>ctx.params</code>。
  - title: Schema 与 RPC
    details: 任意 Standard Schema 校验器（zod、valibot、arktype）都能直接通过 <code>topic({ schema })</code> 接入。<code>app.request()</code> 与 <code>ctx.reply()</code> 提供 MQTT 5 RPC 往返。
  - title: AsyncAPI 文档
    details: 通过 <code>@mqttkit/asyncapi</code> 直接从 route 生成 AsyncAPI 3.0 文档，并自动整合 TypeBox / zod 的 JSON Schema。
---
