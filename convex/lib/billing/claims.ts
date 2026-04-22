/**
 * Versioned JWT claim extractor — insulated from Clerk beta churn.
 *
 * If Clerk changes the JWT claim format (beta risk), add a new version
 * branch. Callers depend only on the normalized `BillingClaims` shape, so
 * the rest of the system doesn't move.
 */
import type { UserIdentity } from 'convex/server'

export type BillingClaims = {
  /** Plan slug with prefix stripped (e.g., "basic" from "u:basic"). Empty string if no plan. */
  plan: string
  /** Capability slugs with prefixes stripped. */
  capabilities: string[]
}

export type ClaimVersion = 'v1'

/**
 * Extract billing claims from a Convex UserIdentity.
 *
 * v1 (Clerk Billing beta, 2026-04):
 *   pla: "u:plan-slug" (user plan) or "o:plan-slug" (org plan) or undefined
 *   fea: "u:cap,o:cap,..." comma-separated, or undefined
 */
export function extractBillingClaims(
  identity: UserIdentity,
  version: ClaimVersion = 'v1',
): BillingClaims {
  if (version === 'v1') return extractV1(identity)
  throw new Error(`Unknown claim version: ${version}`)
}

function extractV1(identity: UserIdentity): BillingClaims {
  const raw = identity as unknown as { pla?: string; fea?: string }
  const plan = raw.pla ? stripPrefix(raw.pla) : ''
  const capabilities = raw.fea
    ? raw.fea.split(',').map(stripPrefix).filter(Boolean)
    : []
  return { plan, capabilities }
}

/** Strip Clerk's "u:" or "o:" prefix. Noop if no prefix. */
function stripPrefix(s: string): string {
  return s.replace(/^[uo]:/, '')
}
