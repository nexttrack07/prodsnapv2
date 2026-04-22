/**
 * Clerk-backed implementation of BillingProvider.
 *
 * This is the ONLY file in the billing layer that knows about Clerk.
 * Swapping to a different billing provider (Stripe direct, Paddle, etc.)
 * means replacing this file's contents or creating a sibling
 * `provider.stripe.ts` and updating `index.ts` to use it.
 */
import type { QueryCtx, MutationCtx } from '../../_generated/server'
import { extractBillingClaims } from './claims'
import { isKnownPlan } from './planConfig'
import type { BillingContext, BillingProvider } from './provider'

export class ClerkBillingProvider implements BillingProvider {
  async getContext(ctx: QueryCtx | MutationCtx): Promise<BillingContext | null> {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null

    const { plan, capabilities } = extractBillingClaims(identity)
    const capSet = new Set(capabilities)

    return {
      userId: identity.tokenIdentifier,
      plan,
      capabilities,
      hasCapability: (slug: string) => capSet.has(slug),
      hasKnownPlan: Boolean(plan) && isKnownPlan(plan),
    }
  }
}
