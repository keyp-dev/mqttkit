---
layout: home

hero:
  name: mqttkit
  text: Elysia-style MQTT framework
  tagline: Compose broker adapters, middleware, topic routers, schema validation, and services with one fluent API.
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/keyp-dev/mqttkit

features:
  - title: Routing & Middleware
    details: Ordered <code>use()</code> middleware, <code>router().topic()</code> declarations, and topic params extracted directly into <code>ctx.params</code>.
  - title: Schema & RPC
    details: Any Standard Schema validator (zod, valibot, arktype) plugs in via <code>topic({ schema })</code>. MQTT 5 RPC round-trips through <code>app.request()</code> and <code>ctx.reply()</code>.
  - title: AsyncAPI Docs
    details: Generate AsyncAPI 3.0 documents directly from your routes with <code>@mqttkit/asyncapi</code>, with JSON Schema flow from TypeBox or zod.
---
