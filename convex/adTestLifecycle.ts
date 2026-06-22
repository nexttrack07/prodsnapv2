/**
 * Weekly Ad Test return trigger (issue #41 / Workstream 8).
 *
 * Home recommendations and the WinnerNudge only fire once a media buyer is back
 * in the app. This module is the EXTERNAL nudge that brings weekly users back:
 * a daily cron sweeps for exported Ad Tests that have had ~a week to run and
 * haven't been nudged yet, then emails each owner a deep link to log the winner
 * and start next week's test.
 *
 * Mirrors the billing trial-ending pattern (convex/billing/notifications.ts):
 *   cron → scan (internal query) → resolve Clerk contact → send → stamp.
 *
 * Idempotency: `adTests.lastLifecycleEmailSentAt` is stamped only after a real
 * send, so each exported test is nudged at most once. When the email provider
 * isn't configured the send is a no-op and the test stays eligible for a later
 * sweep (documented retention gap — see sendAdTestLifecycleEmail).
 */
import { v } from 'convex/values'
import {
  internalAction,
  internalMutation,
  internalQuery,
} from './_generated/server'
import { internal } from './_generated/api'
import { getClerkClient } from './lib/billing/provider.clerk'

// A test is eligible once it's had this long to run since export.
const LIFECYCLE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
// Bound per-sweep work; the daily cadence drains any backlog over time.
const MAX_PER_SWEEP = 200

const APP_ORIGIN = 'https://prodsnap.io'

type ClerkUserShape = {
  emailAddresses?: Array<{ id: string; emailAddress: string }>
  primaryEmailAddressId?: string | null
  firstName?: string | null
}

/** Resolve a Clerk user's primary email + display name (single Clerk fetch). */
async function resolveContact(
  clerkUserId: string,
): Promise<{ email: string; name?: string } | null> {
  const clerk = getClerkClient()
  try {
    const user = (await clerk.users.getUser(clerkUserId)) as ClerkUserShape
    const addrs = user.emailAddresses ?? []
    const primary =
      addrs.find((a) => a.id === user.primaryEmailAddressId)?.emailAddress ??
      addrs[0]?.emailAddress
    if (!primary) {
      console.warn(`[lifecycle] No email on Clerk user ${clerkUserId}`)
      return null
    }
    return { email: primary, name: user.firstName ?? undefined }
  } catch (err) {
    console.error(`[lifecycle] Failed to fetch Clerk user ${clerkUserId}:`, err)
    return null
  }
}

/**
 * Finds exported Ad Tests that are ready for a weekly follow-up: exported at
 * least LIFECYCLE_WINDOW_MS ago, not archived, generation-complete (ready or
 * partially_failed), and never nudged. Joins `userPlans` for the owner's Clerk
 * id (skips tests whose owner we can't email) and the product for its name.
 */
export const getLifecycleCandidates = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const cutoff = now - LIFECYCLE_WINDOW_MS

    // Scan ONLY not-yet-nudged tests (lastLifecycleEmailSentAt unset) whose
    // exportedAt is in [1, cutoff]: set (excludes undefined, which sorts first)
    // and at least a week old. Because nudged tests live in a different index
    // partition, stamping them removes them from this scan permanently — the
    // sweep can never get stuck re-walking the same already-handled rows.
    // Archived rows are filtered at the DB level so they don't consume the take
    // budget either.
    const tests = await ctx.db
      .query('adTests')
      .withIndex('by_lifecycle', (q) =>
        q
          .eq('lastLifecycleEmailSentAt', undefined)
          .gte('exportedAt', 1)
          .lte('exportedAt', cutoff),
      )
      .filter((q) => q.eq(q.field('archivedAt'), undefined))
      .take(MAX_PER_SWEEP)

    const out: Array<{
      adTestId: typeof tests[number]['_id']
      productId: typeof tests[number]['productId']
      clerkUserId: string
      productName: string
      testName: string
    }> = []

    for (const t of tests) {
      if (t.archivedAt !== undefined) continue
      if (t.lastLifecycleEmailSentAt !== undefined) continue
      if (t.status !== 'ready' && t.status !== 'partially_failed') continue

      const plan = await ctx.db
        .query('userPlans')
        .withIndex('by_userId', (q) => q.eq('userId', t.userId))
        .unique()
      if (!plan?.clerkUserId) continue

      const product = await ctx.db.get(t.productId)
      out.push({
        adTestId: t._id,
        productId: t.productId,
        clerkUserId: plan.clerkUserId,
        productName: product?.name ?? 'your product',
        testName: t.name,
      })
    }
    return out
  },
})

/** Stamps the lifecycle nudge time so a test is never re-nudged. */
export const markLifecycleNudgeSent = internalMutation({
  args: { adTestId: v.id('adTests') },
  returns: v.null(),
  handler: async (ctx, { adTestId }) => {
    const now = Date.now()
    await ctx.db.patch(adTestId, {
      lastLifecycleEmailSentAt: now,
      updatedAt: now,
    })
    return null
  },
})

/**
 * Daily cron entry point. Sweeps lifecycle candidates and emails each owner a
 * deep link to the test. One bad address/send never halts the sweep; we only
 * stamp tests whose email actually went out (sent=true).
 */
export const scanAndNotifyAdTestLifecycle = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now()
    const candidates = await ctx.runQuery(
      internal.adTestLifecycle.getLifecycleCandidates,
      { now },
    )

    for (const c of candidates) {
      const contact = await resolveContact(c.clerkUserId)
      if (!contact) continue

      const deepLink = `${APP_ORIGIN}/studio/${c.productId}?adTestId=${c.adTestId}`
      try {
        const { sent } = await ctx.runAction(
          internal.lib.email.index.sendAdTestLifecycleEmail,
          {
            email: contact.email,
            name: contact.name,
            productName: c.productName,
            testName: c.testName,
            deepLink,
          },
        )
        // Only claim the nudge when an email truly went out — otherwise the
        // test stays eligible for a later sweep once the provider is set up.
        if (sent) {
          await ctx.runMutation(
            internal.adTestLifecycle.markLifecycleNudgeSent,
            { adTestId: c.adTestId },
          )
        }
      } catch (err) {
        console.error(
          `[lifecycle] send failed for test ${c.adTestId}:`,
          err instanceof Error ? err.message : err,
        )
      }
    }
    return null
  },
})
