/**
 * Generates the ProdSnap favicon / app-icon set from a single square SVG mark.
 *
 * Why this exists: the project shipped with the TanStack Start starter icons
 * (a beach/island). The brand asset (prodsnap_logo.png) is a wide wordmark and
 * can't be a legible favicon, so we render a square monogram mark instead.
 *
 * Run:  node scripts/gen-favicons.mjs
 * Deps: @playwright/test (already a dev dependency) + its chromium browser.
 *
 * Outputs into public/: favicon.svg, favicon.ico, favicon.png,
 * favicon-16x16.png, favicon-32x32.png, apple-touch-icon.png,
 * android-chrome-192x192.png, android-chrome-512x512.png
 */
import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

// Brand mark: white "P" on the wordmark's black, matching prodsnap_logo.png.
const BG = '#000000'
const FG = '#ffffff'

// `rx` = corner radius (rounded for browser tabs, 0 = full-bleed for the
// iOS/Android masks, which apply their own rounding).
const markSvg = (rx) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">` +
  `<rect width="100" height="100" rx="${rx}" fill="${BG}"/>` +
  `<text x="51" y="54" font-family="Helvetica, Arial, sans-serif" font-weight="800" ` +
  `font-size="70" fill="${FG}" text-anchor="middle" dominant-baseline="central">P</text>` +
  `</svg>`

const ROUNDED = markSvg(22) // browser favicons + svg
const FULLBLEED = markSvg(0) // apple-touch + android-chrome (masked by OS)

// ── Render one SVG string to a size×size transparent PNG buffer ────────────
async function render(page, svg, size) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<!doctype html><html><body style="margin:0">` +
      svg.replace('width="100" height="100"', `width="${size}" height="${size}"`) +
      `</body></html>`,
  )
  const el = await page.$('svg')
  return await el.screenshot({ omitBackground: true })
}

// ── Minimal ICO encoder: wraps PNG frames in an ICO container (PNG-in-ICO,
//    supported by every browser since Vista) ─────────────────────────────────
function encodeIco(pngs) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(pngs.length, 4) // image count

  const entries = []
  const blobs = []
  let offset = 6 + pngs.length * 16
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16)
    e.writeUInt8(size >= 256 ? 0 : size, 0) // width (0 = 256)
    e.writeUInt8(size >= 256 ? 0 : size, 1) // height
    e.writeUInt8(0, 2) // palette
    e.writeUInt8(0, 3) // reserved
    e.writeUInt16LE(1, 4) // color planes
    e.writeUInt16LE(32, 6) // bits per pixel
    e.writeUInt32LE(data.length, 8) // size of PNG data
    e.writeUInt32LE(offset, 12) // offset of PNG data
    offset += data.length
    entries.push(e)
    blobs.push(data)
  }
  return Buffer.concat([header, ...entries, ...blobs])
}

const browser = await chromium.launch()
const page = await browser.newPage()

const out = (name) => join(PUBLIC, name)

// SVG source of truth
writeFileSync(out('favicon.svg'), ROUNDED)

// Browser favicons (rounded)
const p16 = await render(page, ROUNDED, 16)
const p32 = await render(page, ROUNDED, 32)
const p48 = await render(page, ROUNDED, 48)
writeFileSync(out('favicon-16x16.png'), p16)
writeFileSync(out('favicon-32x32.png'), p32)
writeFileSync(out('favicon.png'), p48)

// App icons (full-bleed; OS masks them)
writeFileSync(out('apple-touch-icon.png'), await render(page, FULLBLEED, 180))
writeFileSync(out('android-chrome-192x192.png'), await render(page, FULLBLEED, 192))
writeFileSync(out('android-chrome-512x512.png'), await render(page, FULLBLEED, 512))

// Multi-size .ico (16/32/48)
writeFileSync(
  out('favicon.ico'),
  encodeIco([
    { size: 16, data: p16 },
    { size: 32, data: p32 },
    { size: 48, data: p48 },
  ]),
)

await browser.close()
console.log('Favicon set written to public/')
