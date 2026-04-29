/**
 * Queries and mutations for individual templateGeneration rows.
 * Used by the ad detail panel / ad detail page.
 */
import { v } from 'convex/values'
import { paginationOptsValidator } from 'convex/server'
import { mutation, query, type QueryCtx, type MutationCtx } from './_generated/server'

// ─── Auth helpers (mirrors products.ts) ──────────────────────────────────────

async function requireAuth(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error('Not authenticated')
  return identity.tokenIdentifier
}

async function getAuthUserId(ctx: QueryCtx | MutationCtx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity()
  return identity?.tokenIdentifier ?? null
}

// ─── Queries ─────────────────────────────────────────────────────────────────

/**
 * Fetches a single ad (templateGeneration) by ID, including the parent
 * product's name and primary image URL. Returns null when the ad doesn't
 * exist or the caller doesn't own it.
 */
export const getAdById = query({
  args: { adId: v.id('templateGenerations') },
  handler: async (ctx, { adId }) => {
    const userId = await getAuthUserId(ctx)
    const ad = await ctx.db.get(adId)
    if (!ad) return null

    // Ownership check via the parent product
    if (ad.productId) {
      const product = await ctx.db.get(ad.productId)
      if (!product) return null
      if (product.userId && product.userId !== userId) return null

      // Resolve product's primary image URL for the panel header
      let productImageUrl: string | undefined
      if (product.primaryImageId) {
        const img = await ctx.db.get(product.primaryImageId)
        productImageUrl = img?.imageUrl
      }
      productImageUrl = productImageUrl ?? product.imageUrl

      return {
        ...ad,
        productName: product.name,
        productImageUrl,
      }
    }

    // Legacy ad without productId — check userId directly
    if (ad.userId && ad.userId !== userId) return null
    return { ...ad, productName: null, productImageUrl: null }
  },
})

/**
 * Paginated query returning all completed ads for the authenticated user,
 * newest first. Each row is enriched with the parent product's name and
 * primary image URL (same pattern as getAdById).
 */
export const listAllAdsForUser = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) {
      return { page: [], isDone: true, continueCursor: '' }
    }

    const result = await ctx.db
      .query('templateGenerations')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .order('desc')
      .paginate(paginationOpts)

    // Filter to complete ads only, then enrich with product data
    const completePage = result.page.filter(
      (ad) => ad.status === 'complete' && !!ad.outputUrl,
    )

    // Batch-lookup unique products referenced by this page
    const productIds = [
      ...new Set(
        completePage
          .map((ad) => ad.productId)
          .filter((id): id is NonNullable<typeof id> => !!id),
      ),
    ]
    const productMap = new Map<
      string,
      { name: string; imageUrl: string | undefined }
    >()
    for (const pid of productIds) {
      const product = await ctx.db.get(pid)
      if (product) {
        let imageUrl: string | undefined
        if (product.primaryImageId) {
          const img = await ctx.db.get(product.primaryImageId)
          imageUrl = img?.imageUrl
        }
        imageUrl = imageUrl ?? product.imageUrl
        productMap.set(pid as string, { name: product.name, imageUrl })
      }
    }

    const enriched = completePage.map((ad) => {
      const prod = ad.productId
        ? productMap.get(ad.productId as string)
        : null
      return {
        ...ad,
        productName: prod?.name ?? null,
        productImageUrl: prod?.imageUrl ?? null,
      }
    })

    return {
      ...result,
      page: enriched,
    }
  },
})

// ─── Mutations ───────────────────────────────────────────────────────────────

/**
 * Toggles the `isWinner` boolean on a generation row.
 * Requires authentication and ownership of the parent product.
 */
export const toggleWinner = mutation({
  args: { generationId: v.id('templateGenerations') },
  handler: async (ctx, { generationId }) => {
    const userId = await requireAuth(ctx)
    const gen = await ctx.db.get(generationId)
    if (!gen) throw new Error('Generation not found')

    // Ownership check
    if (gen.productId) {
      const product = await ctx.db.get(gen.productId)
      if (product?.userId && product.userId !== userId) {
        throw new Error('Not authorized')
      }
    }

    await ctx.db.patch(generationId, { isWinner: !gen.isWinner })
  },
})
