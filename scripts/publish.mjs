#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const skipChecks = args.has('--skip-checks')

const packages = [
  'packages/core',
  'packages/aedes',
]

if (!skipChecks) {
  run('bun', ['install', '--frozen-lockfile'])
  run('bun', ['run', 'test'])
  run('bun', ['run', 'typecheck'])
  run('bun', ['run', 'build'])
}

for (const packagePath of packages) {
  const publishArgs = ['publish', '--access', 'public']
  if (dryRun) publishArgs.push('--dry-run')

  run('npm', publishArgs, { cwd: resolve(root, packagePath) })
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
