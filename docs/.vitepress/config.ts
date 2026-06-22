import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

const GITHUB_REPO = 'https://github.com/keyp-dev/mqttkit'

// Runs in <head> before body parsing so the browser starts navigating
// before the English landing renders. Only fires on the landing path.
// `document.referrer` check lets users click the langSwitcher back to
// English from /zh/ without bouncing them in a loop.
const browserLanguageRedirect = `(function(){
  if (typeof window === 'undefined') return;
  var path = location.pathname;
  if (path !== '/' && path !== '/index.html') return;
  try {
    if (document.referrer) {
      var ref = new URL(document.referrer);
      if (ref.host === location.host && ref.pathname.indexOf('/zh') === 0) return;
    }
  } catch (e) {}
  var langs = navigator.languages && navigator.languages.length
    ? navigator.languages
    : [navigator.language || ''];
  for (var i = 0; i < langs.length; i++) {
    var l = (langs[i] || '').toLowerCase();
    if (l.indexOf('zh') === 0) {
      location.replace('/zh/');
      return;
    }
  }
})();`

type SidebarTopic = {
  id: string
  en: string
  zh: string
}

type SidebarSection = {
  en: string
  zh: string
  topics: SidebarTopic[]
}

// Single source of truth for the guide sidebar — grouped by intent so the
// reading path (introduce → adapt → wire → integrate → harden → verify) is
// obvious without anyone having to read all 11 pages to find what they need.
const GUIDE_SECTIONS: SidebarSection[] = [
  {
    en: 'Introduction',
    zh: '入门',
    topics: [
      { id: 'getting-started', en: 'Getting Started', zh: '快速开始' },
    ],
  },
  {
    en: 'Broker Adapters',
    zh: 'Broker 适配器',
    topics: [
      { id: 'aedes', en: 'Aedes Adapter', zh: 'Aedes 适配器' },
    ],
  },
  {
    en: 'Message Handling',
    zh: '消息处理',
    topics: [
      { id: 'schema', en: 'Schema Validation', zh: 'Schema 校验' },
      { id: 'rpc', en: 'RPC', zh: 'RPC' },
      { id: 'events', en: 'Events', zh: '事件监听' },
    ],
  },
  {
    en: 'Service Integration',
    zh: '服务集成',
    topics: [
      { id: 'service-push', en: 'Service Push', zh: 'Service Push' },
      { id: 'kafka-bridge', en: 'Kafka Bridge', zh: 'Kafka Bridge' },
    ],
  },
  {
    en: 'Production',
    zh: '生产部署',
    topics: [
      { id: 'shared-subscriptions', en: 'Shared Subscriptions', zh: '共享订阅' },
      { id: 'handler-limits', en: 'Handler Timeout & Concurrency', zh: 'Handler 超时与并发' },
      { id: 'graceful-shutdown', en: 'Graceful Shutdown', zh: '优雅关停' },
      { id: 'metrics', en: 'Metrics', zh: '指标' },
      { id: 'tracing', en: 'Tracing & User Properties', zh: 'Tracing 与 User Properties' },
    ],
  },
  {
    en: 'Testing',
    zh: '测试',
    topics: [
      { id: 'testing', en: 'Testing', zh: '测试' },
    ],
  },
]

const enSidebarGroups = GUIDE_SECTIONS.map((section) => ({
  text: section.en,
  collapsed: false,
  items: section.topics.map((topic) => ({ text: topic.en, link: `/${topic.id}` })),
}))

const zhSidebarGroups = GUIDE_SECTIONS.map((section) => ({
  text: section.zh,
  collapsed: false,
  items: section.topics.map((topic) => ({ text: topic.zh, link: `/zh/${topic.id}` })),
}))

export default withMermaid({
  title: 'mqttkit',
  description:
    'Elysia-style MQTT application framework. Compose broker adapters, middleware, topic routers, validation, and services.',
  lastUpdated: true,
  cleanUrls: true,
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    ['meta', { name: 'theme-color', content: '#3eaf7c' }],
    ['script', {}, browserLanguageRedirect],
  ],
  themeConfig: {
    socialLinks: [{ icon: 'github', link: GITHUB_REPO }],
    search: {
      provider: 'local',
      options: {
        locales: {
          zh: {
            translations: {
              button: {
                buttonText: '搜索文档',
                buttonAriaLabel: '搜索文档',
              },
              modal: {
                noResultsText: '无法找到相关结果',
                resetButtonTitle: '清除查询条件',
                footer: {
                  selectText: '选择',
                  navigateText: '切换',
                  closeText: '关闭',
                },
              },
            },
          },
        },
      },
    },
  },
  locales: {
    root: {
      label: 'English',
      lang: 'en-US',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/getting-started' },
          { text: 'Packages', link: `${GITHUB_REPO}/tree/main/packages` },
          { text: 'Examples', link: `${GITHUB_REPO}/tree/main/examples` },
          { text: 'Changelog', link: '/changelog' },
        ],
        sidebar: enSidebarGroups,
        editLink: {
          pattern: `${GITHUB_REPO}/edit/main/docs/:path`,
          text: 'Edit this page on GitHub',
        },
        footer: {
          message: 'Released under the MIT License.',
        },
      },
    },
    zh: {
      label: '简体中文',
      lang: 'zh-CN',
      link: '/zh/',
      themeConfig: {
        nav: [
          { text: '指南', link: '/zh/getting-started' },
          { text: '包', link: `${GITHUB_REPO}/tree/main/packages` },
          { text: '示例', link: `${GITHUB_REPO}/tree/main/examples` },
          { text: '更新日志', link: '/zh/changelog' },
        ],
        sidebar: {
          '/zh/': zhSidebarGroups,
        },
        outline: { label: '本页目录' },
        docFooter: { prev: '上一页', next: '下一页' },
        darkModeSwitchLabel: '主题',
        lightModeSwitchTitle: '切换到浅色模式',
        darkModeSwitchTitle: '切换到深色模式',
        sidebarMenuLabel: '菜单',
        returnToTopLabel: '回到顶部',
        langMenuLabel: '切换语言',
        editLink: {
          pattern: `${GITHUB_REPO}/edit/main/docs/:path`,
          text: '在 GitHub 上编辑此页',
        },
        footer: {
          message: '基于 MIT 协议发布',
        },
      },
    },
  },
  mermaid: {},
  vite: {
    optimizeDeps: {
      include: ['mermaid', 'dayjs', 'cytoscape', 'cytoscape-cose-bilkent'],
    },
    ssr: {
      noExternal: ['mermaid', 'dayjs'],
    },
  },
})
