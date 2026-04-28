/**
 * From-angle generation: kicks off a batch of templateGenerations seeded by
 * a marketing angle (no source template). Each row goes through the
 * generateFromAngleWorkflow and lands in the same gallery as template-driven
 * generations.
 */
import { v } from 'convex/values'
import { mutation } from './_generated/server'
import { internal } from './_generated/api'
import { workflow } from './studio'
import { enforceGenerationRateLimit } from './products'
import {
  CAPABILITIES,
  recordCreditUse,
  requireCapability,
  requireCredit,
} from './lib/billing'

const aspectRatio = v.union(
  v.literal('1:1'),
  v.literal('4:5'),
  v.literal('9:16'),
)

export const submitAngleGeneration = mutation({
  args: {
    productId: v.id('products'),
    angleIndex: v.number(),
    aspectRatio,
    count: v.number(),
    model: v.optional(v.union(v.literal('nano-banana-2'), v.literal('gpt-image-2'))),
    /** Optional: pick a specific source image. Defaults to the primary. */
    productImageId: v.optional(v.id('productImages')),
  },
  handler: async (ctx, { productId, angleIndex, aspectRatio: ar, count, model, productImageId }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')
    const userId = identity.tokenIdentifier

    await enforceGenerationRateLimit(ctx, userId, 'submitAngleGeneration')

    if (count < 1 || count > 4) {
      throw new Error('Count must be 1-4')
    }

    const product = await ctx.db.get(productId)
    if (!product) throw new Error('Product not found')
    if (product.userId && product.userId !== userId) {
      throw new Error('Not authorized to generate for this product')
    }
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

    // Resolve source: caller-supplied productImageId wins; fall back to primary.
    let resolvedImageId: typeof product.primaryImageId
    let productImageUrl: string
    if (productImageId) {
      const picked = await ctx.db.get(productImageId)
      if (!picked) throw new Error('Source image not found')
      if (picked.productId !== productId) {
        throw new Error('Source image does not belong to this product')
      }
      if (picked.status !== 'ready') {
        throw new Error('Source image not ready')
      }
      resolvedImageId = picked._id
      productImageUrl = picked.imageUrl
    } else {
      if (!product.primaryImageId) {
        throw new Error('Product has no primary image set')
      }
      const primaryImage = await ctx.db.get(product.primaryImageId)
      if (!primaryImage) throw new Error('Primary image not found')
      resolvedImageId = product.primaryImageId
      productImageUrl = primaryImage.imageUrl
    }

    // Billing gates: capability, batch guard, credit reservation.
    const billing = await requireCapability(ctx, CAPABILITIES.GENERATE_VARIATIONS, 'submitAngleGeneration')
    if (count > 2) {
      await requireCapability(ctx, CAPABILITIES.BATCH_GENERATION, 'submitAngleGeneration')
    }
    await requireCredit(ctx, 'submitAngleGeneration', count)

    // Insert one row per requested variation, then start a workflow per row.
    for (let i = 0; i < count; i++) {
      const generationId = await ctx.db.insert('templateGenerations', {
        productId,
        productImageId: resolvedImageId,
        userId,
        productImageUrl,
        aspectRatio: ar,
        mode: 'angle',
        colorAdapt: false,
        variationIndex: i,
        angleSeed: {
          title: angle.title,
          description: angle.description,
          hook: angle.hook,
          suggestedAdStyle: angle.suggestedAdStyle,
        },
        status: 'queued',
        model: model ?? 'nano-banana-2',
      })
      await recordCreditUse(ctx, billing, 'submitAngleGeneration', CAPABILITIES.GENERATE_VARIATIONS)
      await workflow.start(ctx, internal.studio.generateFromAngleWorkflow, {
        generationId,
      })
    }

    return { ok: true, count }
  },
})
