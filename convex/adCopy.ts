/**
 * Ad copy generation. Given a product (with analysis) + angle index + brand
 * kit, returns headlines / primary texts / CTAs for the user to copy into
 * their ad. The action is fire-and-return (no persistence yet — generation is
 * cheap and users can re-run if they lose the results).
 */
import { v } from 'convex/values'
import { action, internalMutation, internalQuery, type ActionCtx } from './_generated/server'
import { api, internal } from './_generated/api'
import { billingError } from './lib/billing/errors'
import { requireAdCopyLimit } from './lib/billing'
import { CAPABILITIES } from './lib/billing/capabilities'

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_CALLS = 20

export const checkAdCopyRateLimit = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const since = Date.now() - RATE_LIMIT_WINDOW_MS
    const recent = await ctx.db
      .query('billingEvents')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .filter((q) =>
        q.and(
          q.gte(q.field('timestamp'), since),
          q.or(
            q.eq(q.field('context'), 'usage'),
            q.eq(q.field('context'), 'rate-limited'),
          ),
        ),
      )
      .collect()
    return recent.length
  },
})

export const recordAdCopyRateLimited = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    await ctx.db.insert('billingEvents', {
      userId,
      mutationName: 'generateAdCopy',
      allowed: false,
      timestamp: Date.now(),
      context: 'rate-limited',
    })
  },
})

export const recordAdCopyUsage = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    await ctx.db.insert('billingEvents', {
      userId,
      mutationName: 'generateAdCopy',
      capability: CAPABILITIES.AD_COPY,
      allowed: true,
      timestamp: Date.now(),
      units: 1,
      context: 'usage',
    })
  },
})

/**
 * Pre-LLM gate: throws if the caller has exceeded their plan's monthly
 * ad-copy quota. Called from the action before the LLM round-trip so the
 * user gets an upgrade prompt instead of a wasted token spend.
 */
export const enforceAdCopyQuota = internalMutation({
  args: {},
  handler: async (ctx) => {
    await requireAdCopyLimit(ctx, 'generateAdCopy')
  },
})

export const generateAdCopy = action({
  args: {
    productId: v.id('products'),
    angleIndex: v.number(),
  },
  handler: async (
    ctx: ActionCtx,
    { productId, angleIndex },
  ): Promise<{
    headlines: string[]
    primaryTexts: string[]
    ctas: string[]
  }> => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')
    const userId = identity.tokenIdentifier

    // TOCTOU: query-then-act allows a small overshoot under concurrent calls.
    // Same pattern as enforceGenerationRateLimit in products.ts; acceptable for
    // 20/min thresholds. Migrate to the Convex Rate Limiter component for tighter
    // guarantees later.
    const recentCount = await ctx.runQuery(internal.adCopy.checkAdCopyRateLimit, { userId })
    if (recentCount >= RATE_LIMIT_MAX_CALLS) {
      await ctx.runMutation(internal.adCopy.recordAdCopyRateLimited, { userId })
      throw billingError(
        'RATE_LIMIT',
        'Too many requests — please wait a moment before generating again.',
      )
    }

    // Monthly ad-copy quota gate (per-tier limit, separate from image-gen credits).
    await ctx.runMutation(internal.adCopy.enforceAdCopyQuota, {})

    const product = await ctx.runQuery(api.products.getProduct, { productId })
    // Returns "Product not found" rather than "Not authorized" to avoid leaking
    // product existence to non-owners. getProduct returns null when the product
    // belongs to a different user.
    if (!product) throw new Error('Product not found')
    if (product.status !== 'ready') {
      throw new Error('Product analysis is not ready yet')
    }
    if (!product.marketingAngles || product.marketingAngles.length === 0) {
      throw new Error('No marketing angles available — re-run analysis first')
    }
    if (angleIndex < 0 || angleIndex >= product.marketingAngles.length) {
      throw new Error('Invalid angle index')
    }

    const angle = product.marketingAngles[angleIndex]
    const brandKit = await ctx.runQuery(internal.brandKits.getBrandKitForProductInternal, {
      userId,
      productId,
    })

    const result = await ctx.runAction(internal.ai.generateAdCopyText, {
      productName: product.name,
      productDescription: product.productDescription,
      targetAudience: product.targetAudience,
      valueProposition: product.valueProposition,
      angle: {
        title: angle.title,
        description: angle.description,
        hook: angle.hook,
        suggestedAdStyle: angle.suggestedAdStyle,
      },
      brandVoice: brandKit?.voice,
      brandTagline: brandKit?.tagline,
    })

    // Usage recorded only on success — failed AI calls don't count against the
    // rate limit. If we want to also rate-limit error bursts, move this above the
    // generateAdCopyText call and treat it as an optimistic reservation.
    await ctx.runMutation(internal.adCopy.recordAdCopyUsage, { userId })

    return result
  },
})

/**
 * Per-generation, opt-in ad copy. The user clicks "Write ad copy" on a
 * specific ad in the AdDetailPanel; we build copy from that generation's
 * context (angleSeed if present, plus product + brand kit) and save it on
 * the row. Replaces the now-removed auto-fire path that ran inside the
 * image-generation workflow.
 */
export const generateAdCopyForGeneration = action({
  args: { generationId: v.id('templateGenerations') },
  handler: async (
    ctx: ActionCtx,
    { generationId },
  ): Promise<{
    headlines: string[]
    primaryTexts: string[]
    ctas: string[]
  }> => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')
    const userId = identity.tokenIdentifier

    const recentCount = await ctx.runQuery(internal.adCopy.checkAdCopyRateLimit, { userId })
    if (recentCount >= RATE_LIMIT_MAX_CALLS) {
      await ctx.runMutation(internal.adCopy.recordAdCopyRateLimited, { userId })
      throw billingError(
        'RATE_LIMIT',
        'Too many requests — please wait a moment before generating again.',
      )
    }

    // Monthly ad-copy quota gate (per-tier limit, separate from image-gen credits).
    await ctx.runMutation(internal.adCopy.enforceAdCopyQuota, {})

    // Ownership check via the parent generation row.
    const gen = await ctx.runQuery(internal.adCopy.getGenerationOwner, { generationId })
    if (!gen) throw new Error('Ad not found')
    if (gen.userId && gen.userId !== userId) throw new Error('Not authorized')

    const result = await ctx.runAction(internal.ai.composeAdCopyForGeneration, { generationId })
    if (!result) {
      throw new Error('Could not compose copy — product analysis may be missing or incomplete.')
    }

    await ctx.runMutation(internal.studio.saveAdCopyOnGeneration, {
      generationId,
      headlines: result.headlines,
      primaryTexts: result.primaryTexts,
      ctas: result.ctas,
    })

    await ctx.runMutation(internal.adCopy.recordAdCopyUsage, { userId })

    return result
  },
})

/** Internal — minimal ownership lookup for the public action above. */
export const getGenerationOwner = internalQuery({
  args: { generationId: v.id('templateGenerations') },
  handler: async (ctx, { generationId }) => {
    const row = await ctx.db.get(generationId)
    if (!row) return null
    return { userId: row.userId ?? null }
  },
})
