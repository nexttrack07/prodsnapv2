/**
 * Public Convex query: reactive read of the current user's credit balance.
 *
 * Used by:
 *   - <CreditsPill> (always-visible header badge)
 *   - <OutOfCreditsModal> (shown on CREDITS_EXHAUSTED)
 *
 * Returns null if the user is signed out OR no creditBalances row exists yet
 * (graceful pre-grant state — user just signed up, webhook hasn't run).
 */
import { query } from './_generated/server'
import { getCreditBalance } from './lib/billing/credits'

export const getBalance = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null
    // tokenIdentifier matches what ClerkBillingProvider and all other billing
    // helpers use as userId (see provider.clerk.ts line 62, brandKits.ts requireAuth).
    const userId = identity.tokenIdentifier
    return await getCreditBalance(ctx, userId)
  },
})
