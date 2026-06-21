/**
 * Shared SSRF guard. Rejects URLs whose host is a loopback, link-local, or
 * RFC-1918 private address so user-supplied URLs can't make the Convex backend
 * fetch internal network resources (cloud metadata at 169.254.169.254, admin
 * panels on 192.168.x, etc).
 *
 * Scope note: this is a hostname / literal-IP check, not full DNS-rebinding
 * protection — a hostname that resolves to a private IP at fetch time would
 * still pass. It matches the level of the existing Design Lab guard and raises
 * the bar against the obvious attacks. Lives in a plain (non-'use node') module
 * so both the V8 (mutations) and Node (actions) runtimes can import it.
 */

const BLOCKED_IPV4_PREFIXES = [
  '169.254.', // link-local + cloud metadata (169.254.169.254)
  '10.', // RFC-1918
  '192.168.', // RFC-1918
  '127.', // loopback
  '0.', // "this" network
  // 172.16.0.0 – 172.31.255.255 (RFC-1918)
  ...Array.from({ length: 16 }, (_, i) => `172.${16 + i}.`),
]

const BLOCKED_HOSTS = new Set([
  'localhost',
  '0.0.0.0',
  '::1',
  '[::1]',
])

/** True if the hostname is a private / loopback / link-local address. */
export function isBlockedHost(hostname: string): boolean {
  let h = hostname.toLowerCase().trim()
  if (!h) return true

  // Normalize alternative IPv4 encodings (decimal 2130706433, hex 0x7f000001,
  // octal 0177.0.0.1) via the WHATWG URL parser, which canonicalizes them to
  // dotted-decimal. This makes the check robust even if a caller passes a raw,
  // un-parsed host string. Unparseable hosts are treated as blocked.
  try {
    const normalized = new URL(`http://${h}`).hostname
    if (normalized) h = normalized.toLowerCase()
  } catch {
    return true
  }

  // Strip IPv6 brackets and any trailing DNS-root dot ("localhost." → "localhost").
  let bare = h.startsWith('[') && h.endsWith(']') ? h.slice(1, -1) : h
  if (bare.endsWith('.')) bare = bare.slice(0, -1)
  if (!bare) return true

  if (BLOCKED_HOSTS.has(bare)) return true
  if (BLOCKED_IPV4_PREFIXES.some((p) => bare.startsWith(p))) return true

  // IPv6 unique-local (fc00::/7 → fc/fd) and link-local (fe80::/10 → fe8-feb).
  if (/^f[cd]/.test(bare)) return true
  if (/^fe[89ab]/.test(bare)) return true

  // IPv4-mapped/compatible IPv6 (e.g. ::ffff:127.0.0.1 or its compressed hex
  // form ::ffff:7f00:1): extract the embedded IPv4 and re-check it.
  const mapped = bare.match(/::(?:ffff:)?([0-9a-f.:]+)$/i)
  if (mapped && bare.includes(':')) {
    const tail = mapped[1]
    if (tail.includes('.')) {
      if (isBlockedHost(tail)) return true
    } else {
      const parts = tail.split(':')
      if (parts.length === 2) {
        const hi = parseInt(parts[0], 16)
        const lo = parseInt(parts[1], 16)
        if (Number.isFinite(hi) && Number.isFinite(lo)) {
          const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`
          if (isBlockedHost(ipv4)) return true
        }
      }
    }
  }
  return false
}

/**
 * Parses and validates a URL, throwing if the protocol is disallowed or the
 * host is private/internal. Returns the parsed URL on success.
 * Defaults to HTTPS-only; pass `allowHttp` to also permit plain HTTP.
 */
export function assertPublicUrl(url: string, opts?: { allowHttp?: boolean }): URL {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`Invalid URL: ${url}`)
  }
  const allowed = opts?.allowHttp ? ['http:', 'https:'] : ['https:']
  if (!allowed.includes(parsed.protocol)) {
    throw new Error(
      opts?.allowHttp ? 'Only http(s) URLs are supported' : 'Only HTTPS URLs are allowed',
    )
  }
  if (isBlockedHost(parsed.hostname)) {
    throw new Error('Private or internal URLs are not allowed')
  }
  return parsed
}
