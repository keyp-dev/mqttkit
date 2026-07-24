#!/usr/bin/env node
/**
 * Render cover.html / cover-minimal.html to 1000×420 PNG using puppeteer.
 *
 * Usage:
 *   bun install -D puppeteer    # or: npm i -D puppeteer
 *   bun blog/cover/render.mjs   # produces cover.png + cover-minimal.png
 */
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import puppeteer from 'puppeteer'

const here = dirname(fileURLToPath(import.meta.url))
const targets = [
  { html: 'cover.html', out: 'cover.png' },
  { html: 'cover-minimal.html', out: 'cover-minimal.png' },
]

const browser = await puppeteer.launch({
  defaultViewport: { width: 1000, height: 420, deviceScaleFactor: 2 },
})

for (const { html, out } of targets) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1000, height: 420, deviceScaleFactor: 2 })
  await page.goto('file://' + resolve(here, html), { waitUntil: 'networkidle0' })
  // give web fonts a moment to settle
  await new Promise((r) => setTimeout(r, 300))
  const el = await page.$('.cover')
  await el.screenshot({ path: resolve(here, out), omitBackground: false })
  console.log('wrote', out)
  await page.close()
}

await browser.close()
