export type TopicParams = Record<string, string>

export type CompiledTopicPattern = {
  pattern: string
  /** Match a concrete topic against the pattern (used at publish/dispatch time). */
  match(topic: string): TopicParams | null
  /**
   * Match a subscription topic against the pattern. Client-side MQTT wildcards
   * (`+` single-level, `#` multi-level) are treated as "wildcard matches anything",
   * so a subscription like `devices/+/events` lights up `devices/:uid/events`.
   * Wildcards never populate named parameters — those keys are simply omitted.
   */
  matchSubscription(topic: string): TopicParams | null
}

type Segment =
  | { type: 'literal'; value: string }
  | { type: 'param'; name: string }
  | { type: 'wildcard' }

const CATCHALL_KEY = '*'

export function compileTopicPattern(pattern: string): CompiledTopicPattern {
  const normalized = normalizeTopic(pattern)
  const segments = normalized === '' ? [] : normalized.split('/').map(compileSegment)
  const wildcardIndex = segments.findIndex((segment) => segment.type === 'wildcard')

  if (wildcardIndex !== -1 && wildcardIndex !== segments.length - 1) {
    throw new Error(`Catch-all wildcard "*" must be the last segment: ${pattern}`)
  }

  return {
    pattern: normalized,
    match(topic) {
      return matchSegments(segments, splitTopic(topic))
    },
    matchSubscription(topic) {
      return matchSubscriptionSegments(segments, splitTopic(topic))
    },
  }
}

export function normalizeTopic(topic: string): string {
  return topic
    .trim()
    .split('/')
    .filter(Boolean)
    .join('/')
}

export function joinTopic(prefix: string | undefined, topic: string): string {
  return normalizeTopic([prefix, topic].filter(Boolean).join('/'))
}

function compileSegment(segment: string): Segment {
  if (segment === '*') return { type: 'wildcard' }
  if (segment.startsWith(':')) {
    const name = segment.slice(1)
    if (!name) throw new Error('Topic parameter name cannot be empty')
    return { type: 'param', name }
  }

  return { type: 'literal', value: segment }
}

function splitTopic(topic: string): string[] {
  const normalized = topic.trim().replace(/^\/+|\/+$/g, '')
  return normalized === '' ? [] : normalized.split('/')
}

function matchSegments(pattern: Segment[], topic: string[]): TopicParams | null {
  const params: TopicParams = {}

  for (let index = 0; index < pattern.length; index += 1) {
    const segment = pattern[index]

    if (segment.type === 'wildcard') {
      params[CATCHALL_KEY] = topic.slice(index).join('/')
      return params
    }

    const part = topic[index]
    if (part === undefined) return null

    if (segment.type === 'literal' && segment.value !== part) return null
    if (segment.type === 'param') params[segment.name] = part
  }

  return pattern.length === topic.length ? params : null
}

function matchSubscriptionSegments(pattern: Segment[], topic: string[]): TopicParams | null {
  const params: TopicParams = {}

  for (let index = 0; index < pattern.length; index += 1) {
    const segment = pattern[index]
    const part = topic[index]

    // Multi-level wildcard in the subscription consumes everything remaining,
    // regardless of how many pattern segments are left.
    if (part === '#') {
      if (segment.type === 'wildcard') params[CATCHALL_KEY] = ''
      return params
    }

    if (segment.type === 'wildcard') {
      // Pattern catch-all matches whatever the subscription provides.
      params[CATCHALL_KEY] = topic.slice(index).join('/')
      return params
    }

    if (part === undefined) return null

    if (part === '+') {
      // Wildcard segment matches any single pattern segment, but doesn't bind
      // a concrete value to named params.
      continue
    }

    if (segment.type === 'literal' && segment.value !== part) return null
    if (segment.type === 'param') params[segment.name] = part
  }

  return pattern.length === topic.length ? params : null
}
