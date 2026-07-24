# mqttkit 发布投放指南

两份正文：
- 英文：`blog/en-introducing-mqttkit.md`
- 中文：`blog/zh-introducing-mqttkit.md`

按下面的渠道顺序投，每个渠道都列了**标题候选 / tag / 字数 / 平台特有注意事项**。

---

## A. 英文渠道

### 1. dev.to （强烈推荐先发这里）

- **URL**：<https://dev.to/new>
- **标题候选**：
  - `mqttkit: Elysia-style application framework for MQTT`
  - `Why doesn't MQTT have its own Express? Introducing mqttkit`
  - `Building MQTT apps in TypeScript with ordered middleware and typed topic routes`
- **Tags**（最多 4 个，按热度选）：`typescript`, `mqtt`, `iot`, `bun`
- **Cover image**：建议自己做一张 1000x420 的题图（一行代码 + logo 就够）。可以用 ray.so / carbon.now.sh 截那段 Quick Start 代码。
- **Canonical URL**：如果你后面要在 Medium / 个人博客同步，建议先发 dev.to，再把 dev.to 的 URL 填到其他平台的 canonical 上。
- **正文**：直接贴 `en-introducing-mqttkit.md` 的 Markdown。dev.to 完全支持。

### 2. Hacker News — Show HN

- **URL**：<https://news.ycombinator.com/submit>
- **标题**：`Show HN: mqttkit – Elysia-style application framework for MQTT`
  - HN 标题不要 emoji、不要全大写、不要营销词。
- **URL 填**：你的 GitHub 仓库地址 `https://github.com/keyp/mqttkit`，**不要**填博客地址。
- **首条评论**（自己作为作者发，开场就放，HN 默认会展开）：

  > Author here. I kept writing the same MQTT boilerplate — ad-hoc auth in `aedes.authorizePublish`, JSON.parse + zod by hand in `client.on('message')`, manual correlationData for RPC. After the third project I extracted the framework layer.
  >
  > Design choice: don't reimplement the protocol. Aedes / EMQX / Mosquitto already do CONNECT, QoS, retain, sessions, MQTT 5 properties. mqttkit is purely the application layer on top — ordered `use()` middleware, `router().topic()` with topic params and Standard Schema validation, MQTT 5 RPC with retries, per-route timeout/concurrency, AsyncAPI 3.0 generation from the same route declarations, structured metrics hooks for Prometheus/OTel.
  >
  > Bun + TypeScript first. In-memory TestBroker for unit tests. Currently with an Aedes adapter; broker interface is small (a couple hundred LOC) if anyone wants to wire it to EMQX or NanoMQ.
  >
  > Feedback welcome — particularly on the RPC retry semantics and the topic-policy shape.

- **发布时机**：周二/周三 UTC 早上 9 点（≈ 北京 17:00）或 UTC 下午 3 点上 HN front page 概率高一些。
- **重要**：发完不要刷票、不要在群里求 upvote，HN 反作弊会直接埋。

### 3. Reddit

按 subreddit 分别发（**不要同一时间一次发完，会被识别为 spam**，每个 sub 隔几小时）：

| Subreddit | 标题 | 注意 |
| --- | --- | --- |
| r/typescript | `mqttkit – Elysia-style application framework for MQTT, written in TypeScript` | 强调 TS 类型推断、Standard Schema 集成 |
| r/node | `Express but for MQTT – ordered middleware, topic routes, MQTT 5 RPC` | 强调和 mqtt.js / aedes 直接 hook 的对比 |
| r/IOT | `Built an application framework for MQTT backends (auth, validation, AsyncAPI docs)` | 强调 IoT 应用场景、AsyncAPI |
| r/javascript | `Show /r/javascript: mqttkit – MQTT application framework with typed routes and RPC` | 偏 demo 友好 |
| r/bun | `mqttkit – first-class Bun MQTT framework` | 强调 Bun 性能 / 一等公民 |

**正文**：把 `en-introducing-mqttkit.md` 里"代码长这样" + 3-5 个核心特性 + 链接，保留 800-1200 词左右，太长 Reddit 不爱看。

### 4. Medium

- 等 dev.to 发完 24 小时后再发 Medium，正文一样。
- **必须**填 canonical URL 指向 dev.to（Settings → Customize → Canonical URL），否则 SEO 互相吃掉。
- Publication 投递：`Better Programming` / `Level Up Coding` / `JavaScript in Plain English`，任选一个。

### 5. Awesome 列表 PR（长期 SEO，强烈建议都做）

| 仓库 | 操作 |
| --- | --- |
| [hobbyquaker/awesome-mqtt](https://github.com/hobbyquaker/awesome-mqtt) | 加到 "Libraries" / Node 区块 |
| [apvarun/awesome-bun](https://github.com/apvarun/awesome-bun) | 加到 Networking / Framework 区块 |
| [HQarroum/awesome-iot](https://github.com/HQarroum/awesome-iot) | 加到 Frameworks |
| [sindresorhus/awesome-nodejs](https://github.com/sindresorhus/awesome-nodejs) | 门槛较高，先攒 ≥500 star 再试 |

PR 描述：一行项目说明 + 仓库链接 + 已有 npm published 的证明。

### 6. AsyncAPI 官方 tooling 目录

- 仓库：<https://github.com/asyncapi/website>（tools 数据在 `pages/tools/` 或 `config/tools.json`，PR 之前先 search 一下当前位置）
- 目的：让 `@mqttkit/asyncapi` 出现在 <https://www.asyncapi.com/tools> 列表
- 收录条件：开源 + 有文档 + 能跑

### 7. Discord 社群「Show & Tell」

按这些社区的 `#showcase` / `#show-and-tell` / `#i-made-this` 发：
- Elysia Discord
- Bun Discord
- AsyncAPI Discord（很重要，因为你用了他们的标准）
- TypeScript Community Discord

文案要短（1-2 段 + 链接），别复制粘贴博客全文。

---

## B. 中文渠道

### 1. 掘金（juejin.cn）

- **URL**：<https://juejin.cn/editor/drafts/new?type=article>
- **标题候选**：
  - `给 MQTT 写应用，为什么不能像写 Elysia / Hono 一样？`
  - `mqttkit：在 Aedes 之上加一层 Elysia 风格的应用框架`
  - `用 TypeScript 写 MQTT 后端的正确姿势`
- **分类**：后端 / Node.js
- **标签**：`TypeScript` `Node.js` `物联网` `MQTT` `Bun`
- **封面**：用 carbon.now.sh 截 Quick Start 代码即可。
- **正文**：直接贴 `zh-introducing-mqttkit.md`。

### 2. V2EX

- **URL**：<https://www.v2exhub.com/new>（或 v2ex.com）
- **节点**：`分享创造` 或 `程序员`
- **标题**：`[分享创造] mqttkit：给 MQTT 写应用，像写 Elysia / Hono 那样`
- **正文**：V2EX 不爱长文，建议 300-500 字概述 + 仓库链接 + 文档链接。可以拷贝中文文章的「起因」「Quick Start 代码」「链接」三段。
- **注意**：V2EX 用户对营销文很敏感，开头不要吹，直接讲技术动机。

### 3. 知乎

- **URL**：<https://zhuanlan.zhihu.com/write>
- **专栏**：发到自己的专栏，或者投稿 `前端开发` `Node.js` 相关专栏。
- **标题**：`给 MQTT 写应用，为什么不能像写 Elysia / Hono 一样？`
- **正文**：知乎支持 Markdown 编辑器，但代码块体验较差。建议把代码段单独贴成 carbon.now.sh 图片或 Gist 嵌入会更好看。
- **末尾**：可以加一个开放性问题引导评论：「你在 MQTT 后端踩过哪些重复造轮子的坑？」

### 4. 微信公众号 / 个人博客（可选）

如果你有公众号，同样标题 + 中文正文。重点：

- 公众号要把所有 GitHub 链接放在「阅读原文」里，正文里写文字版（微信检测外链会限流）。
- 个人博客记得加 `<link rel="canonical" href="https://juejin.cn/...">`，把权重让给掘金。

### 5. SegmentFault

- 投到「Node.js」「TypeScript」标签下。
- 受众和掘金重叠但更技术向，直接复用中文正文即可。

### 6. OSCHINA

- 适合发「项目发布」类。<https://www.oschina.net/news/post>
- 选择 "开源项目"，会被收录到 oschina 项目库里，对国内搜索引擎 SEO 有帮助。

---

## C. 长期持续动作（不止一次性）

1. **每次发版本写 changelog 推文**：X / 微博 / 掘金沸点都发一条。"v0.x: 新增 XX，修了 YY。"
2. **录一段 60 秒 demo**：device 连上 → 看到 topic route 命中 → 浏览器打开 AsyncAPI 文档。发 X / B 站 / YouTube Shorts。
3. **写延伸文章**：每个核心特性单独一篇深度文章，比 README 多讲设计取舍。例如：
   - "MQTT 5 RPC 在 Aedes 上的实现细节"
   - "为什么 mqttkit 用 Standard Schema 而不是自创校验 API"
   - "AsyncAPI 3.0 是怎么从路由声明里被推导出来的"
4. **盯 GitHub issue**：第一周高频响应、互动，star 转化率最高的就是这一周。
5. **每 3 个月去 awesome 列表里检查链接是否还在**，顺手 PR 更新描述。

---

## D. 投放节奏建议（一周内做完最有效）

| 天 | 动作 |
| --- | --- |
| D1 周二 | dev.to 发英文版；中文版同步发掘金 |
| D2 周三 | Hacker News Show HN（UTC 早 9 点）；24h 内不要去刷票 |
| D3 周四 | Reddit r/typescript + r/node（间隔几小时） |
| D4 周五 | Reddit r/IOT + r/bun；Discord 社群 showcase |
| D5 周末 | Medium 发英文版（canonical 指向 dev.to） |
| D6 周一 | V2EX 分享创造 + SegmentFault + 知乎 |
| D7 周二 | Awesome 列表 PR（一次性提交 3-4 个） |

---

## E. 题图 / 物料准备清单

发布之前先做好这些，避免临到发的时候卡住：

- [ ] 1 张代码题图（1000×420，carbon.now.sh 截 Quick Start）
- [ ] 1 张架构图（broker adapter / middleware / router / asyncapi 四层关系）—— 可选
- [ ] 1 段 60 秒 GIF 或 mp4 demo —— 可选但强烈推荐
- [ ] GitHub repo 的 `About` 描述、Topics（`mqtt` `iot` `bun` `typescript` `elysia` `asyncapi`）补齐
- [ ] GitHub repo 加 Social Preview 图（Settings → Social preview）
- [ ] README 顶部加一行 badge：npm version / license / bundle size

题图直接做不动的话，最低成本：carbon.now.sh 选 `One Dark` 主题，贴 Quick Start，导出 PNG。

---

## F. 你不该做的事

- ❌ 同一天往 5 个 subreddit 一次性投——会被自动判 spam
- ❌ HN 发完拉群求 upvote——会被埋
- ❌ 标题用 emoji 或全大写——HN / Reddit 都不喜欢
- ❌ 中文文章里说 "革命性"、"颠覆"、"最强"——技术社区会被反感
- ❌ 评论区遇到批评直接辩论——感谢 + 记录到 issue 是更好的姿势
