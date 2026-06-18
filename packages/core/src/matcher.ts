export type TopicParams = Record<string, string>

export type CompiledTopicPattern = {
  pattern: string
  match(topic: string): TopicParams | null
}

type Segment =
  | { type: 'literal'; value: string }
  | { type: 'param'; name: string }
  | { type: 'single' }
  | { type: 'multi' }

export function compileTopicPattern(pattern: string): CompiledTopicPattern {
  const normalized = normalizeTopic(pattern)
  const segments = normalized === '' ? [] : normalized.split('/').map(compileSegment)
  const multiIndex = segments.findIndex((segment) => segment.type === 'multi')

  if (multiIndex !== -1 && multiIndex !== segments.length - 1) {
    throw new Error(`MQTT multi-level wildcard must be the last segment: ${pattern}`)
  }

  return {
    pattern: normalized,
    match(topic) {
      return matchSegments(segments, splitTopic(topic))
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
  if (segment === '+') return { type: 'single' }
  if (segment === '#') return { type: 'multi' }
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
    const part = topic[index]

    if (segment.type === 'multi') return params
    if (part === undefined) return null

    if (segment.type === 'literal' && segment.value !== part) return null
    if (segment.type === 'param') params[segment.name] = part
  }

  return pattern.length === topic.length ? params : null
}
