/**
 * Image-URL helpers for url-import. Lives in `convex/lib/` (not under
 * `convex/urlImportsActions.ts`) because that file uses `'use node'`,
 * which makes it awkward to import from edge-runtime test files.
 *
 * Pure functions: no IO, no side effects. Safe to import from anywhere.
 */

// Many image CDNs serve the same image at multiple sizes via path tokens
// (Shopify "_360x", Shopify named tiers like "_large"), query params
// (?width=N), or path segments (/v1/fill/w_320,h_320/). Rewrite obvious
// thumbnail patterns to a high-resolution variant.
//
// Each transform is host-scoped where applicable so we don't accidentally
// strip something that means "large" on a non-CDN site.
//
// Examples:
//   cdn.shopify.com/.../foo_large.jpg   →  cdn.shopify.com/.../foo.jpg
//   cdn.shopify.com/.../foo_360x.jpg    →  cdn.shopify.com/.../foo.jpg
//   cdn.shopify.com/.../foo.jpg?width=600 → cdn.shopify.com/.../foo.jpg
//   static.wixstatic.com/media/abc~mv2.jpg/v1/fill/w_320,h_320/abc~mv2.jpg
//                                         → static.wixstatic.com/media/abc~mv2.jpg
//   res.cloudinary.com/.../w_120,h_120,c_fill/.../foo.jpg → .../foo.jpg
export function upgradeToHighResImageUrl(rawUrl: string): string {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return rawUrl
  }

  // ── Cloudinary fetch mode (host-agnostic) ──────────────────────────────
  // URL shape: <host>/image/fetch/<transforms>/<embedded-source-url>
  // Cloudinary is frequently fronted on custom CNAMEs (assets.bombas.com,
  // images.brand.com, etc.) so this can't be host-scoped. The embedded
  // URL is the canonical source — extract it and recurse so the embedded
  // CDN gets its own upgrade pass.
  //
  // Example:
  //   https://assets.bombas.com/image/fetch/c_crop,w_50/https://images.ctfassets.net/abc/foo.png
  //                                       → https://images.ctfassets.net/abc/foo.png
  const fetchIdx = parsed.pathname.indexOf('/image/fetch/')
  if (fetchIdx !== -1) {
    const after = parsed.pathname.slice(fetchIdx + '/image/fetch/'.length)
    const embeddedMatch = after.match(/(https?:\/\/.+)$/i)
    if (embeddedMatch && embeddedMatch[1]) {
      try {
        // Carry the original querystring onto the embedded URL only if it
        // wasn't a Cloudinary transform param (which we want to drop).
        const embedded = new URL(embeddedMatch[1])
        return upgradeToHighResImageUrl(embedded.toString())
      } catch {
        // Embedded URL malformed — fall through to other transforms
      }
    }
  }

  const host = parsed.hostname.toLowerCase()

  // ── Shopify ─────────────────────────────────────────────────────────────
  if (host === 'cdn.shopify.com' || host.endsWith('.cdn.shopify.com')) {
    // Dimensional tokens: foo_360x.jpg, foo_100x100.jpg, foo_x500.jpg
    parsed.pathname = parsed.pathname.replace(
      /(_\d+x\d*|_x\d+)(?=\.[a-z]{2,5}$)/i,
      '',
    )
    // Named tiers: foo_pico.jpg, foo_large.jpg, etc. Smaller-than-master
    // sizes are stripped so the CDN serves the original. _master is
    // intentionally NOT stripped — empirically 404s on some Shopify
    // configurations, so leaving it lets the upload proceed.
    parsed.pathname = parsed.pathname.replace(
      /_(pico|thumb|small|compact|medium|large|grande)(?=\.[a-z]{2,5}$)/i,
      '',
    )
  }

  // ── Wixstatic ──────────────────────────────────────────────────────────
  // Path shape: /media/<id>~mv2.jpg/v1/fill/w_320,h_320,al_c,q_85/<id>~mv2.jpg
  // Strip the entire /v1/fill/.../<file> segment, falling back to the
  // canonical /media/<id>~mv2.jpg.
  if (host === 'static.wixstatic.com' || host.endsWith('.wixstatic.com')) {
    parsed.pathname = parsed.pathname.replace(
      /\/v1\/(?:fill|crop|fit)\/[^/]+\/[^/]+$/i,
      '',
    )
  }

  // ── Cloudinary ─────────────────────────────────────────────────────────
  // Resize transform segments like /w_120,h_120,c_fill/ between path parts.
  // Host-scoped — these tokens are common enough (esp. w_/h_) that an
  // unscoped regex matches false positives in unrelated URL paths.
  if (host === 'res.cloudinary.com' || host.endsWith('.cloudinary.com')) {
    parsed.pathname = parsed.pathname.replace(
      /\/(w_\d+|h_\d+|c_(?:fill|fit|scale)|q_auto|f_auto)(?:,(?:w_\d+|h_\d+|c_(?:fill|fit|scale)|q_auto|f_auto))*\//gi,
      '/',
    )
  }

  // ── Generic resize query params ────────────────────────────────────────
  // Strip width/height query params unconditionally. The CDN's default
  // response without these is the original (or a high-quality default).
  for (const p of ['width', 'w', 'height', 'h']) {
    parsed.searchParams.delete(p)
  }

  return parsed.toString()
}
