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
 *
 * Resilience:
 *   - Clerk API throws (network/5xx): preserve existing cached plan,
 *     set billingStatus signal, write 'clerk-api-error' event.
 *   - Unknown plan slug returned: preserve cache, write 'unknown-plan-slug' event.
 *   - Malformed response (subscriptionItems missing/not array): preserve cache,
 *     write 'malformed-clerk-response' event.
 *   - Empty subscriptionItems: legitimately no subscription → plan = ''.
 */
import { v } from 'convex/values'
import { getClerkClient } from '../lib/billing/provider.clerk'
import { action, internalAction, internalMutation, internalQuery, query } from '../_generated/server'
import type { ActionCtx } from '../_generated/server'
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

    const clerkUserId = identity.subject
    const clerk = getClerkClient()

    // Read the existing cached plan row first — needed for cache-on-failure.
    const existingRow = (await ctx.runQuery(
      internal.billing.syncPlan.getMyPlanByUserId,
      { userId: identity.tokenIdentifier },
    )) as { plan: string; syncedAt: number } | null

    let plan = ''
    let billingEventContext:
      | 'clerk-api-error'
      | 'unknown-plan-slug'
      | 'malformed-clerk-response'
      | null = null
    let billingEventMetadata:
      | { receivedType: string; preservedPlan: string }
      | { receivedSlug: string; preservedPlan: string }
      | { error: string; preservedPlan: string }
      | undefined = undefined

    try {
      // Canonical Clerk Billing Backend API call. Returns the full subscription
      // with all items; we pick the active (or past_due) item and read its
      // plan.slug. Clerk forces underscores in slugs (e.g., "pro",
      // "background_removal") so PLAN_CONFIG / CAPABILITIES must match.
      const subscription = await clerk.billing.getUserBillingSubscription(
        clerkUserId,
      )

      // P0.4: Response-shape guard — assert subscriptionItems is an array.
      if (!Array.isArray(subscription?.subscriptionItems)) {
        console.error(
          '[billing/syncPlan] Clerk response missing subscriptionItems array. ' +
            `Got: ${JSON.stringify(subscription?.subscriptionItems)}. ` +
            'Preserving cached plan.',
        )
        plan = existingRow?.plan ?? ''
        billingEventContext = 'malformed-clerk-response'
        billingEventMetadata = {
          receivedType: typeof subscription?.subscriptionItems,
          preservedPlan: plan,
        }
      } else if (subscription.subscriptionItems.length === 0) {
        // Legitimately no subscription — user has no active plan.
        plan = ''
      } else {
        // Find the item that's currently billed. 'past_due' is a grace window
        // where the card retry is in flight — user still has access.
        const billedItem = subscription.subscriptionItems.find(
          (item) => item.status === 'active' || item.status === 'past_due',
        )

        const raw = billedItem?.plan?.slug ?? ''

        if (raw && !isKnownPlan(raw)) {
          // P0.4: Unknown slug — preserve cache and log loudly.
          console.error(
            `[billing/syncPlan] Clerk returned unknown plan slug "${raw}". ` +
              'PLAN_CONFIG is out of sync with Clerk dashboard. ' +
              `Preserving existing plan "${existingRow?.plan ?? ''}". ` +
              'Update PLAN_CONFIG to include this slug.',
          )
          plan = existingRow?.plan ?? ''
          billingEventContext = 'unknown-plan-slug'
          billingEventMetadata = {
            receivedSlug: raw,
            preservedPlan: plan,
          }
        } else {
          // Known slug or no active item (non-active/past_due statuses → no plan).
          plan = isKnownPlan(raw) ? raw : ''
        }
      }
    } catch (err) {
      // P0.3: Distinguish thrown error (API unreachable) from legitimate no-subscription.
      const msg = err instanceof Error ? err.message : String(err)
      if (/not found|no.*subscription/i.test(msg)) {
        // Clerk throws a "not found" style error for users with no subscription —
        // this is a valid state for pre-checkout users.
        plan = ''
      } else {
        // Network error, 5xx, timeout — preserve cached plan.
        console.error('[billing/syncPlan] Clerk API call failed:', msg)
        plan = existingRow?.plan ?? ''
        billingEventContext = 'clerk-api-error'
        billingEventMetadata = {
          error: msg,
          preservedPlan: plan,
        }
      }
    }

    await ctx.runMutation(internal.billing.syncPlan.writePlan, {
      userId: identity.tokenIdentifier,
      clerkUserId,
      plan,
      billingEventContext: billingEventContext ?? undefined,
      billingEventMetadata,
    })

    return { plan, synced: true }
  },
})

/**
 * Internal mutation — upserts a row in `userPlans` and optionally writes a
 * billingEvents row for resilience signals (clerk-api-error, unknown-plan-slug,
 * malformed-clerk-response).
 */
export const writePlan = internalMutation({
  args: {
    userId: v.string(),
    clerkUserId: v.string(),
    plan: v.string(),
    billingEventContext: v.optional(
      v.union(
        v.literal('clerk-api-error'),
        v.literal('unknown-plan-slug'),
        v.literal('malformed-clerk-response'),
      ),
    ),
    billingEventMetadata: v.optional(v.union(
      v.object({ receivedType: v.string(), preservedPlan: v.string() }),
      v.object({ receivedSlug: v.string(), preservedPlan: v.string() }),
      v.object({ error: v.string(), preservedPlan: v.string() }),
    )),
  },
  handler: async (ctx, { userId, clerkUserId, plan, billingEventContext, billingEventMetadata }) => {
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

    if (billingEventContext) {
      await ctx.db.insert('billingEvents', {
        userId,
        mutationName: 'billing/syncPlan:syncUserPlan',
        allowed: true,
        claimedPlan: plan || undefined,
        timestamp: now,
        context: billingEventContext,
        metadata: billingEventMetadata,
      })
    }
  },
})

/**
 * Internal query — look up a userPlans row by tokenIdentifier.
 */
export const getMyPlanByUserId = internalQuery({
  args: { userId: v.string() },
  returns: v.union(
    v.object({ plan: v.string(), syncedAt: v.number() }),
    v.null(),
  ),
  handler: async (ctx, { userId }) => {
    const row = await ctx.db
      .query('userPlans')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique()
    if (!row) return null
    return { plan: row.plan, syncedAt: row.syncedAt }
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
    const clerk = getClerkClient()
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

/**
 * Internal action — called by the webhook handler.
 * Fetches the user's active billing subscription from Clerk and writes the
 * resolved plan slug to `userPlans`. Same logic as `syncUserPlan` but takes
 * explicit userId + clerkUserId instead of reading from auth context.
 */
export const syncUserPlanInternal = internalAction({
  args: {
    userId: v.string(),
    clerkUserId: v.string(),
  },
  returns: v.object({ plan: v.string(), synced: v.boolean() }),
  handler: async (ctx: ActionCtx, { userId, clerkUserId }) => {
    const clerk = getClerkClient()

    const existingRow = (await ctx.runQuery(
      internal.billing.syncPlan.getMyPlanByUserId,
      { userId },
    )) as { plan: string; syncedAt: number } | null

    let plan = ''
    let billingEventContext:
      | 'clerk-api-error'
      | 'unknown-plan-slug'
      | 'malformed-clerk-response'
      | null = null
    let billingEventMetadata:
      | { receivedType: string; preservedPlan: string }
      | { receivedSlug: string; preservedPlan: string }
      | { error: string; preservedPlan: string }
      | undefined = undefined

    try {
      const subscription = await clerk.billing.getUserBillingSubscription(clerkUserId)

      if (!Array.isArray(subscription?.subscriptionItems)) {
        plan = existingRow?.plan ?? ''
        billingEventContext = 'malformed-clerk-response'
        billingEventMetadata = {
          receivedType: typeof subscription?.subscriptionItems,
          preservedPlan: plan,
        }
      } else if (subscription.subscriptionItems.length === 0) {
        plan = ''
      } else {
        const billedItem = subscription.subscriptionItems.find(
          (item) => item.status === 'active' || item.status === 'past_due',
        )
        const raw = billedItem?.plan?.slug ?? ''
        if (raw && !isKnownPlan(raw)) {
          plan = existingRow?.plan ?? ''
          billingEventContext = 'unknown-plan-slug'
          billingEventMetadata = { receivedSlug: raw, preservedPlan: plan }
        } else {
          plan = isKnownPlan(raw) ? raw : ''
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (/not found|no.*subscription/i.test(msg)) {
        plan = ''
      } else {
        plan = existingRow?.plan ?? ''
        billingEventContext = 'clerk-api-error'
        billingEventMetadata = { error: msg, preservedPlan: plan }
      }
    }

    await ctx.runMutation(internal.billing.syncPlan.writePlan, {
      userId,
      clerkUserId,
      plan,
      billingEventContext: billingEventContext ?? undefined,
      billingEventMetadata,
    })

    return { plan, synced: true }
  },
})

/**
 * Internal action: asserts every plan slug returned by Clerk's plan list
 * exists in PLAN_CONFIG. Run via:
 *   npx convex run billing/syncPlan:assertPlanConfigMatchesClerk
 *
 * Throws with a diff report if drift is detected.
 */
export const assertPlanConfigMatchesClerk = internalAction({
  args: {},
  returns: v.object({ ok: v.boolean(), message: v.string() }),
  handler: async (_ctx: ActionCtx) => {
    const clerk = getClerkClient()

    // Clerk SDK exposes plan listing under billing.getPlans / billing.listPlans.
    // Try both common shapes defensively.
    let clerkSlugs: string[] = []
    try {
      const result = await (clerk.billing as any).getPlans?.()
        ?? await (clerk.billing as any).listPlans?.()
      const items: unknown[] = Array.isArray(result)
        ? result
        : Array.isArray(result?.data)
          ? result.data
          : []
      clerkSlugs = items
        .map((p: any) => p?.slug ?? p?.plan?.slug ?? '')
        .filter(Boolean)
    } catch (err) {
      throw new Error(
        `[assertPlanConfigMatchesClerk] Failed to fetch plans from Clerk: ${err}`,
      )
    }

    const knownSlugs = new Set(Object.keys(PLAN_CONFIG))
    const unknown = clerkSlugs.filter((s) => !knownSlugs.has(s))
    const missing = [...knownSlugs].filter((s) => !clerkSlugs.includes(s))

    if (unknown.length > 0 || missing.length > 0) {
      const parts: string[] = []
      if (unknown.length > 0)
        parts.push(`Clerk has slugs not in PLAN_CONFIG: ${unknown.join(', ')}`)
      if (missing.length > 0)
        parts.push(`PLAN_CONFIG has slugs not in Clerk: ${missing.join(', ')}`)
      const message = parts.join(' | ')
      throw new Error(`[assertPlanConfigMatchesClerk] Drift detected: ${message}`)
    }

    return { ok: true, message: 'All Clerk plan slugs match PLAN_CONFIG.' }
  },
})
