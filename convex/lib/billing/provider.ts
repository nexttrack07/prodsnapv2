/**
 * Pluggable billing provider interface.
 *
 * Current implementation: ClerkBillingProvider (provider.clerk.ts).
 * Swapping providers (e.g., Clerk → Stripe direct) = implement a new
 * BillingProvider and change the export in `index.ts`. Mutation code
 * never imports a concrete provider — only this interface.
 */
import type { QueryCtx, MutationCtx } from '../../_generated/server'

/**
 * Normalized billing snapshot for the current authenticated user.
 * Undefined plan means "no active subscription" — enforcement helpers
 * treat this as fail-closed (paid features denied).
 */
export type BillingContext = {
  /** Unique user identifier from the auth provider. */
  userId: string
  /** Plan slug (e.g., "basic", "pro"), or empty string if no active subscription. */
  plan: string
  /** Raw capability slugs granted by the JWT. */
  capabilities: string[]
  /** Convenience: does this context grant `slug`? */
  hasCapability: (slug: string) => boolean
  /** True if the plan field resolves to a known PLAN_CONFIG entry. */
  hasKnownPlan: boolean
}

export interface BillingProvider {
  /**
   * Resolve the billing context for the current request, or null if
   * unauthenticated. Implementations read from `ctx.auth.getUserIdentity()`.
   */
  getContext(ctx: QueryCtx | MutationCtx): Promise<BillingContext | null>
}
