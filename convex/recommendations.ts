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
import type { Id } from './_generated/dataModel'

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
 * Home "What to make next" surface — a CROSS-PRODUCT feed. Pending
 * recommendations are gathered across ALL the user's products (each card is
 * self-describing via `productName`), plus a per-product summary of recent
 * starred winners. This is deliberately NOT scoped to a single selected product:
 * the suggestions are persisted per product and consuming one already routes to
 * its own product, so binding the whole section to one product would be wrong.
 */
export const getHomeSurface = query({
  args: {},
  handler: async (ctx) => {
    const empty = {
      recommendations: [] as Array<{
        _id: string
        key: string
        title: string
        description: string
        source: string
        priority: number
        angleCount: number
        productId: string
        productName: string
      }>,
      winnerProducts: [] as Array<{
        productId: string
        productName: string
        outputUrl: string
        winnerCount: number
      }>,
    }

    const userId = await getAuthUserId(ctx)
    if (!userId) return empty

    // Resolve product names once (and drop archived/missing products). Cached so
    // both recommendations and winners reuse the same lookups.
    const productCache = new Map<
      string,
      { name: string; archived: boolean } | null
    >()
    const resolveProduct = async (productId: string) => {
      if (!productCache.has(productId)) {
        const product = await ctx.db.get(productId as Id<'products'>)
        productCache.set(
          productId,
          product && product.userId === userId
            ? { name: product.name, archived: product.archivedAt !== undefined }
            : null,
        )
      }
      return productCache.get(productId) ?? null
    }

    // ── Recommendations across every product ──────────────────────────────
    const recRows = await ctx.db
      .query('adTestRecommendations')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .filter((q) =>
        q.and(
          q.eq(q.field('consumedAt'), undefined),
          q.eq(q.field('dismissedAt'), undefined),
        ),
      )
      .take(100)

    const sortedRecs = recRows.sort(
      (a, b) => a.concept.priority - b.concept.priority,
    )
    const recommendations: typeof empty.recommendations = []
    for (const r of sortedRecs) {
      if (recommendations.length >= 8) break
      const product = await resolveProduct(r.productId as string)
      if (!product || product.archived) continue
      recommendations.push({
        _id: r._id as string,
        key: r.concept.key,
        title: r.concept.title,
        description: r.concept.description,
        source: r.concept.source,
        priority: r.concept.priority,
        angleCount: r.concept.angles.length,
        productId: r.productId as string,
        productName: product.name,
      })
    }

    // ── Winners summarised per product (most-recent first, capped) ─────────
    const winnerGens = await ctx.db
      .query('templateGenerations')
      .withIndex('by_userId_status', (q) =>
        q.eq('userId', userId).eq('status', 'complete'),
      )
      .order('desc')
      .take(500)

    const winnerByProduct = new Map<
      string,
      { outputUrl: string; winnerCount: number }
    >()
    for (const g of winnerGens) {
      if (!g.isWinner || !g.outputUrl || !g.productId) continue
      const pid = g.productId as string
      const existing = winnerByProduct.get(pid)
      if (existing) {
        existing.winnerCount += 1
      } else {
        // First sighting = most-recent winner = representative thumbnail.
        winnerByProduct.set(pid, {
          outputUrl: g.outputUrl,
          winnerCount: 1,
        })
      }
    }

    const winnerProducts: typeof empty.winnerProducts = []
    for (const [pid, info] of winnerByProduct) {
      if (winnerProducts.length >= 3) break
      const product = await resolveProduct(pid)
      if (!product || product.archived) continue
      winnerProducts.push({
        productId: pid,
        productName: product.name,
        outputUrl: info.outputUrl,
        winnerCount: info.winnerCount,
      })
    }

    return { recommendations, winnerProducts }
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
