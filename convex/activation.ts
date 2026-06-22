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
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
} from './_generated/server'
import { v } from 'convex/values'
import type { Doc } from './_generated/dataModel'
import { api, internal } from './_generated/api'

// Starter test is always 1 concept × these 3 placements.
const STARTER_PLACEMENTS = ['feed_square', 'feed_vertical', 'story_reel'] as const

// One-time free grant for new accounts (no card, no trial). 1 credit = 1 000 mc;
// nano-banana-2 costs 10 credits (10 000 mc) per image, so 100 credits =
// 100 000 mc = 10 images (~$0.80 COGS). The starter Ad Test spends 30 credits
// (3 images); the remainder lets the user keep generating before the paywall.
const STARTER_CREDITS_MC = 100 * 1_000

// Per-image cost in mc — must match the seeded creditPricing row
// (lib/billing/seedPricing.ts). Used only as a fallback insert below.
const NANO_BANANA_PRICE_MC = 10_000

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

    // ── Pre-eligibility check (before any side effects) ───────────────────
    // Run the read-only eligibility check BEFORE calling createProductFromSample
    // so an ineligible user (e.g. already has a creditBalances row) is rejected
    // before the clone is committed. The atomic claim in _claimStarterGrant
    // remains the authoritative guard; this is an early-exit optimisation.
    const alreadyActivated = await ctx.runQuery(
      internal.activation._isAlreadyActivated,
      {},
    )
    if (alreadyActivated) {
      throw new Error('Starter test already activated for this account.')
    }

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

// ─── URL-first starter (paste your product URL → free test on YOUR product) ───

/**
 * Creates the starter user's product from a completed URL import, bypassing the
 * plan's product limit (free_user has a limit of 0). This is the one-time
 * starter on-ramp, so it's tightly guarded: the import must be owned + done with
 * at least one image, the user must have no products yet, and must not have
 * already claimed the starter grant. Schedules analysis (→ marketing angles)
 * exactly like createProductRich. Returns the new productId.
 */
export const createStarterProductFromImages = mutation({
  args: {
    // The user-chosen product photos (first = hero/primary). Must be images we
    // host on R2 (from a URL import or a manual upload) — never arbitrary URLs.
    imageUrls: v.array(v.string()),
    // Optional: the URL import these were curated from, used only to carry
    // distilled metadata (description/category/price/reviews) onto the product.
    importId: v.optional(v.id('urlImports')),
    // Optional product name (manual-upload path); falls back to the import's
    // distilled name, then a default.
    name: v.optional(v.string()),
  },
  handler: async (ctx, { imageUrls, importId, name }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')
    const userId = identity.tokenIdentifier

    if (imageUrls.length === 0) {
      throw new Error('Pick at least one product photo to continue.')
    }
    const urls = imageUrls.slice(0, 10)

    // Security: only accept images we host (R2). Blocks arbitrary/SSRF URLs the
    // client could otherwise pass in. Skipped only if R2_PUBLIC_URL is unset.
    const r2Public = process.env.R2_PUBLIC_URL
    if (r2Public) {
      for (const u of urls) {
        if (!u.startsWith(r2Public)) throw new Error('Unsupported image URL')
      }
    }

    // Optional import row, for distilled metadata only.
    let imp: Doc<'urlImports'> | null = null
    if (importId) {
      const row = await ctx.db.get(importId)
      if (!row || row.userId !== userId) throw new Error('Import not found')
      imp = row
    }

    // One-time, fresh-user guard.
    const existingProduct = await ctx.db
      .query('products')
      .withIndex('by_userId_archived', (q) =>
        q.eq('userId', userId).eq('archivedAt', undefined),
      )
      .first()
    if (existingProduct) throw new Error('You already have a product.')

    const profile = await ctx.db
      .query('onboardingProfiles')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique()
    if (profile?.hasReceivedStarterGrant) {
      throw new Error('Starter test already activated for this account.')
    }

    const productName =
      (name?.trim() || imp?.distilledName?.trim() || 'My product').slice(0, 80) ||
      'My product'
    const productId = await ctx.db.insert('products', {
      name: productName,
      status: 'analyzing',
      userId,
      imageUrl: urls[0],
      ...(imp?.distilledDescription ? { productDescription: imp.distilledDescription } : {}),
      ...(imp?.distilledCategory ? { category: imp.distilledCategory } : {}),
      ...(imp?.distilledPrice != null ? { price: imp.distilledPrice } : {}),
      ...(imp?.distilledCurrency ? { currency: imp.distilledCurrency } : {}),
      ...(imp?.distilledTags && imp.distilledTags.length > 0
        ? { tags: imp.distilledTags.slice(0, 20) }
        : {}),
      ...(imp?.distilledAiNotes ? { aiNotes: imp.distilledAiNotes } : {}),
      ...(imp?.distilledReviewSnippets && imp.distilledReviewSnippets.length > 0
        ? { customerLanguage: imp.distilledReviewSnippets }
        : {}),
    })

    const imageIds = []
    for (const url of urls) {
      imageIds.push(
        await ctx.db.insert('productImages', {
          productId,
          userId,
          imageUrl: url,
          type: 'original',
          status: 'ready',
        }),
      )
    }
    await ctx.db.patch(productId, { primaryImageId: imageIds[0] })
    await ctx.scheduler.runAfter(0, internal.products.runProductAnalysis, {
      productId,
    })
    return productId
  },
})

/**
 * Activates the starter Ad Test on an existing, owned, analyzed product (the one
 * the user just imported). Same grant + draft + generation as
 * `activateStarterFlow`, but without cloning the sample. Idempotent via the
 * onboarding-profile grant flag.
 */
export const activateStarterForProduct = action({
  args: { productId: v.id('products') },
  handler: async (
    ctx,
    { productId },
  ): Promise<{ adTestId: string; productId: string }> => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')
    if (isDisposableEmail(identity.email)) {
      throw new Error('Please sign up with a real email address to activate the free test.')
    }

    const alreadyActivated = await ctx.runQuery(
      internal.activation._isAlreadyActivated,
      {},
    )
    if (alreadyActivated) {
      throw new Error('Starter test already activated for this account.')
    }

    const product = await ctx.runQuery(api.products.getProductWithStats, {
      productId,
    })
    if (!product) throw new Error('Product not found')
    if (product.status !== 'ready') {
      throw new Error('Product analysis is not ready yet')
    }
    if (!product.marketingAngles?.length) {
      throw new Error('Product has no marketing angles yet')
    }
    const angle = product.marketingAngles[0]

    await ctx.runMutation(internal.activation._claimStarterGrant, {})

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

    await ctx.runMutation(api.adTests.startGeneration, { adTestId })

    return { adTestId: adTestId as string, productId: productId as string }
  },
})

// ─── Dev-only: reset the caller's activation so the starter flow can re-run ────

/**
 * LOCAL TESTING ONLY. Wipes the signed-in user's activation state — products
 * and all their children, ad tests, recommendations, url imports, the credit
 * balance, and the one-time starter-grant flag — so you can run landing → free
 * test repeatedly on a single account instead of signing up new ones.
 *
 * Self-scoped: it only ever touches the CALLER's own data, and the UI button
 * that calls it renders only in a Vite dev build. (Temporary testing tool —
 * revert before any real launch.)
 */
export const resetMyActivation = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')
    const userId = identity.tokenIdentifier

    const products = await ctx.db
      .query('products')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect()

    for (const p of products) {
      const imgs = await ctx.db
        .query('productImages')
        .withIndex('by_product', (q) => q.eq('productId', p._id))
        .collect()
      for (const i of imgs) await ctx.db.delete(i._id)

      const tests = await ctx.db
        .query('adTests')
        .withIndex('by_productId', (q) => q.eq('productId', p._id))
        .collect()
      for (const t of tests) {
        const copySets = await ctx.db
          .query('adTestCopySets')
          .withIndex('by_adTestId', (q) => q.eq('adTestId', t._id))
          .collect()
        for (const c of copySets) await ctx.db.delete(c._id)
        const notes = await ctx.db
          .query('adTestPerformanceNotes')
          .withIndex('by_adTestId', (q) => q.eq('adTestId', t._id))
          .collect()
        for (const n of notes) await ctx.db.delete(n._id)
        await ctx.db.delete(t._id)
      }

      const recs = await ctx.db
        .query('adTestRecommendations')
        .withIndex('by_productId', (q) => q.eq('productId', p._id))
        .collect()
      for (const r of recs) await ctx.db.delete(r._id)

      const gens = await ctx.db
        .query('templateGenerations')
        .withIndex('by_product', (q) => q.eq('productId', p._id))
        .collect()
      for (const g of gens) await ctx.db.delete(g._id)

      await ctx.db.delete(p._id)
    }

    const imports = await ctx.db
      .query('urlImports')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect()
    for (const im of imports) await ctx.db.delete(im._id)

    const balance = await ctx.db
      .query('creditBalances')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique()
    if (balance) await ctx.db.delete(balance._id)

    const profile = await ctx.db
      .query('onboardingProfiles')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique()
    if (profile) {
      await ctx.db.patch(profile._id, {
        hasReceivedStarterGrant: undefined,
        starterGrantAt: undefined,
        completedAt: undefined,
        currentStep: 1,
        updatedAt: Date.now(),
      })
    }

    return { deletedProducts: products.length }
  },
})

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Read-only pre-check: returns true if the caller is already ineligible for
 * a starter grant. Called before createProductFromSample so an ineligible
 * user is rejected before any side-effectful mutations run.
 */
export const _isAlreadyActivated = internalQuery({
  args: {},
  handler: async (ctx): Promise<boolean> => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return true
    const userId = identity.tokenIdentifier

    const profile = await ctx.db
      .query('onboardingProfiles')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique()
    if (profile?.hasReceivedStarterGrant) return true

    const balance = await ctx.db
      .query('creditBalances')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique()
    return !!balance
  },
})

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

    // Ensure the nano-banana-2 pricing row exists and is active.
    // Patch an existing-but-inactive row rather than inserting a duplicate —
    // billing helpers use .unique() on by_modelKey and throw on duplicates.
    const pricing = await ctx.db
      .query('creditPricing')
      .withIndex('by_modelKey', (q) => q.eq('modelKey', 'nano-banana-2'))
      .unique()
    if (!pricing) {
      await ctx.db.insert('creditPricing', {
        modelKey: 'nano-banana-2',
        creditsMc: NANO_BANANA_PRICE_MC,
        active: true,
        updatedAt: now,
      })
    } else if (!pricing.active) {
      await ctx.db.patch(pricing._id, { active: true, updatedAt: now })
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
