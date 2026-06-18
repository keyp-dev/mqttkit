#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const flags = new Set(argv.filter((arg) => arg.startsWith('--')))
const positional = argv.filter((arg) => !arg.startsWith('--'))
const dryRun = flags.has('--dry-run')
const skipChecks = flags.has('--skip-checks')

const allPackages = [
  'packages/core',
  'packages/aedes',
  'packages/asyncapi',
]

const selected = resolveSelection(allPackages, positional)

if (selected.length === 0) {
  console.error(`No packages matched: ${positional.join(', ')}`)
  console.error(`Available: ${allPackages.join(', ')}`)
  process.exit(1)
}

console.log(`Publishing: ${selected.join(', ')}${dryRun ? ' (dry-run)' : ''}`)

if (!skipChecks) {
  run('bun', ['install', '--frozen-lockfile'])
  run('bun', ['run', 'test'])
  run('bun', ['run', 'typecheck'])
  run('bun', ['run', 'build'])
}

for (const packagePath of selected) {
  const publishArgs = ['publish', '--access', 'public']
  if (dryRun) publishArgs.push('--dry-run')

  run('npm', publishArgs, { cwd: resolve(root, packagePath) })
}

function resolveSelection(packages, selectors) {
  if (selectors.length === 0) return packages

  const matched = new Set()
  for (const selector of selectors) {
    const hits = packages.filter((path) => matches(path, selector))
    if (hits.length === 0) {
      console.error(`Selector matched no package: ${selector}`)
      process.exit(1)
    }
    for (const hit of hits) matched.add(hit)
  }

  // Preserve original dependency-safe ordering.
  return packages.filter((path) => matched.has(path))
}

function matches(packagePath, selector) {
  if (packagePath === selector) return true
  const baseName = packagePath.replace(/^packages\//, '')
  if (baseName === selector) return true
  const pkgName = readPackageName(packagePath)
  if (pkgName === selector) return true
  if (pkgName && pkgName.replace(/^@mqttkit\//, '') === selector) return true
  return false
}

function readPackageName(packagePath) {
  try {
    const raw = readFileSync(resolve(root, packagePath, 'package.json'), 'utf8')
    return JSON.parse(raw).name
  } catch {
    return undefined
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    stdio: 'inherit',
    shell: false,
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}
