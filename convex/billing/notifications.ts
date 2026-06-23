/**
 * Transactional email orchestration for billing lifecycle events.
 *
 * The bare-metal `sendPaymentFailedEmail` action in `convex/lib/email/index.ts`
 * is a dumb pipe — given an address, it ships the mail. This module is the
 * *policy* layer that resolves the Clerk user → primary email, reads `userPlans`
 * to skip users already notified this period (idempotency via
 * `notifiedPaymentFailedForPeriodStart`), and stamps the row after a successful
 * send so retried webhooks never double-email.
 *
 * Entry point: `notifyPaymentFailed` → scheduled from
 * `webhookHandler.processWebhookPayload` when Clerk fires a `*.past_due` event.
 * (The 7-day trial-ending sweep was retired with the move to free credits.)
 */
import { v } from 'convex/values'
import { internalAction, internalMutation, internalQuery } from '../_generated/server'
import { internal } from '../_generated/api'
import { getClerkClient } from '../lib/billing/provider.clerk'

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

// NOTE: The trial-ending sweep (scanAndNotifyTrialsEnding /
// getTrialEndingCandidates / sendTrialEndingEmail) was retired when ProdSnap
// dropped the 7-day trial for the free-credits model. Payment-failed
// notifications remain above.
