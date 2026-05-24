/**
 * Transactional email orchestration for billing lifecycle events.
 *
 * The bare-metal `sendTrialEndingEmail` / `sendPaymentFailedEmail` actions in
 * `convex/lib/email/index.ts` are dumb pipes — given an address, they ship the
 * mail. This module is the *policy* layer that:
 *
 *   1. Resolves the Clerk user → primary email address (single Clerk fetch).
 *   2. Reads the `userPlans` row to skip users we've already notified for the
 *      current billing period (idempotency via
 *      `notifiedTrialEndingForPeriodStart` / `notifiedPaymentFailedForPeriodStart`).
 *   3. Stamps the row after a successful send so retried webhooks and the
 *      daily cron sweep never double-email the same user for the same period.
 *
 * Two entry points wire into the rest of the backend:
 *
 *   - `notifyPaymentFailed`     → scheduled from `webhookHandler.processWebhookPayload`
 *                                 when Clerk fires a `*.past_due` event.
 *   - `scanAndNotifyTrialsEnding` → daily cron (`convex/crons.ts`). Webhook
 *                                   coverage for trial_end is inconsistent
 *                                   across Clerk's billing event subtypes, so
 *                                   we sweep `userPlans` ourselves.
 */
import { v } from 'convex/values'
import { internalAction, internalMutation, internalQuery } from '../_generated/server'
import { internal } from '../_generated/api'
import { getClerkClient } from '../lib/billing/provider.clerk'

// Trial-ending sweep window: email when 0–3 days remain on the trial. Using
// a 3-day window (instead of "exactly 3 days") means a missed cron run won't
// silently skip the user — the next day's sweep still catches them.
const TRIAL_NOTIFY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000

type ClerkUserShape = {
  emailAddresses?: Array<{ id: string; emailAddress: string }>
  primaryEmailAddressId?: string | null
  firstName?: string | null
}

/** Resolve the primary email + best-guess display name for a Clerk user. */
async function resolveContact(clerkUserId: string): Promise<{ email: string; name?: string } | null> {
  const clerk = getClerkClient()
  try {
    const user = (await clerk.users.getUser(clerkUserId)) as ClerkUserShape
    const addrs = user.emailAddresses ?? []
    const primary =
      addrs.find((a) => a.id === user.primaryEmailAddressId)?.emailAddress ??
      addrs[0]?.emailAddress
    if (!primary) {
      console.warn(`[notifications] No email on Clerk user ${clerkUserId}`)
      return null
    }
    return { email: primary, name: user.firstName ?? undefined }
  } catch (err) {
    console.error(`[notifications] Failed to fetch Clerk user ${clerkUserId}:`, err)
    return null
  }
}

// ─── Internal queries / mutations for idempotency ────────────────────────────

export const getPlanByClerkUserId = internalQuery({
  args: { clerkUserId: v.string() },
  returns: v.union(
    v.object({
      userId: v.string(),
      plan: v.string(),
      periodStart: v.optional(v.number()),
      periodEnd: v.optional(v.number()),
      billingStatus: v.optional(v.string()),
      notifiedTrialEndingForPeriodStart: v.optional(v.number()),
      notifiedPaymentFailedForPeriodStart: v.optional(v.number()),
    }),
    v.null(),
  ),
  handler: async (ctx, { clerkUserId }) => {
    const row = await ctx.db
      .query('userPlans')
      .withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkUserId))
      .first()
    if (!row) return null
    return {
      userId: row.userId,
      plan: row.plan,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      billingStatus: row.billingStatus,
      notifiedTrialEndingForPeriodStart: row.notifiedTrialEndingForPeriodStart,
      notifiedPaymentFailedForPeriodStart: row.notifiedPaymentFailedForPeriodStart,
    }
  },
})

export const stampNotified = internalMutation({
  args: {
    userId: v.string(),
    kind: v.union(v.literal('trial-ending'), v.literal('payment-failed')),
    periodStart: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { userId, kind, periodStart }) => {
    const row = await ctx.db
      .query('userPlans')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique()
    if (!row) return null
    if (kind === 'trial-ending') {
      await ctx.db.patch(row._id, { notifiedTrialEndingForPeriodStart: periodStart })
    } else {
      await ctx.db.patch(row._id, { notifiedPaymentFailedForPeriodStart: periodStart })
    }
    return null
  },
})

// ─── Public-ish (internal) actions ───────────────────────────────────────────

/**
 * Send the "payment failed" email exactly once per billing period for a given
 * Clerk user. Idempotent: re-invocations within the same period are no-ops.
 */
export const notifyPaymentFailed = internalAction({
  args: { clerkUserId: v.string() },
  returns: v.null(),
  handler: async (ctx, { clerkUserId }) => {
    const plan = await ctx.runQuery(internal.billing.notifications.getPlanByClerkUserId, {
      clerkUserId,
    })
    if (!plan) return null

    // periodStart is the dedupe key. If Clerk hasn't given us one yet, use a
    // synthetic stamp (current day) so we still get idempotency across retries.
    const stamp = plan.periodStart ?? Math.floor(Date.now() / (24 * 60 * 60 * 1000))
    if (plan.notifiedPaymentFailedForPeriodStart === stamp) return null

    const contact = await resolveContact(clerkUserId)
    if (!contact) return null

    await ctx.runAction(internal.lib.email.index.sendPaymentFailedEmail, {
      email: contact.email,
      name: contact.name,
    })

    await ctx.runMutation(internal.billing.notifications.stampNotified, {
      userId: plan.userId,
      kind: 'payment-failed',
      periodStart: stamp,
    })
    return null
  },
})

/**
 * Daily cron: walk `userPlans` looking for trials whose `periodEnd` falls
 * within the next 3 days, and email each one — at most once per period.
 *
 * Scope check: we only treat a row as a trial when `billingStatus === 'trialing'`.
 * That matches Clerk's billing status enum; non-trial subscriptions naturally
 * skip the path even if their period happens to end soon.
 */
export const scanAndNotifyTrialsEnding = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now()
    const candidates = (await ctx.runQuery(
      internal.billing.notifications.getTrialEndingCandidates,
      { now, windowMs: TRIAL_NOTIFY_WINDOW_MS },
    )) as Array<{ userId: string; clerkUserId: string; periodStart: number }>

    for (const row of candidates) {
      const contact = await resolveContact(row.clerkUserId)
      if (!contact) continue
      try {
        await ctx.runAction(internal.lib.email.index.sendTrialEndingEmail, {
          email: contact.email,
          name: contact.name,
        })
        await ctx.runMutation(internal.billing.notifications.stampNotified, {
          userId: row.userId,
          kind: 'trial-ending',
          periodStart: row.periodStart,
        })
      } catch (err) {
        // Logged inside email action; swallow so one bad address doesn't
        // halt the whole sweep.
        console.error(
          `[notifications] trial-ending send failed for ${row.clerkUserId}:`,
          err instanceof Error ? err.message : err,
        )
      }
    }
    return null
  },
})

export const getTrialEndingCandidates = internalQuery({
  args: { now: v.number(), windowMs: v.number() },
  returns: v.array(
    v.object({
      userId: v.string(),
      clerkUserId: v.string(),
      periodStart: v.number(),
    }),
  ),
  handler: async (ctx, { now, windowMs }) => {
    const all = await ctx.db.query('userPlans').collect()
    const cutoff = now + windowMs
    return all
      .filter(
        (r) =>
          r.billingStatus === 'trialing' &&
          r.clerkUserId !== undefined &&
          r.periodEnd !== undefined &&
          r.periodStart !== undefined &&
          r.periodEnd > now &&
          r.periodEnd <= cutoff &&
          r.notifiedTrialEndingForPeriodStart !== r.periodStart,
      )
      .map((r) => ({
        userId: r.userId,
        clerkUserId: r.clerkUserId as string,
        periodStart: r.periodStart as number,
      }))
  },
})
