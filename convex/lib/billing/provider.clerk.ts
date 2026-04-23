/**
 * Clerk-backed implementation of BillingProvider.
 *
 * The provider reads the user's plan from the Convex `userPlans` table,
 * which is populated by the `billing/syncPlan:syncUserPlan` action. The
 * JWT itself only identifies the user — billing state is NOT carried
 * in JWT claims (Clerk's custom JWT templates don't expose billing
 * reserved claims; see ADR in the plan doc for the full rationale).
 *
 * This is the ONLY file allowed to import @clerk/backend. All Clerk SDK
 * access elsewhere must go through getClerkClient() exported below.
 * A CI fence (scripts/check-billing-fence.sh) enforces this invariant.
 */
import { createClerkClient } from '@clerk/backend'
import type { QueryCtx, MutationCtx } from '../../_generated/server'
import { PLAN_CONFIG } from './planConfig'
import type { BillingContext, BillingProvider } from './provider'

export { createClerkClient }

/**
 * Returns a Clerk client instance using the CLERK_SECRET_KEY env var.
 * Throws if the key is not set. Use this instead of importing
 * createClerkClient from @clerk/backend directly.
 */
export function getClerkClient(secretKey?: string): ReturnType<typeof createClerkClient> {
  const key = secretKey ?? process.env.CLERK_SECRET_KEY
  if (!key) {
    throw new Error(
      'CLERK_SECRET_KEY not set. Configure it in Convex dashboard → Settings → Environment Variables.',
    )
  }
  return createClerkClient({ secretKey: key })
}

export class ClerkBillingProvider implements BillingProvider {
  async getContext(ctx: QueryCtx | MutationCtx): Promise<BillingContext | null> {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null

    // Look up the user's synced plan row.
    const row = await ctx.db
      .query('userPlans')
      .withIndex('by_userId', (q) => q.eq('userId', identity.tokenIdentifier))
      .unique()

    const plan = row?.plan ?? ''
    const planConfig = plan ? PLAN_CONFIG[plan] : undefined
    const capabilities = planConfig ? [...planConfig.capabilities] : []
    const capSet = new Set<string>(capabilities)

    return {
      userId: identity.tokenIdentifier,
      plan,
      capabilities,
      hasCapability: (slug: string) => capSet.has(slug),
      hasKnownPlan: Boolean(planConfig),
      syncedAt: row?.syncedAt,
    }
  }
}
