# dev.to Cover Image

dev.to 推荐封面：**1000×420**（实际显示 1000×420，建议 2x = 2000×840 输出）。

## 两个方案

| 文件 | 风格 | 推荐场景 |
| --- | --- | --- |
| `cover.html` | **代码款**——左边标题右边一段 Quick Start 代码 | 偏 dev 受众（dev.to / HN） |
| `cover-minimal.html` | **极简款**——大字号品牌名 + tagline | 偏品牌识别 / 重复使用 |

两份都自带渐变背景 + 网格 + 配色，无需额外素材。

## 怎么导出 PNG（三选一）

### 方式 A：用脚本自动导出（推荐）

```bash
# 在仓库根目录
bun add -D puppeteer       # 或 npm i -D puppeteer
node blog/cover/render.mjs # 产出 cover.png + cover-minimal.png（2x 高清）
```

输出在 `blog/cover/cover.png`、`blog/cover/cover-minimal.png`。

### 方式 B：浏览器手动截图（最快，无依赖）

1. 用 Chrome 打开 `blog/cover/cover.html`（或 `cover-minimal.html`）
2. 打开 DevTools → 调成 1000×420 的 device emulator，或直接给 body 设 `zoom: 1`
3. 右键 `.cover` 元素 → "Capture node screenshot"
4. 得到 PNG

### 方式 C：用在线工具

把 HTML 内容贴进 <https://htmlcsstoimage.com/> 或 <https://www.bannerbear.com/> 一类的服务，设置 1000×420，导出 PNG。

## 上传到 dev.to

dev.to 编辑器右上角 → "Add a cover image" → 上传刚才导出的 PNG。

如果觉得效果不够，可以：
- 调整 `cover.html` 里 `:root` 的颜色变量
- 换 `<h1>` 的字号 / tagline 文案
- 直接拿 carbon.now.sh 截一张代码图（最朴素）

## 备选：carbon.now.sh 一键模板

如果上面两个都嫌麻烦，直接打开：
<https://carbon.now.sh/?bg=rgba%280%2C0%2C0%2C0%29&t=one-dark&wt=none&l=typescript&ds=true&dsyoff=20px&dsblur=68px&wc=true&wa=true&pv=56px&ph=56px&ln=false&fl=1&fm=Hack&fs=14px&lh=152%25&si=false&es=2x&wm=false>

把 `examples/aedes-basic/src/index.ts` 的 Quick Start 段粘进去，导出 2x PNG 即可。
