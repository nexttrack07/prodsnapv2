/**
 * No-card starter Ad Test activation — issue #35/#36.
 *
 * `activateStarterFlow` provisions the entire starter experience in one call:
 *   1. Abuse / eligibility check (disposable-email stub + idempotency).
 *   2. Clone the configured sample product.
 *   3. Atomically claim the starter grant on the onboarding profile
 *      (hasReceivedStarterGrant + starterGrantAt) and write creditBalances.
 *   4. Create a Starter Ad Test (1 concept × 3 placements) from the
 *      product's first marketing angle and start generation.
 *
 * Idempotency: `hasReceivedStarterGrant` on the onboarding profile is the
 * authoritative flag. The creditBalances existence check (#35) is kept as a
 * secondary guard, but the profile flag is checked first and set atomically
 * in `_claimStarterGrant` so it survives even if the balance row is later
 * deleted or adjusted.
 *
 * Abuse controls (#36):
 *   - Disposable-email domain block (hardcoded stub; see TODO below).
 *   - One grant per account (profile flag — survives balance resets).
 *   - IP/device rate heuristics: require an HTTP action to read real client
 *     IP; stubbed here with a TODO and a clear follow-up path.
 *   - Google OAuth preference: surfaced as a UI hint in the onboarding page;
 *     not enforced server-side (no Clerk method to gate on provider).
 *
 * Free-plan refill guard: credit grants for paid plans come exclusively from
 * Clerk subscription webhook events. Starter users have no Clerk subscription
 * so no webhook fires for them. As defense-in-depth, `grantPlanCredits` in
 * lib/billing/credits.ts also skips 'free' grants for rows whose
 * lastGrantedPlanSlug === 'starter'.
 */
import { action, internalMutation } from './_generated/server'
import { v } from 'convex/values'
import { api, internal } from './_generated/api'

// Starter test is always 1 concept × these 3 placements.
const STARTER_PLACEMENTS = ['feed_square', 'feed_vertical', 'story_reel'] as const

// 1 credit = 1 000 mc; exactly enough for 3 images (one per placement).
const STARTER_CREDITS_MC = 3 * 1_000

// ─── Disposable-email block ───────────────────────────────────────────────────
// TODO (#36 follow-up): Replace with a real-time API call (e.g. Abstract API,
// Mailcheck.ai) or a maintained npm package. This hardcoded set catches the
// most common throwaway providers only.
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwam.com',
  'yopmail.com', 'sharklasers.com', 'guerrillamailblock.com', 'grr.la',
  'guerrillamail.info', 'guerrillamail.biz', 'guerrillamail.de',
  'guerrillamail.net', 'guerrillamail.org', 'spam4.me', 'trashmail.com',
  'trashmail.me', 'trashmail.net', 'dispostable.com', 'mailnull.com',
  'maildrop.cc', 'filzmail.com', 'getairmail.com', 'spamgourmet.com',
  'spamgourmet.net', 'spamgourmet.org', 'tempr.email', 'discard.email',
])

function isDisposableEmail(email: string | undefined): boolean {
  if (!email) return false
  const domain = email.split('@')[1]?.toLowerCase()
  return domain ? DISPOSABLE_EMAIL_DOMAINS.has(domain) : false
}

// ─── Public action ────────────────────────────────────────────────────────────

export const activateStarterFlow = action({
  args: {},
  handler: async (ctx): Promise<{ adTestId: string; productId: string }> => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')

    // ── Abuse check 1: disposable email ──────────────────────────────────
    if (isDisposableEmail(identity.email)) {
      throw new Error(
        'Please sign up with a real email address to activate the free test.',
      )
    }

    // ── Abuse check 2 (stub): IP / device rate heuristics ────────────────
    // TODO (#36 follow-up): Move this check into a Convex HTTP action where
    // the real client IP is available via request.headers.get('x-forwarded-for').
    // Possible signals: >N starter activations from the same /24 subnet in 24h,
    // missing User-Agent, known datacenter IP ranges (ASN lookup).
    // For now the profile-flag idempotency below is the hard gate.

    // 1. Clone the sample product (throws if user already has products or
    //    the sample isn't configured).
    const productId = await ctx.runMutation(api.products.createProductFromSample, {})

    // 2. Read the cloned product to pick its first marketing angle.
    const product = await ctx.runQuery(api.products.getProductWithStats, { productId })
    if (!product?.marketingAngles?.length) {
      throw new Error('Sample product has no marketing angles — contact support.')
    }
    const angle = product.marketingAngles[0]

    // 3. Atomically claim the starter grant on the onboarding profile and
    //    write the creditBalances row. Throws if already granted.
    await ctx.runMutation(internal.activation._claimStarterGrant, {})

    // 4. Create the starter Ad Test draft (1 concept × 3 placements).
    const adTestId = await ctx.runMutation(api.adTests.createDraft, {
      productId,
      name: 'Starter Ad Test',
      source: 'starter',
      angles: [
        {
          key: 'starter_concept',
          title: angle.title,
          description: angle.description,
          hook: angle.hook,
          suggestedAdStyle: angle.suggestedAdStyle,
        },
      ],
      placements: [...STARTER_PLACEMENTS],
    })

    // 5. Fan out generation rows and kick off workflows.
    await ctx.runMutation(api.adTests.startGeneration, { adTestId })

    return { adTestId: adTestId as string, productId: productId as string }
  },
})

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Atomically checks and claims the starter grant on the onboarding profile.
 * Sets hasReceivedStarterGrant + starterGrantAt, then writes creditBalances.
 * Must run as a single mutation so there's no window between the guard read
 * and the flag write.
 */
export const _claimStarterGrant = internalMutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')
    const userId = identity.tokenIdentifier

    // ── Primary idempotency guard: profile flag ───────────────────────────
    const profile = await ctx.db
      .query('onboardingProfiles')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique()

    if (profile?.hasReceivedStarterGrant) {
      throw new Error('Starter test already activated for this account.')
    }

    // ── Secondary guard: creditBalances existence ─────────────────────────
    const existingBalance = await ctx.db
      .query('creditBalances')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique()
    if (existingBalance) {
      throw new Error('Starter test already activated for this account.')
    }

    const now = Date.now()

    // Stamp the profile before writing credits so any crash between the two
    // writes still leaves the flag set — the user gets a clear error if they
    // retry rather than silently getting double credits.
    if (profile) {
      await ctx.db.patch(profile._id, {
        hasReceivedStarterGrant: true,
        starterGrantAt: now,
        updatedAt: now,
      })
    } else {
      await ctx.db.insert('onboardingProfiles', {
        userId,
        currentStep: 1,
        hasReceivedStarterGrant: true,
        starterGrantAt: now,
        updatedAt: now,
      })
    }

    // Ensure the nano-banana-2 pricing row exists (may not be seeded in dev).
    const pricing = await ctx.db
      .query('creditPricing')
      .withIndex('by_modelKey', (q) => q.eq('modelKey', 'nano-banana-2'))
      .unique()
    if (!pricing || !pricing.active) {
      await ctx.db.insert('creditPricing', {
        modelKey: 'nano-banana-2',
        creditsMc: 1_000,
        active: true,
        updatedAt: now,
      })
    }

    // Write the starter credit balance.
    await ctx.db.insert('creditBalances', {
      userId,
      planAllowanceMc: STARTER_CREDITS_MC,
      planUsedMc: 0,
      topupBalanceMc: 0,
      periodStart: now,
      // Starter credits don't expire by period; set a far-future sentinel so
      // the period-end display shows something reasonable.
      periodEnd: now + 365 * 24 * 60 * 60 * 1_000,
      version: 1,
      lastGrantedPeriodStart: now,
      lastGrantedPlanSlug: 'starter',
      updatedAt: now,
    })

    await ctx.db.insert('billingEvents', {
      userId,
      mutationName: 'activateStarterFlow',
      allowed: true,
      timestamp: now,
      context: 'credit-grant',
      metadata: {
        kind: 'credit-grant' as const,
        planSlug: 'starter',
        allowanceMc: STARTER_CREDITS_MC,
      },
    })
  },
})
