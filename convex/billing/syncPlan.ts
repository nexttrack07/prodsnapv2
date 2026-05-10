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
    let periodStart: number | undefined = undefined
    let periodEnd: number | undefined = undefined
    let billingStatus: string | undefined = undefined
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
          if (isKnownPlan(raw) && billedItem) {
            periodStart = billedItem.periodStart ?? undefined
            periodEnd = billedItem.periodEnd ?? undefined
            billingStatus = billedItem.status ?? undefined
          }
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
      periodStart,
      periodEnd,
      billingStatus,
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
    periodStart: v.optional(v.number()),
    periodEnd: v.optional(v.number()),
    billingStatus: v.optional(v.string()),
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
  handler: async (ctx, { userId, clerkUserId, plan, periodStart, periodEnd, billingStatus, billingEventContext, billingEventMetadata }) => {
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
        periodStart,
        periodEnd,
        billingStatus,
      })
    } else {
      await ctx.db.insert('userPlans', {
        userId,
        clerkUserId,
        plan,
        syncedAt: now,
        periodStart,
        periodEnd,
        billingStatus,
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
    v.object({
      plan: v.string(),
      syncedAt: v.number(),
      periodStart: v.optional(v.number()),
      periodEnd: v.optional(v.number()),
      billingStatus: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, { userId }) => {
    const row = await ctx.db
      .query('userPlans')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique()
    if (!row) return null
    return {
      plan: row.plan,
      syncedAt: row.syncedAt,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      billingStatus: row.billingStatus,
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
    } else if (canceled.length > 0) {
      // End-of-period cancel: stamp cancelScheduledAt so the UI can render
      // the "cancellation scheduled" banner without re-querying Clerk.
      await ctx.runMutation(
        internal.billing.syncPlan.markCancelScheduled,
        { userId: identity.tokenIdentifier, scheduledAt: Date.now() },
      )
    }
    return { canceledItemIds: canceled }
  },
})

/**
 * Internal mutation — stamps/clears cancelScheduledAt on the user's plan row.
 * Used by cancelMySubscription (set) and reactivateMySubscription (clear).
 */
export const markCancelScheduled = internalMutation({
  args: {
    userId: v.string(),
    scheduledAt: v.union(v.number(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, { userId, scheduledAt }) => {
    const row = await ctx.db
      .query('userPlans')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique()
    if (!row) return null
    await ctx.db.patch(row._id, {
      cancelScheduledAt: scheduledAt ?? undefined,
    })
    return null
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

    // Use Clerk's period end if available; fall back to first of next UTC month.
    const now = new Date()
    const nextReset = row?.periodEnd ?? Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)

    return {
      signedIn: true,
      plan: planSlug || null,
      billingStatus: row?.billingStatus ?? null,
      cancelScheduledAt: row?.cancelScheduledAt ?? null,
      periodEnd: row?.periodEnd ?? null,
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
    let periodStart: number | undefined = undefined
    let periodEnd: number | undefined = undefined
    let billingStatus: string | undefined = undefined
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
          if (isKnownPlan(raw) && billedItem) {
            periodStart = billedItem.periodStart ?? undefined
            periodEnd = billedItem.periodEnd ?? undefined
            billingStatus = billedItem.status ?? undefined
          }
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
      periodStart,
      periodEnd,
      billingStatus,
      billingEventContext: billingEventContext ?? undefined,
      billingEventMetadata,
    })

    return { plan, synced: true }
  },
})

/**
 * Internal action — hourly cron target (Layer 1 of the defense-in-depth triad).
 * Scans `userPlans` for rows where `periodEnd < now` AND `syncedAt + 60_000 < now`,
 * then schedules a `syncUserPlanInternal` for each qualifying row.
 */
export const refreshStalePeriodsInternal = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx: ActionCtx) => {
    const now = Date.now()
    const rows = await ctx.runQuery(
      internal.billing.syncPlan.getStalePeriodsForRefresh,
      { now },
    )

    let scheduled = 0
    let skippedMissingClerkUserId = 0

    for (const row of rows) {
      if (!row.clerkUserId) {
        skippedMissingClerkUserId++
        console.warn(
          `[billing cron] Skipping stale row for userId=${row.userId}: missing clerkUserId`,
        )
        continue
      }
      await ctx.scheduler.runAfter(
        0,
        internal.billing.syncPlan.syncUserPlanInternal,
        { userId: row.userId, clerkUserId: row.clerkUserId },
      )
      scheduled++
    }

    console.log(
      `[billing cron] Scanned ${rows.length}, scheduled ${scheduled}, ` +
        `skipped ${skippedMissingClerkUserId} missing clerkUserId`,
    )
    return null
  },
})

/**
 * Internal query — returns userPlans rows eligible for stale-period refresh.
 * Used by refreshStalePeriodsInternal to keep query logic server-side.
 */
export const getStalePeriodsForRefresh = internalQuery({
  args: { now: v.number() },
  returns: v.array(
    v.object({
      userId: v.string(),
      clerkUserId: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, { now }) => {
    const allRows = await ctx.db.query('userPlans').collect()
    return allRows
      .filter(
        (r) =>
          r.periodEnd !== undefined &&
          r.periodEnd < now &&
          (!r.syncedAt || r.syncedAt + 60_000 < now),
      )
      .map((r) => ({ userId: r.userId, clerkUserId: r.clerkUserId }))
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
