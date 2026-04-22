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
import { isKnownPlan, PLAN_CONFIG } from '../lib/billing/planConfig'
import { countUsageThisMonth } from '../lib/billing'

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
      // plan.slug. Clerk forces underscores in slugs (e.g., "pro",
      // "background_removal") so PLAN_CONFIG / CAPABILITIES must match.
      const subscription = await clerk.billing.getUserBillingSubscription(
        clerkUserId,
      )

      // Find the item that's currently billed. 'past_due' is a grace window
      // where the card retry is in flight — user still has access.
      const billedItem = subscription.subscriptionItems.find(
        (item) => item.status === 'active' || item.status === 'past_due',
      )

      const raw = billedItem?.plan?.slug ?? ''
      plan = isKnownPlan(raw) ? raw : ''
      if (raw && !plan) {
        // Useful signal when Clerk dashboard drifts from PLAN_CONFIG.
        console.warn(
          `[billing/syncPlan] Clerk returned slug "${raw}" which is not in PLAN_CONFIG. ` +
            `User will be treated as having no plan until config is updated.`,
        )
      }
    } catch (err) {
      // getUserBillingSubscription throws if the user has no subscription.
      // That's a valid state for a pre-checkout user — treat as no plan.
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

/**
 * Action: cancel the current user's subscription via Clerk's Backend API.
 * By default, schedules cancellation at period end (user retains access
 * until their next renewal date). Pass `endNow: true` to revoke
 * immediately.
 */
export const cancelMySubscription = action({
  args: { endNow: v.optional(v.boolean()) },
  returns: v.object({ canceledItemIds: v.array(v.string()) }),
  handler: async (ctx, { endNow }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')
    const secretKey = process.env.CLERK_SECRET_KEY
    if (!secretKey) throw new Error('Server billing misconfiguration')
    const clerk = createClerkClient({ secretKey })
    const clerkUserId = identity.subject

    let canceled: string[] = []
    try {
      const subscription = await clerk.billing.getUserBillingSubscription(
        clerkUserId,
      )
      const activeItems = subscription.subscriptionItems.filter(
        (i) => i.status === 'active' || i.status === 'past_due',
      )
      for (const item of activeItems) {
        await clerk.billing.cancelSubscriptionItem(item.id, {
          endNow: endNow ?? false,
        })
        canceled.push(item.id)
      }
    } catch (err) {
      console.error('[billing/cancelMySubscription] Clerk call failed:', err)
      throw new Error('Could not cancel subscription')
    }

    // If end-now was requested, refresh userPlans immediately so the UI
    // reflects the revoked plan. For end-of-period cancellation, the plan
    // stays until the period expires and will sync naturally later.
    if (endNow) {
      await ctx.runMutation(internal.billing.syncPlan.writePlan, {
        userId: identity.tokenIdentifier,
        clerkUserId,
        plan: '',
      })
    }
    return { canceledItemIds: canceled }
  },
})

/**
 * Query: UI-facing snapshot of the current user's billing state.
 * Consumed by studio CreditsIndicator, over-limit banners, and the
 * post-checkout interstitial's polling loop.
 */
export const getBillingStatus = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      return {
        signedIn: false,
        plan: null,
        productCount: 0,
        productLimit: 0,
        creditsUsed: 0,
        creditsTotal: 0,
        resetsOn: null,
      }
    }
    const userId = identity.tokenIdentifier

    const row = await ctx.db
      .query('userPlans')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique()

    const planSlug = row?.plan ?? ''
    const planConfig = planSlug ? PLAN_CONFIG[planSlug] : undefined

    const productLimit = planConfig?.productLimit ?? 0
    const creditsTotal = planConfig?.monthlyCredits ?? 0

    const products = await ctx.db
      .query('products')
      .withIndex('by_userId_archived', (q) =>
        q.eq('userId', userId).eq('archivedAt', undefined),
      )
      .collect()

    const creditsUsed = await countUsageThisMonth(ctx, userId)

    // Next-month anchor = first of following UTC month.
    const now = new Date()
    const nextReset = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)

    return {
      signedIn: true,
      plan: planSlug || null,
      productCount: products.length,
      productLimit: productLimit === Infinity ? null : productLimit,
      creditsUsed,
      creditsTotal,
      resetsOn: nextReset,
    }
  },
})
