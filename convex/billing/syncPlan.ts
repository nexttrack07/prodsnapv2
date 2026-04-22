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
 * The plan slug is read from `user.publicMetadata.plan_slug` on the Clerk
 * user. In production, that metadata is set either manually (for admin
 * comp subscriptions) or via a Clerk webhook on subscription.active events.
 * For development, set it manually in the Clerk dashboard per the step-0
 * spike checklist.
 */
import { v } from 'convex/values'
import { createClerkClient } from '@clerk/backend'
import { action, internalMutation, query } from '../_generated/server'
import { internal } from '../_generated/api'
import { isKnownPlan } from '../lib/billing/planConfig'

/**
 * Public Convex action — called from the client.
 * Fetches the user's plan slug from Clerk and writes it to `userPlans`.
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

    // Clerk's user ID (the `subject` claim in the JWT) is what
    // clerk.users.getUser expects. `tokenIdentifier` is issuer-prefixed.
    const clerkUserId = identity.subject
    const clerk = createClerkClient({ secretKey })

    let plan = ''
    try {
      const user = await clerk.users.getUser(clerkUserId)
      const meta = (user.publicMetadata ?? {}) as { plan_slug?: unknown }
      const raw = typeof meta.plan_slug === 'string' ? meta.plan_slug : ''
      // Only accept slugs we know about; anything else is treated as "no plan".
      plan = isKnownPlan(raw) ? raw : ''
    } catch (err) {
      console.error(
        '[billing/syncPlan] Failed to fetch user from Clerk:',
        err instanceof Error ? err.message : err,
      )
      throw new Error('Could not sync plan from Clerk')
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
