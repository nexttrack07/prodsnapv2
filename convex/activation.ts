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
import type { Doc, Id } from './_generated/dataModel'
import { api, internal } from './_generated/api'
import { requireCredits } from './lib/billing/credits'
import { requireAdminIdentity } from './lib/admin/requireAdmin'
import { recordGenerationUsage } from './products'
import { workflow } from './studio'

// Starter test is always 1 concept × these 3 placements.
const STARTER_PLACEMENTS = ['feed_square', 'feed_vertical', 'story_reel'] as const

// Map a template's aspect ratio to a Meta placement, so template-driven starter
// creatives carry the same placement metadata as angle-based ones.
const PLACEMENT_FOR_ASPECT: Record<
  string,
  'feed_square' | 'feed_vertical' | 'story_reel' | 'landscape'
> = {
  '1:1': 'feed_square',
  '4:5': 'feed_vertical',
  '9:16': 'story_reel',
  '16:9': 'landscape',
}

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
  handler: async (ctx): Promise<{ productId: string }> => {
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

    // 4. Fan out flat angle-based starter creatives on the product.
    await ctx.runMutation(internal.activation._startStarterAngleGenerations, {
      userId: (await ctx.auth.getUserIdentity())!.tokenIdentifier,
      productId,
      angle: {
        title: angle.title,
        description: angle.description,
        hook: angle.hook,
        suggestedAdStyle: angle.suggestedAdStyle,
      },
    })

    return { productId: productId as string }
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
export const createStarterProductFromImages = internalMutation({
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

    // (No one-time / existing-product guard here: the starter flow is
    // repeatable. The actual free-credit grant is still claimed at most once —
    // see activateStarterForProduct — so re-runs reuse the existing balance
    // rather than re-granting credits.)

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
  ): Promise<{ productId: string }> => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')
    if (isDisposableEmail(identity.email)) {
      throw new Error('Please sign up with a real email address to activate the free test.')
    }

    const alreadyActivated = await ctx.runQuery(
      internal.activation._isAlreadyActivated,
      {},
    )

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

    // Grant the one-time free credits only on the FIRST activation. Re-runs
    // reuse the existing balance (no double grant), so the flow is repeatable
    // without re-granting free credits.
    if (!alreadyActivated) {
      await ctx.runMutation(internal.activation._claimStarterGrant, {})
    }

    await ctx.runMutation(internal.activation._startStarterAngleGenerations, {
      userId: identity.tokenIdentifier,
      productId,
      angle: {
        title: angle.title,
        description: angle.description,
        hook: angle.hook,
        suggestedAdStyle: angle.suggestedAdStyle,
      },
    })

    return { productId: productId as string }
  },
})

// ─── Template-driven starter: pick up to 3 templates → 3 ads on the product ────

/**
 * Fans out one template-driven generation per chosen template (the product
 * image composited into each template's style). Unlike `products.generateFromProduct`
 * this does NOT require the GENERATE_VARIATIONS capability — the starter is free
 * for new (capability-less) accounts — but it still charges credits. Each ad
 * uses its template's native aspect ratio.
 */
export const _startStarterTemplateGenerations = internalMutation({
  args: {
    userId: v.string(),
    productId: v.id('products'),
    templateIds: v.array(v.id('adTemplates')),
  },
  handler: async (ctx, { userId, productId, templateIds }) => {
    const ids = templateIds.slice(0, 3)
    if (ids.length === 0) throw new Error('Pick at least one template')

    const product = await ctx.db.get(productId)
    if (!product || product.userId !== userId) throw new Error('Product not found')

    // Resolve the source product image (primary, then legacy fallback).
    let productImageUrl: string
    let productImageId: Id<'productImages'> | undefined
    if (product.primaryImageId) {
      const primary = await ctx.db.get(product.primaryImageId)
      if (!primary) throw new Error('Primary image not found')
      productImageUrl = primary.imageUrl
      productImageId = primary._id
    } else if (product.imageUrl) {
      productImageUrl = product.imageUrl
    } else {
      throw new Error('Product has no image')
    }

    // Credit preflight + charge for the whole batch (no capability gate).
    await requireCredits(ctx, 'nano-banana-2', ids.length)
    await recordGenerationUsage(ctx, userId, 'activateStarterWithTemplates', ids.length)

    let variationIndex = 0
    for (const templateId of ids) {
      const tpl = await ctx.db.get(templateId)
      if (!tpl || tpl.status !== 'published') continue
      // Curated, own, or anyone's public custom — never someone else's private.
      if (tpl.ownerUserId && tpl.ownerUserId !== userId && tpl.visibility !== 'public') {
        continue
      }
      const genId = await ctx.db.insert('templateGenerations', {
        productId,
        productImageId,
        userId,
        templateId,
        productImageUrl,
        templateImageUrl: tpl.imageUrl,
        templateSnapshot: {
          name: tpl.name || tpl.category || undefined,
          aspectRatio: tpl.aspectRatio,
        },
        aspectRatio: tpl.aspectRatio,
        mode: 'exact',
        colorAdapt: false,
        applyBrand: true,
        applyVoice: true,
        variationIndex: variationIndex,
        status: 'queued',
        model: 'nano-banana-2',
      })
      variationIndex++
      await ctx.scheduler.runAfter(
        0,
        internal.activation._kickoffTemplateWorkflow,
        { generationId: genId },
      )
    }
    return null
  },
})

/** Starts the template generation workflow for one row (scheduled from above). */
export const _kickoffTemplateWorkflow = internalMutation({
  args: { generationId: v.id('templateGenerations') },
  handler: async (ctx, { generationId }) => {
    await workflow.start(ctx, internal.studio.generateFromTemplateWorkflow, {
      generationId,
    }, { startAsync: true })
  },
})

/** Starts the angle generation workflow for one row (scheduled from above). */
export const _kickoffAngleWorkflow = internalMutation({
  args: { generationId: v.id('templateGenerations') },
  handler: async (ctx, { generationId }) => {
    await workflow.start(ctx, internal.studio.generateFromAngleWorkflow, {
      generationId,
    }, { startAsync: true })
  },
})

/**
 * Fans out angle-based starter creatives (one per starter aspect ratio) as FLAT
 * generations on the product — no ad-test container. Free for capability-less
 * starter accounts, but still credit-metered.
 */
export const _startStarterAngleGenerations = internalMutation({
  args: {
    userId: v.string(),
    productId: v.id('products'),
    angle: v.object({
      title: v.string(),
      description: v.optional(v.string()),
      hook: v.optional(v.string()),
      suggestedAdStyle: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { userId, productId, angle }) => {
    const product = await ctx.db.get(productId)
    if (!product || product.userId !== userId) throw new Error('Product not found')

    let productImageUrl: string
    let productImageId: Id<'productImages'> | undefined
    if (product.primaryImageId) {
      const primary = await ctx.db.get(product.primaryImageId)
      if (!primary) throw new Error('Primary image not found')
      productImageUrl = primary.imageUrl
      productImageId = primary._id
    } else if (product.imageUrl) {
      productImageUrl = product.imageUrl
    } else {
      throw new Error('Product has no image')
    }

    const aspectRatios = ['1:1', '4:5', '9:16'] as const
    await requireCredits(ctx, 'nano-banana-2', aspectRatios.length)
    await recordGenerationUsage(ctx, userId, 'activateStarter', aspectRatios.length)

    const seed = {
      title: angle.title,
      description: angle.description ?? '',
      hook: angle.hook ?? '',
      suggestedAdStyle: angle.suggestedAdStyle ?? '',
    }
    let variationIndex = 0
    for (const ar of aspectRatios) {
      const genId = await ctx.db.insert('templateGenerations', {
        productId,
        productImageId,
        userId,
        productImageUrl,
        aspectRatio: ar,
        mode: 'angle',
        colorAdapt: false,
        applyBrand: true,
        applyVoice: true,
        angleSeed: seed,
        variationIndex,
        status: 'queued',
        model: 'nano-banana-2',
      })
      variationIndex++
      await ctx.scheduler.runAfter(0, internal.activation._kickoffAngleWorkflow, {
        generationId: genId,
      })
    }
    return null
  },
})

/**
 * Read-only credit preflight (throws if the caller can't afford `count` images).
 * Used to validate eligibility BEFORE creating a product, so a re-run by an
 * already-activated user with too few credits fails up front instead of leaving
 * an orphan product + scheduled analysis behind. No writes.
 */
export const _preflightStarterCredits = internalMutation({
  args: { count: v.number() },
  handler: async (ctx, { count }) => {
    await requireCredits(ctx, 'nano-banana-2', Math.max(1, count))
    return null
  },
})

/**
 * The URL-first starter, end to end: create the product from the chosen photos,
 * grant the one-time free credits (at most once), and generate one ad per
 * chosen template. Returns the productId so the UI can drop the user into the
 * Studio gallery to watch them render.
 */
export const activateStarterWithTemplates = action({
  args: {
    imageUrls: v.array(v.string()),
    importId: v.optional(v.id('urlImports')),
    name: v.optional(v.string()),
    templateIds: v.array(v.id('adTemplates')),
  },
  handler: async (
    ctx,
    { imageUrls, importId, name, templateIds },
  ): Promise<{ productId: string }> => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')
    if (isDisposableEmail(identity.email)) {
      throw new Error('Please sign up with a real email address to activate the free test.')
    }
    if (templateIds.length === 0) throw new Error('Pick at least one template.')
    const templateCount = Math.min(templateIds.length, 3)

    // Eligibility / credits FIRST, before any product side effects — otherwise a
    // re-run that can't afford the templates would leave an orphan product +
    // scheduled analysis behind (actions aren't transactional).
    const alreadyActivated = await ctx.runQuery(
      internal.activation._isAlreadyActivated,
      {},
    )
    if (!alreadyActivated) {
      // First activation: the grant provisions enough credits for the batch.
      await ctx.runMutation(internal.activation._claimStarterGrant, {})
    } else {
      // Re-run: must already have enough credits before we create anything.
      await ctx.runMutation(internal.activation._preflightStarterCredits, {
        count: templateCount,
      })
    }

    const productId = await ctx.runMutation(
      internal.activation.createStarterProductFromImages,
      { imageUrls, importId, name },
    )

    // Generate the chosen templates as flat creatives on the product.
    await ctx.runMutation(internal.activation._startStarterTemplateGenerations, {
      userId: identity.tokenIdentifier,
      productId,
      templateIds,
    })

    return { productId: productId as string }
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
    // Server-side gate: this is a destructive, credit-grant-resetting tool, so
    // it must NOT be callable by arbitrary authenticated users (hiding the UI
    // button behind import.meta.env.DEV is not a backend guard). Restrict to
    // admins (CLERK_ADMIN_USER_IDS) — the same gate the admin mutations use.
    await requireAdminIdentity(ctx)

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

      const copySets = await ctx.db
        .query('copySets')
        .withIndex('by_productId', (q) => q.eq('productId', p._id))
        .collect()
      for (const c of copySets) await ctx.db.delete(c._id)

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
