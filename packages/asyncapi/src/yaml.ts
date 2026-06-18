export function toYaml(value: unknown): string {
  return emit(value, 0).trimStart() + '\n'
}

function emit(value: unknown, indent: number): string {
  if (value === null || value === undefined) return ' null'
  if (typeof value === 'string') return ` ${formatString(value)}`
  if (typeof value === 'number' || typeof value === 'boolean') return ` ${String(value)}`

  if (Array.isArray(value)) {
    if (value.length === 0) return ' []'
    return value
      .map((item) => `\n${pad(indent)}-${emit(item, indent + 1)}`)
      .join('')
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined)
    if (entries.length === 0) return ' {}'
    return entries
      .map(([key, val]) => {
        const k = formatKey(key)
        if (val !== null && typeof val === 'object' && !isEmpty(val)) {
          return `\n${pad(indent)}${k}:${emit(val, indent + 1)}`
        }
        return `\n${pad(indent)}${k}:${emit(val, indent + 1)}`
      })
      .join('')
  }

  return ` ${JSON.stringify(value)}`
}

function pad(indent: number): string {
  return '  '.repeat(indent)
}

function formatKey(key: string): string {
  return /^[A-Za-z_][\w.\-{}]*$/.test(key) ? key : JSON.stringify(key)
}

function formatString(value: string): string {
  const safe = /^[A-Za-z0-9_\-{}/. ]+$/.test(value) && !/^(true|false|null|~|yes|no|on|off)$/i.test(value) && !/^-?\d/.test(value)
  return safe ? value : JSON.stringify(value)
}

function isEmpty(value: object): boolean {
  if (Array.isArray(value)) return value.length === 0
  return Object.keys(value).length === 0
}
