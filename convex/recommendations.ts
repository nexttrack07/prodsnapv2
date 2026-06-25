/**
 * Home recommendations — persisted "what to generate next" angle concepts for a
 * product. In the flat model these no longer create an ad test; consuming one
 * just marks it used and returns the concept so the UI can deep-link the product
 * page's generate wizard (prefilled with the angle). Auth derived from identity.
 */
import { v } from 'convex/values'
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server'

async function getAuthUserId(
  ctx: QueryCtx | MutationCtx,
): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity()
  return identity?.tokenIdentifier ?? null
}

async function requireAuth(ctx: QueryCtx | MutationCtx): Promise<string> {
  const userId = await getAuthUserId(ctx)
  if (!userId) throw new Error('Not authenticated')
  return userId
}

/**
 * Home surface: the focus product's pending recommendations + its recent
 * starred winners (flat creatives). No ad-test container anymore.
 */
export const getHomeSurface = query({
  args: {},
  handler: async (ctx) => {
    const empty = {
      focusProductId: null as null | string,
      productName: null as null | string,
      recommendations: [] as Array<{
        _id: string
        key: string
        title: string
        description: string
        source: string
        priority: number
        angleCount: number
      }>,
      recentWinners: [] as Array<{
        generationId: string
        outputUrl: string
        aspectRatio: string
      }>,
    }

    const userId = await getAuthUserId(ctx)
    if (!userId) return empty

    const products = await ctx.db
      .query('products')
      .withIndex('by_userId_archived', (q) =>
        q.eq('userId', userId).eq('archivedAt', undefined),
      )
      .order('desc')
      .take(1)
    const focusProduct = products[0]
    if (!focusProduct) return empty

    const recRows = await ctx.db
      .query('adTestRecommendations')
      .withIndex('by_productId_consumedAt', (q) =>
        q.eq('productId', focusProduct._id).eq('consumedAt', undefined),
      )
      .filter((q) => q.eq(q.field('dismissedAt'), undefined))
      .take(50)
    const recommendations = recRows
      .filter((r) => r.userId === userId)
      .sort((a, b) => a.concept.priority - b.concept.priority)
      .slice(0, 6)
      .map((r) => ({
        _id: r._id as string,
        key: r.concept.key,
        title: r.concept.title,
        description: r.concept.description,
        source: r.concept.source,
        priority: r.concept.priority,
        angleCount: r.concept.angles.length,
      }))

    const gens = await ctx.db
      .query('templateGenerations')
      .withIndex('by_product', (q) => q.eq('productId', focusProduct._id))
      .order('desc')
      .take(200)
    const recentWinners = gens
      .filter((g) => g.isWinner && g.status === 'complete' && !!g.outputUrl)
      .slice(0, 6)
      .map((g) => ({
        generationId: g._id as string,
        outputUrl: g.outputUrl as string,
        aspectRatio: g.aspectRatio ?? '1:1',
      }))

    return {
      focusProductId: focusProduct._id as string,
      productName: focusProduct.name,
      recommendations,
      recentWinners,
    }
  },
})

/**
 * Marks a recommendation used and returns its concept (productId + first angle)
 * so the UI can deep-link the product page's generate wizard. No test created.
 */
export const consumeRecommendation = mutation({
  args: { recommendationId: v.id('adTestRecommendations') },
  handler: async (ctx, { recommendationId }) => {
    const userId = await requireAuth(ctx)
    const rec = await ctx.db.get(recommendationId)
    if (!rec || rec.userId !== userId) throw new Error('Recommendation not found')
    if (rec.consumedAt !== undefined) throw new Error('Recommendation has already been used')
    if (rec.dismissedAt !== undefined) throw new Error('Recommendation is no longer available')

    const now = Date.now()
    await ctx.db.patch(recommendationId, { consumedAt: now, updatedAt: now })

    const angle = rec.concept.angles[0]
    return {
      productId: rec.productId,
      title: rec.concept.title,
      angle: angle
        ? {
            key: angle.key,
            title: angle.title,
            description: angle.description,
            hook: angle.hook,
            suggestedAdStyle: angle.suggestedAdStyle,
          }
        : null,
    }
  },
})

/** Dismisses a recommendation so it stops appearing on Home. */
export const dismissRecommendation = mutation({
  args: { recommendationId: v.id('adTestRecommendations') },
  handler: async (ctx, { recommendationId }) => {
    const userId = await requireAuth(ctx)
    const rec = await ctx.db.get(recommendationId)
    if (!rec || rec.userId !== userId) throw new Error('Recommendation not found')
    const now = Date.now()
    await ctx.db.patch(recommendationId, { dismissedAt: now, updatedAt: now })
    return null
  },
})
