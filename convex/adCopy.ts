/**
 * Ad copy generation. Given a product (with analysis) + angle index + brand
 * kit, returns headlines / primary texts / CTAs for the user to copy into
 * their ad. The action is fire-and-return (no persistence yet — generation is
 * cheap and users can re-run if they lose the results).
 */
import { v } from 'convex/values'
import { action, internalMutation, internalQuery, type ActionCtx } from './_generated/server'
import { api, internal } from './_generated/api'

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
      allowed: true,
      timestamp: Date.now(),
      context: 'usage',
    })
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
      throw new Error('Too many requests — please wait a moment before generating again.')
    }

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
    const brandKit = await ctx.runQuery(api.brandKits.getBrandKit, {})

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
