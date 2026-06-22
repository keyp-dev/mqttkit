import { describe, expect, test } from 'bun:test'
import { compileTopicPattern, parseSharedSubscription } from './matcher.js'

describe('compileTopicPattern.match (publish/dispatch path)', () => {
  test('literal pattern 必须完全相等', () => {
    const c = compileTopicPattern('devices/online')
    expect(c.match('devices/online')).toEqual({})
    expect(c.match('devices/offline')).toBeNull()
    expect(c.match('devices/online/extra')).toBeNull()
  })

  test(':name 命名参数会提取值', () => {
    const c = compileTopicPattern('devices/:uid/events')
    expect(c.match('devices/abc/events')).toEqual({ uid: 'abc' })
    expect(c.match('devices/abc/other')).toBeNull()
    expect(c.match('devices/abc')).toBeNull()
  })

  test('* catch-all 会把剩余部分收集到 params["*"]', () => {
    const c = compileTopicPattern('files/*')
    expect(c.match('files/a')).toEqual({ '*': 'a' })
    expect(c.match('files/a/b/c')).toEqual({ '*': 'a/b/c' })
    expect(c.match('files')).toEqual({ '*': '' })
    expect(c.match('other/a')).toBeNull()
  })

  test(':name 与 * 可以混用', () => {
    const c = compileTopicPattern('users/:uid/*')
    expect(c.match('users/alice/profile/avatar')).toEqual({ uid: 'alice', '*': 'profile/avatar' })
    expect(c.match('users/alice')).toEqual({ uid: 'alice', '*': '' })
  })

  test('* 出现在非末尾抛错', () => {
    expect(() => compileTopicPattern('a/*/b')).toThrow(/Catch-all wildcard/)
  })

  test('空 :param 名抛错', () => {
    expect(() => compileTopicPattern('a/:')).toThrow(/parameter name cannot be empty/)
  })

  test('MQTT 通配符 + / # 在 pattern 里被当成 literal，不再生效', () => {
    const c = compileTopicPattern('devices/+/events')
    // '+' 不再是单层通配符，只能字面匹配
    expect(c.match('devices/abc/events')).toBeNull()
    expect(c.match('devices/+/events')).toEqual({})
  })
})

describe('compileTopicPattern.matchSubscription (subscribe path)', () => {
  test('精确订阅与 publish-path 行为一致', () => {
    const c = compileTopicPattern('devices/:uid/events')
    expect(c.matchSubscription('devices/abc/events')).toEqual({ uid: 'abc' })
    expect(c.matchSubscription('devices/abc/other')).toBeNull()
  })

  test('订阅中的 + 匹配单层但不绑定 param', () => {
    const c = compileTopicPattern('devices/:uid/events')
    expect(c.matchSubscription('devices/+/events')).toEqual({})
    expect(c.matchSubscription('devices/+/other')).toBeNull()
  })

  test('订阅中的 # 吃掉剩余所有段', () => {
    const c = compileTopicPattern('devices/:uid/events')
    expect(c.matchSubscription('devices/#')).toEqual({})
    expect(c.matchSubscription('#')).toEqual({})
  })

  test('订阅与 catch-all pattern 互相兼容', () => {
    const c = compileTopicPattern('files/*')
    expect(c.matchSubscription('files/#')).toEqual({ '*': '' })
    expect(c.matchSubscription('files/+/a')).toEqual({ '*': '+/a' })
    expect(c.matchSubscription('files/a/b')).toEqual({ '*': 'a/b' })
  })

  test('+ 能匹配命名参数所在的段但不会泄露值给 param', () => {
    const c = compileTopicPattern('users/:uid/notifications')
    const params = c.matchSubscription('users/+/notifications')
    expect(params).toEqual({})
    expect(params).not.toHaveProperty('uid')
  })
})

describe('parseSharedSubscription (MQTT 5 $share/<group>/<filter>)', () => {
  test('普通订阅返回 null', () => {
    expect(parseSharedSubscription('devices/+/events')).toBeNull()
    expect(parseSharedSubscription('$SYS/broker/clients')).toBeNull()
  })

  test('合法 $share/group/filter 拆出 group + filter', () => {
    expect(parseSharedSubscription('$share/billing/orders/+/created')).toEqual({
      group: 'billing',
      topic: 'orders/+/created',
    })
    expect(parseSharedSubscription('$share/g1/a/#')).toEqual({ group: 'g1', topic: 'a/#' })
  })

  test('group 不能为空、不能含通配符；filter 不能为空', () => {
    expect(parseSharedSubscription('$share//a')).toBeNull()
    expect(parseSharedSubscription('$share/g+/a')).toBeNull()
    expect(parseSharedSubscription('$share/g#/a')).toBeNull()
    expect(parseSharedSubscription('$share/g/')).toBeNull()
    expect(parseSharedSubscription('$share/g')).toBeNull()
  })
})
