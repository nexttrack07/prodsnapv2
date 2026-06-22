/**
 * No-card starter Ad Test activation.
 *
 * `activateStarterFlow` is the single entry point called by the frontend when
 * a user clicks "Activate free test" on /onboarding?starter=1. It:
 *   1. Clones the configured sample product into the caller's account.
 *   2. Grants a one-time starter credit allowance (3 images = 3 000 mc).
 *   3. Creates a Starter Ad Test (1 concept × 3 placements) from the product's
 *      first marketing angle and starts generation.
 *
 * Guard: throws if the caller already has a creditBalances row — meaning they
 * have either subscribed to a paid plan or already ran the starter flow.
 *
 * Dependency note: full abuse controls and credit-period lifecycle belong to
 * issue #36. The idempotency guard here (creditBalances existence check) is
 * a lightweight first-pass; #36 will harden it.
 */
import { action, internalMutation, internalQuery } from './_generated/server'
import { api, internal } from './_generated/api'

// Starter test is always 1 concept × these 3 placements.
const STARTER_PLACEMENTS = ['feed_square', 'feed_vertical', 'story_reel'] as const

// 1 credit = 1 000 mc; exactly enough to generate 3 images.
const STARTER_CREDITS_MC = 3 * 1_000

// ─── Public action ────────────────────────────────────────────────────────────

export const activateStarterFlow = action({
  args: {},
  handler: async (ctx): Promise<{ adTestId: string; productId: string }> => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')

    // Idempotency: reject if already activated (has a credit balance row).
    const alreadyActivated = await ctx.runQuery(internal.activation._hasCredits, {})
    if (alreadyActivated) throw new Error('Starter test already activated')

    // 1. Clone the sample product. Throws if user already has products or
    //    the sample isn't configured — the frontend surfaces these errors.
    const productId = await ctx.runMutation(api.products.createProductFromSample, {})

    // 2. Read the cloned product to pick its first marketing angle.
    const product = await ctx.runQuery(api.products.getProductWithStats, { productId })
    if (!product?.marketingAngles?.length) {
      throw new Error('Sample product has no marketing angles — contact support.')
    }
    const angle = product.marketingAngles[0]

    // 3. Grant the starter credit allowance.
    await ctx.runMutation(internal.activation._grantStarterCredits, {})

    // 4. Create the starter Ad Test draft.
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

export const _hasCredits = internalQuery({
  args: {},
  handler: async (ctx): Promise<boolean> => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return false
    const balance = await ctx.db
      .query('creditBalances')
      .withIndex('by_userId', (q) => q.eq('userId', identity.tokenIdentifier))
      .unique()
    return !!balance
  },
})

export const _grantStarterCredits = internalMutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')
    const userId = identity.tokenIdentifier

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
        updatedAt: Date.now(),
      })
    }

    const now = Date.now()

    await ctx.db.insert('creditBalances', {
      userId,
      planAllowanceMc: STARTER_CREDITS_MC,
      planUsedMc: 0,
      topupBalanceMc: 0,
      periodStart: now,
      periodEnd: now + 30 * 24 * 60 * 60 * 1_000,
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
