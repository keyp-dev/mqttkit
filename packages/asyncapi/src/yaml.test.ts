import { describe, expect, test } from 'bun:test'
import { toYaml } from './yaml.js'

describe('toYaml', () => {
  test('原子类型', () => {
    expect(toYaml('hello')).toBe('hello\n')
    expect(toYaml(42)).toBe('42\n')
    expect(toYaml(true)).toBe('true\n')
    expect(toYaml(null)).toBe('null\n')
  })

  test('歧义字符串走引号', () => {
    // 'true' 是 yaml 关键字，必须引号化
    expect(toYaml('true')).toBe('"true"\n')
    // '123' 看起来像数字，必须引号化
    expect(toYaml('123')).toBe('"123"\n')
    // 普通字符串保持裸字面
    expect(toYaml('hello world')).toBe('hello world\n')
  })

  test('空数组 / 空对象', () => {
    expect(toYaml([])).toBe('[]\n')
    expect(toYaml({})).toBe('{}\n')
  })

  test('对象嵌套缩进', () => {
    const yaml = toYaml({ info: { title: 't', version: '1.0' } })
    expect(yaml).toContain('info:')
    expect(yaml).toContain('  title: t')
    expect(yaml).toContain('  version: "1.0"')
  })

  test('数组项缩进 + 嵌套', () => {
    const yaml = toYaml({ list: [1, 2, { ok: true }] })
    expect(yaml).toContain('list:')
    expect(yaml).toContain('- 1')
    expect(yaml).toContain('- 2')
    expect(yaml).toContain('ok: true')
  })

  test('undefined 字段被剔除', () => {
    const yaml = toYaml({ keep: 1, drop: undefined })
    expect(yaml).toContain('keep: 1')
    expect(yaml).not.toContain('drop')
  })
})
