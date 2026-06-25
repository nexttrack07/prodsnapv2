/**
 * Flat per-product creatives — the gallery of generated ad images for a product
 * (no ad-test container) plus "saved ads" (a creative paired with copy). Auth is
 * derived from the identity; we never accept a userId arg.
 */
import { v } from 'convex/values'
import { query, type MutationCtx, type QueryCtx } from './_generated/server'

async function getAuthUserId(
  ctx: QueryCtx | MutationCtx,
): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity()
  return identity?.tokenIdentifier ?? null
}

/**
 * Creatives for a product, newest first. The product page's Overview tab
 * renders this — queued/running rows show progress, complete rows show the
 * image. Failed rows are intentionally excluded: a failed generation is never
 * billed (we charge only after a durable upload), there is no inline retry, and
 * a non-clickable "Failed" tile is a dead-end the user can't dismiss. Hiding it
 * keeps the gallery to results that matter; the watchdog flips stuck rows to
 * 'failed', so timed-out generations drop out here too.
 */
export const listForProduct = query({
  args: { productId: v.id('products') },
  handler: async (ctx, { productId }) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return []
    const product = await ctx.db.get(productId)
    if (!product || (product.userId && product.userId !== userId)) return []

    const gens = await ctx.db
      .query('templateGenerations')
      .withIndex('by_product', (q) => q.eq('productId', productId))
      .collect()

    return gens
      .filter((g) => g.userId === userId && g.status !== 'failed')
      .sort((a, b) => b._creationTime - a._creationTime)
  },
})

/**
 * "Saved ads" for a product: creatives the user paired with copy. Each is
 * resolved into a render-ready ad (image + headline/primary/description + CTA).
 */
export const listSavedAds = query({
  args: { productId: v.id('products') },
  handler: async (ctx, { productId }) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return []
    const product = await ctx.db.get(productId)
    if (!product || (product.userId && product.userId !== userId)) return []

    const gens = await ctx.db
      .query('templateGenerations')
      .withIndex('by_product', (q) => q.eq('productId', productId))
      .collect()

    const saved = gens.filter(
      (g) => g.status === 'complete' && !!g.outputUrl && !!g.selectedCopySetId,
    )
    if (saved.length === 0) return []

    const setIds = [...new Set(saved.map((g) => g.selectedCopySetId!))]
    const setDocs = await Promise.all(setIds.map((id) => ctx.db.get(id)))
    const setsById = new Map(
      setDocs.filter((s): s is NonNullable<typeof s> => !!s).map((s) => [s._id, s]),
    )

    const variantText = (
      list: Array<{ variantIndex: number; text: string }>,
      idx: number | undefined,
    ): string | undefined =>
      idx === undefined ? undefined : list.find((x) => x.variantIndex === idx)?.text

    return saved
      .sort((a, b) => b._creationTime - a._creationTime)
      .map((g) => {
        const set = g.selectedCopySetId ? setsById.get(g.selectedCopySetId) : undefined
        return {
          generationId: g._id,
          outputUrl: g.outputUrl as string,
          aspectRatio: g.aspectRatio ?? '1:1',
          isWinner: g.isWinner ?? false,
          headline: set ? variantText(set.headlines, g.selectedHeadlineIndex) : undefined,
          primaryText: set
            ? variantText(set.primaryTexts, g.selectedPrimaryTextIndex)
            : undefined,
          description: set
            ? variantText(set.descriptions, g.selectedDescriptionIndex)
            : undefined,
          cta: set?.recommendedCtaButton,
        }
      })
  },
})
