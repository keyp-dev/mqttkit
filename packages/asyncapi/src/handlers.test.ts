import { describe, expect, test } from 'bun:test'
import { MqttApp, router } from '@mqttkit/core'
import { createAsyncApiHandlers, normalizePrefix, renderAsyncApiHtml } from './handlers.js'

const info = { title: 'T', version: '1.0.0' }

function makeApp() {
  return new MqttApp().use(router().topic('devices/:uid/events', { onMessage() {} }))
}

describe('createAsyncApiHandlers', () => {
  test('默认 paths', () => {
    const h = createAsyncApiHandlers(makeApp(), { info })
    expect(h.paths).toEqual({ json: '/asyncapi.json', yaml: '/asyncapi.yaml', docs: '/docs' })
  })

  test('prefix 被规范化（自动加前导斜杠、去除尾斜杠）', () => {
    const h = createAsyncApiHandlers(makeApp(), { info, prefix: 'api/' })
    expect(h.paths).toEqual({
      json: '/api/asyncapi.json',
      yaml: '/api/asyncapi.yaml',
      docs: '/api/docs',
    })
  })

  test('document() 输出有效 AsyncAPI 3.0 顶层字段', () => {
    const h = createAsyncApiHandlers(makeApp(), { info })
    const doc = h.document()
    expect(doc.asyncapi).toBe('3.0.0')
    expect(doc.info).toEqual(info)
  })

  test('document 缓存 — 多次调用返回同一对象引用，invalidate 后会重建', () => {
    const h = createAsyncApiHandlers(makeApp(), { info })
    const doc1 = h.document()
    expect(h.document()).toBe(doc1)

    h.invalidate()
    const doc2 = h.document()
    expect(doc2).not.toBe(doc1)
    // 内容应该等价（routes 没变）
    expect(doc2).toEqual(doc1)
  })

  test('html 中包含 jsonUrl 与 title 转义', () => {
    const app = new MqttApp().use(router().topic('x', { onMessage() {} }))
    const html = renderAsyncApiHtml(
      { info: { title: '<x>&"' } } as any,
      '/asyncapi.json',
    )
    expect(html).toContain('/asyncapi.json')
    expect(html).toContain('&lt;x&gt;&amp;&quot;')
  })

  test('normalizePrefix 边界', () => {
    expect(normalizePrefix('')).toBe('')
    expect(normalizePrefix('/api')).toBe('/api')
    expect(normalizePrefix('api')).toBe('/api')
    expect(normalizePrefix('/api/')).toBe('/api')
    expect(normalizePrefix('/api///')).toBe('/api')
  })
})
