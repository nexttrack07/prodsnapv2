import { v } from 'convex/values'
import { internalAction, internalMutation, internalQuery } from '../_generated/server'
import type { ActionCtx, MutationCtx } from '../_generated/server'
import { internal } from '../_generated/api'
import { grantPlanCredits, upgradeAdjustCredits } from '../lib/billing/credits'

// Retry tunables — kept module-local so cron + enqueue path agree.
const RETRY_BASE_MS = 60_000
const RETRY_MAX_ATTEMPTS = 5
const RETRY_MAX_DELAY_MS = 60 * 60 * 1000 // 1 hour cap

// Any `subscription.*` or `subscriptionItem.*` event implies the user's
// billing state changed — we always respond by re-syncing their plan from
// Clerk's Backend API. Enumerating each subtype was brittle (Clerk adds new
// ones — e.g. subscriptionItem.upcoming, ended, active, etc.).
// `user.deleted` triggers the GDPR right-to-erasure path (see
// ./userDeletion.ts) instead of the plan-sync path.
function isSupportedEvent(eventType: string): boolean {
  if (eventType.startsWith('subscription.')) return true
  if (eventType.startsWith('subscriptionItem.')) return true
  if (eventType === 'user.updated') return true
  if (eventType === 'user.deleted') return true
  return false
}

/**
 * Internal query — check if a webhook event has already been processed.
 */
export const getWebhookEvent = internalQuery({
  args: { eventId: v.string() },
  returns: v.union(v.object({ handled: v.boolean() }), v.null()),
  handler: async (ctx, { eventId }) => {
    const row = await ctx.db
      .query('webhookEvents')
      .withIndex('by_eventId', (q) => q.eq('eventId', eventId))
      .unique()
    if (!row) return null
    return { handled: row.handled }
  },
})

/**
 * Internal mutation — record a webhook event (dedup insert).
 * Returns false if the event was already recorded (replay).
 */
export const recordWebhookEvent = internalMutation({
  args: {
    eventId: v.string(),
    type: v.string(),
    rawBody: v.optional(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, { eventId, type, rawBody }) => {
    const existing = await ctx.db
      .query('webhookEvents')
      .withIndex('by_eventId', (q) => q.eq('eventId', eventId))
      .unique()
    if (existing) return false
    await ctx.db.insert('webhookEvents', {
      eventId,
      type,
      receivedAt: Date.now(),
      handled: false,
      rawBody,
    })
    return true
  },
})

/**
 * Internal mutation — mark a webhook event as handled (or record an error).
 */
export const markWebhookHandled = internalMutation({
  args: {
    eventId: v.string(),
    handlerError: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { eventId, handlerError }) => {
    const row = await ctx.db
      .query('webhookEvents')
      .withIndex('by_eventId', (q) => q.eq('eventId', eventId))
      .unique()
    if (!row) return null
    await ctx.db.patch(row._id, {
      handled: handlerError === undefined,
      handlerError,
    })
    return null
  },
})

/**
 * Shared inner handler — runs the webhook payload-processing logic.
 * Returns either { ok: true } on success, { skipped: true } on payloads we
 * intentionally drop (unsupported type, parse failure, missing clerkUserId),
 * or throws on transient/Clerk-API errors so the caller can enqueue a retry.
 */
async function processWebhookPayload(
  ctx: ActionCtx,
  args: { eventType: string; payload: string },
): Promise<{ ok: true } | { skipped: true; reason: string }> {
  const { eventType, payload } = args

  if (!isSupportedEvent(eventType)) {
    console.log(`[webhookHandler] Ignoring unsupported event type: ${eventType}`)
    return { skipped: true, reason: 'unsupported-event' }
  }

  let data: Record<string, unknown>
  try {
    data = JSON.parse(payload)
  } catch {
    return { skipped: true, reason: 'parse-failed' }
  }

  // Extract clerkUserId from the event. Shape per event type:
  //   subscription.* / subscriptionItem.*: data.data.payer.user_id
  //     (data.data.id is the subscription/item id — NOT the user)
  //   user.updated / user.deleted: data.data.id (the Clerk user id itself)
  const inner = (data?.data as Record<string, unknown>) ?? {}
  const payer = (inner as { payer?: { user_id?: string } }).payer
  const clerkUserId: string | null =
    (payer?.user_id as string | undefined) ??
    (eventType === 'user.updated' || eventType === 'user.deleted'
      ? ((inner as { id?: string }).id ?? null)
      : null)

  if (!clerkUserId || typeof clerkUserId !== 'string') {
    console.error(
      `[webhookHandler] Could not extract clerkUserId from event ${eventType}:`,
      JSON.stringify(data).slice(0, 500),
    )
    return { skipped: true, reason: 'missing-clerkUserId' }
  }

  // GDPR right-to-erasure path. Clerk fires `user.deleted` after the user
  // (or an admin via Clerk dashboard) deletes their account.
  if (eventType === 'user.deleted') {
    await ctx.runAction(
      internal.billing.userDeletion.handleUserDeleted,
      { clerkUserId },
    )
    return { ok: true }
  }

  // Derive tokenIdentifier — Convex uses `<issuer>|<subject>` as the stable
  // identity key. For webhook-driven syncs we use clerkUserId as the userId
  // key since we can't derive tokenIdentifier server-side without the JWT.
  const existingUserId = (await ctx.runQuery(
    internal.billing.webhookHandler.getUserIdByClerkId,
    { clerkUserId },
  )) as string | null

  const userId = existingUserId ?? clerkUserId

  await ctx.runAction(internal.billing.syncPlan.syncUserPlanInternal, {
    userId,
    clerkUserId,
  })

  // Only apply credits for subscription events, not user.updated.
  if (eventType.startsWith('subscription.') || eventType.startsWith('subscriptionItem.')) {
    await ctx.runMutation(internal.billing.webhookHandler.applyCreditsFromPlan, { userId })
  }

  return { ok: true }
}

// ─── Credit slug helpers ──────────────────────────────────────────────────────

type CreditPlanSlug = 'free' | 'lite' | 'pro' | 'max'

/** Map userPlans.plan slug → credit helper slug. Returns null for unknown/empty plans. */
function toCreditSlug(plan: string): CreditPlanSlug | null {
  if (plan === 'free_user' || plan === '') return 'free'
  if (plan === 'lite' || plan === 'pro' || plan === 'max') return plan
  return null
}

/**
 * Internal mutation — called after the plan sync on every subscription event.
 * Reads the freshly-written userPlans row and applies the matching credit grant.
 *
 * Mid-period upgrade: if the user already has a balance for this period but
 * the plan slug changed, calls upgradeAdjustCredits (delta only).
 * New period / first grant: calls grantPlanCredits (idempotent on periodStart+planSlug).
 */
export const applyCreditsFromPlan = internalMutation({
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx: MutationCtx, { userId }) => {
    // 1. Read the freshly-synced userPlans row.
    const planRow = await ctx.db
      .query('userPlans')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique()

    if (!planRow) return null

    const { plan, periodStart, periodEnd } = planRow

    // 2. Map plan slug to credit helper slug.
    const planSlug = toCreditSlug(plan)
    if (planSlug === null) {
      await ctx.db.insert('billingEvents', {
        userId,
        mutationName: 'billing/webhookHandler:applyCreditsFromPlan',
        allowed: true,
        claimedPlan: plan || undefined,
        timestamp: Date.now(),
        context: 'unknown-plan-slug',
        metadata: { receivedSlug: plan || '(empty)', preservedPlan: plan || '' },
      })
      return null
    }

    // 3. Require valid period boundaries — don't grant against missing anchors.
    if (periodStart === undefined || periodEnd === undefined) {
      await ctx.db.insert('billingEvents', {
        userId,
        mutationName: 'billing/webhookHandler:applyCreditsFromPlan',
        allowed: true,
        claimedPlan: plan || undefined,
        timestamp: Date.now(),
        context: 'period-fallback',
        metadata: { receivedSlug: plan, preservedPlan: plan },
      })
      return null
    }

    // 4. Read existing credit balance.
    const balance = await ctx.db
      .query('creditBalances')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique()

    // 4a. Cancellation / downgrade-to-free: hard-zero plan allowance immediately
    // instead of letting the user keep Pro credits until period rollover.
    if (planSlug === 'free' && balance && balance.lastGrantedPlanSlug !== 'free') {
      await ctx.db.patch(balance._id, {
        planAllowanceMc: 0,
        planUsedMc: 0,
        lastGrantedPlanSlug: 'free',
        version: balance.version + 1,
        updatedAt: Date.now(),
      })
      await ctx.db.insert('billingEvents', {
        userId,
        mutationName: 'applyCreditsFromPlan',
        allowed: true,
        claimedPlan: 'free',
        timestamp: Date.now(),
        context: 'credit-grant',
        metadata: { kind: 'credit-grant' as const, planSlug: 'free', allowanceMc: 0, previousPlanSlug: balance.lastGrantedPlanSlug },
      })
      return null
    }

    // 5. Mid-period plan change: same period, different plan slug.
    if (
      balance &&
      balance.lastGrantedPeriodStart === periodStart &&
      balance.lastGrantedPlanSlug !== undefined &&
      balance.lastGrantedPlanSlug !== planSlug
    ) {
      const oldSlug = balance.lastGrantedPlanSlug as CreditPlanSlug
      await upgradeAdjustCredits(ctx, {
        userId,
        oldPlanSlug: oldSlug,
        newPlanSlug: planSlug,
        periodStart,
      })
      // Stamp the new slug so subsequent re-deliveries don't re-trigger the delta.
      await ctx.db.patch(balance._id, { lastGrantedPlanSlug: planSlug })
      return null
    }

    // 6. New period or no balance yet — idempotent grant.
    await grantPlanCredits(ctx, { userId, planSlug, periodStart, periodEnd })
    return null
  },
})

/**
 * Internal action — dispatched by the HTTP handler after recording the event.
 * On error, enqueues a webhookRetryQueue row so the per-minute cron can retry.
 */
export const handleBillingEvent = internalAction({
  args: {
    eventId: v.string(),
    eventType: v.string(),
    payload: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { eventId, eventType, payload }) => {
    try {
      const result = await processWebhookPayload(ctx, { eventType, payload })
      if ('ok' in result) {
        await ctx.runMutation(internal.billing.webhookHandler.markWebhookHandled, {
          eventId,
        })
      } else {
        // Skipped/non-retryable: mark handled without an error so we don't loop.
        await ctx.runMutation(internal.billing.webhookHandler.markWebhookHandled, {
          eventId,
          handlerError:
            result.reason === 'unsupported-event' ? undefined : result.reason,
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(
        `[webhookHandler] handler failed for ${eventType}, enqueueing retry:`,
        msg,
      )
      // Audit on webhookEvents row stays so operators can see the failure.
      await ctx.runMutation(internal.billing.webhookHandler.markWebhookHandled, {
        eventId,
        handlerError: msg,
      })
      // Durable retry — re-runs processWebhookPayload from the cron.
      await ctx.runMutation(
        internal.billing.webhookHandler.enqueueWebhookRetry,
        { eventId, eventType, payload, error: msg },
      )
    }

    return null
  },
})

/**
 * Internal mutation — insert a webhookRetryQueue row for the cron to drain.
 * Skips insertion if a row already exists for this eventId (idempotent).
 */
export const enqueueWebhookRetry = internalMutation({
  args: {
    eventId: v.string(),
    eventType: v.string(),
    payload: v.string(),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { eventId, eventType, payload, error }) => {
    const existing = await ctx.db
      .query('webhookRetryQueue')
      .withIndex('by_eventId', (q) => q.eq('eventId', eventId))
      .unique()
    if (existing) return null
    const now = Date.now()
    await ctx.db.insert('webhookRetryQueue', {
      eventId,
      eventType,
      payload,
      attempts: 0,
      nextAttemptAt: now + RETRY_BASE_MS,
      lastError: error,
      createdAt: now,
    })
    return null
  },
})

/**
 * Internal query — fetch up to `limit` retry rows whose nextAttemptAt has passed.
 */
export const getDueRetryRows = internalQuery({
  args: { now: v.number(), limit: v.number() },
  returns: v.array(
    v.object({
      _id: v.id('webhookRetryQueue'),
      eventId: v.string(),
      eventType: v.string(),
      payload: v.string(),
      attempts: v.number(),
    }),
  ),
  handler: async (ctx, { now, limit }) => {
    const rows = await ctx.db
      .query('webhookRetryQueue')
      .withIndex('by_nextAttemptAt', (q) => q.lte('nextAttemptAt', now))
      .take(limit)
    return rows.map((r) => ({
      _id: r._id,
      eventId: r.eventId,
      eventType: r.eventType,
      payload: r.payload,
      attempts: r.attempts,
    }))
  },
})

/**
 * Internal mutation — bookkeeping after a retry attempt: delete on success,
 * patch+reschedule on transient failure, delete + console.error on give-up.
 */
export const finalizeRetryAttempt = internalMutation({
  args: {
    rowId: v.id('webhookRetryQueue'),
    success: v.boolean(),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { rowId, success, error }) => {
    const row = await ctx.db.get(rowId)
    if (!row) return null
    if (success) {
      await ctx.db.delete(rowId)
      return null
    }
    const nextAttempts = row.attempts + 1
    if (nextAttempts >= RETRY_MAX_ATTEMPTS) {
      console.error(
        `[webhookHandler] giving up on event ${row.eventId} (${row.eventType}) ` +
          `after ${nextAttempts} attempts: ${error ?? 'unknown error'}`,
      )
      await ctx.db.delete(rowId)
      return null
    }
    const delay = Math.min(
      RETRY_BASE_MS * Math.pow(2, nextAttempts),
      RETRY_MAX_DELAY_MS,
    )
    await ctx.db.patch(rowId, {
      attempts: nextAttempts,
      nextAttemptAt: Date.now() + delay,
      lastError: error,
    })
    return null
  },
})

/**
 * Internal action — per-minute cron drains webhookRetryQueue with backoff.
 */
export const retryFailedWebhooks = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now()
    const rows = await ctx.runQuery(
      internal.billing.webhookHandler.getDueRetryRows,
      { now, limit: 25 },
    )
    for (const row of rows) {
      try {
        const result = await processWebhookPayload(ctx, {
          eventType: row.eventType,
          payload: row.payload,
        })
        // Treat skipped same as success — non-retryable.
        const ok = 'ok' in result || 'skipped' in result
        await ctx.runMutation(
          internal.billing.webhookHandler.finalizeRetryAttempt,
          { rowId: row._id, success: ok },
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await ctx.runMutation(
          internal.billing.webhookHandler.finalizeRetryAttempt,
          { rowId: row._id, success: false, error: msg },
        )
      }
    }
    return null
  },
})

/**
 * Internal query — find an existing userPlans row's userId by clerkUserId.
 * Used so webhook syncs hit the same row as client-initiated syncs.
 */
export const getUserIdByClerkId = internalQuery({
  args: { clerkUserId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { clerkUserId }) => {
    const row = await ctx.db
      .query('userPlans')
      .withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkUserId))
      .first()
    return row?.userId ?? null
  },
})
