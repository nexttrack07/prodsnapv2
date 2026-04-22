/**
 * Syncs the authenticated user's plan from Clerk into the Convex `userPlans`
 * table. This is the bridge that makes server-side billing enforcement work:
 * mutations read from `userPlans`; this action populates it.
 *
 * Call patterns:
 *   1. Client calls `syncUserPlan` on app mount (after sign-in confirms).
 *   2. Client calls `syncUserPlan` right after checkout completes
 *      (via the post-checkout interstitial polling flow).
 *   3. Future v2: Clerk webhook invokes an HTTP action that writes the same
 *      row on subscription lifecycle events for real-time accuracy.
 *
 * Plan resolution: we call Clerk's Backend API
 * `clerk.billing.getUserBillingSubscription(clerkUserId)` and look for an
 * active subscription item. The plan slug comes from
 * `subscriptionItem.plan.slug`. No publicMetadata / webhook required — this
 * is the canonical Clerk Billing Backend API.
 */
import { v } from 'convex/values'
import { createClerkClient } from '@clerk/backend'
import { action, internalMutation, query } from '../_generated/server'
import { internal } from '../_generated/api'
import { isKnownPlan } from '../lib/billing/planConfig'

/**
 * Public Convex action — called from the client.
 * Fetches the user's active billing subscription from Clerk and writes the
 * resolved plan slug to `userPlans`.
 */
export const syncUserPlan = action({
  args: {},
  returns: v.object({
    plan: v.string(),
    synced: v.boolean(),
  }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')

    const secretKey = process.env.CLERK_SECRET_KEY
    if (!secretKey) {
      console.error(
        '[billing/syncPlan] CLERK_SECRET_KEY not set in Convex env. ' +
          'Set it in the Convex dashboard → Settings → Environment Variables.',
      )
      throw new Error('Server billing misconfiguration — contact support')
    }

    const clerkUserId = identity.subject
    const clerk = createClerkClient({ secretKey })

    let plan = ''
    try {
      // Canonical Clerk Billing Backend API call. Returns the full subscription
      // with all items; we pick the active (or past_due) item and read its
      // plan.slug. "Active" subscription items are the source of truth for
      // what the user is currently paying for.
      const subscription = await clerk.billing.getUserBillingSubscription(
        clerkUserId,
      )

      // Find the item that's currently billed. Clerk's status values
      // for subscription items include 'active', 'past_due', 'canceled',
      // 'upcoming', etc. We consider 'active' and 'past_due' as granting
      // access (past_due is a grace window — user's card just failed).
      const billedItem = subscription.subscriptionItems.find(
        (item) => item.status === 'active' || item.status === 'past_due',
      )

      const raw = billedItem?.plan?.slug ?? ''
      plan = isKnownPlan(raw) ? raw : ''
    } catch (err) {
      // getUserBillingSubscription throws if the user has no subscription
      // at all. That's a valid state for a pre-checkout user — treat it
      // as "no plan" rather than surfacing an error.
      const msg = err instanceof Error ? err.message : String(err)
      if (/not found|no.*subscription/i.test(msg)) {
        plan = ''
      } else {
        console.error('[billing/syncPlan] Clerk call failed:', msg)
        throw new Error('Could not sync plan from Clerk')
      }
    }

    await ctx.runMutation(internal.billing.syncPlan.writePlan, {
      userId: identity.tokenIdentifier,
      clerkUserId,
      plan,
    })

    return { plan, synced: true }
  },
})

/**
 * Internal mutation — upserts a row in `userPlans`.
 * Called only from `syncUserPlan` (and future webhook handlers).
 */
export const writePlan = internalMutation({
  args: {
    userId: v.string(),
    clerkUserId: v.string(),
    plan: v.string(),
  },
  handler: async (ctx, { userId, clerkUserId, plan }) => {
    const existing = await ctx.db
      .query('userPlans')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique()

    const now = Date.now()
    if (existing) {
      await ctx.db.patch(existing._id, {
        plan,
        clerkUserId,
        syncedAt: now,
      })
    } else {
      await ctx.db.insert('userPlans', {
        userId,
        clerkUserId,
        plan,
        syncedAt: now,
      })
    }
  },
})

/**
 * Query: returns the currently-authenticated user's synced plan row, or null
 * if they haven't been synced yet. Used by the client for read-only display
 * (the enforcement path uses the BillingProvider, which reads the same
 * underlying table).
 */
export const getMyPlan = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null
    const row = await ctx.db
      .query('userPlans')
      .withIndex('by_userId', (q) => q.eq('userId', identity.tokenIdentifier))
      .unique()
    return row
  },
})
