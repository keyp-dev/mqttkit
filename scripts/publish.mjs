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
const force = flags.has('--force')
const checkOnly = flags.has('--check')

// Order is dependency-safe: core ships before anything that imports it.
const allPackages = [
  'packages/core',
  'packages/aedes',
  'packages/asyncapi',
  'packages/typebox',
  'packages/zod',
]

const requested = resolveSelection(allPackages, positional)

if (requested.length === 0) {
  console.error(`No packages matched: ${positional.join(', ')}`)
  console.error(`Available: ${allPackages.join(', ')}`)
  process.exit(1)
}

// Decide which of the requested packages actually need publishing by
// comparing local package.json version against the latest published
// version on the npm registry. `--force` bypasses this filter.
const report = requested.map((path) => inspectPackage(path))
printReport(report)

const blocked = report.filter((entry) => entry.status === 'behind')
if (blocked.length > 0) {
  console.error('\nLocal version is older than npm. Refusing to publish:')
  for (const entry of blocked) {
    console.error(`  ${entry.name}: local ${entry.localVersion} < npm ${entry.npmVersion}`)
  }
  process.exit(1)
}

if (checkOnly) {
  const ahead = report.filter((entry) => entry.status === 'ahead' || entry.status === 'new')
  if (ahead.length === 0) {
    console.log('\nNo packages need publishing.')
  } else {
    console.log(`\n${ahead.length} package(s) need publishing.`)
  }
  process.exit(0)
}

const selected = force
  ? report.map((entry) => entry.path)
  : report.filter((entry) => entry.status === 'ahead' || entry.status === 'new').map((entry) => entry.path)

if (selected.length === 0) {
  console.log('\nNothing to publish — every selected package matches the npm registry.')
  console.log('Use --force to publish anyway.')
  process.exit(0)
}

console.log(`\nPublishing: ${selected.join(', ')}${dryRun ? ' (dry-run)' : ''}`)

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

function inspectPackage(packagePath) {
  const name = readPackageName(packagePath)
  const localVersion = readPackageVersion(packagePath)
  if (!name || !localVersion) {
    return { path: packagePath, name: name ?? packagePath, localVersion: '?', npmVersion: '?', status: 'unknown' }
  }
  const npmVersion = readNpmVersion(name)
  if (npmVersion === null) {
    return { path: packagePath, name, localVersion, npmVersion: null, status: 'new' }
  }
  const cmp = compareSemver(localVersion, npmVersion)
  const status = cmp > 0 ? 'ahead' : cmp === 0 ? 'in-sync' : 'behind'
  return { path: packagePath, name, localVersion, npmVersion, status }
}

function printReport(entries) {
  const symbols = {
    new: '+',
    ahead: '↑',
    'in-sync': '=',
    behind: '↓',
    unknown: '?',
  }
  const headline = force
    ? 'Forcing publish; ignoring version check.'
    : 'Resolved publish plan:'
  console.log(headline)
  for (const entry of entries) {
    const symbol = symbols[entry.status] ?? '?'
    const remote = entry.npmVersion === null ? 'not on npm' : entry.npmVersion
    console.log(`  [${symbol}] ${entry.name.padEnd(20)} local=${entry.localVersion}  npm=${remote}  → ${entry.status}`)
  }
}

function readNpmVersion(packageName) {
  const result = spawnSync('npm', ['view', packageName, 'version'], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
  })
  if (result.status === 0) {
    return result.stdout.trim() || null
  }
  // npm exits non-zero for any error; treat a 404 as "package not published yet"
  // and anything else (network, auth) as fatal.
  if (/E404|404 Not Found/.test(result.stderr ?? '')) {
    return null
  }
  console.error(`Failed to query npm for ${packageName}:`)
  console.error(result.stderr || result.stdout || `exit ${result.status}`)
  process.exit(1)
}

function compareSemver(a, b) {
  const parse = (v) => {
    const [core, prerelease] = v.split('-', 2)
    const nums = core.split('.').map((n) => Number.parseInt(n, 10))
    return { nums, prerelease: prerelease ?? '' }
  }
  const pa = parse(a)
  const pb = parse(b)
  for (let i = 0; i < 3; i += 1) {
    const ai = pa.nums[i] ?? 0
    const bi = pb.nums[i] ?? 0
    if (ai !== bi) return ai > bi ? 1 : -1
  }
  // No prerelease wins over a prerelease (semver: 1.0.0 > 1.0.0-rc.1).
  if (pa.prerelease === pb.prerelease) return 0
  if (pa.prerelease === '') return 1
  if (pb.prerelease === '') return -1
  return pa.prerelease > pb.prerelease ? 1 : -1
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

function readPackageJson(packagePath) {
  try {
    const raw = readFileSync(resolve(root, packagePath, 'package.json'), 'utf8')
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

function readPackageName(packagePath) {
  return readPackageJson(packagePath)?.name
}

function readPackageVersion(packagePath) {
  return readPackageJson(packagePath)?.version
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
