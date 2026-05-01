/**
 * Free-form prompt generation: kicks off a batch of templateGenerations seeded
 * by the user's custom text prompt (no template, no angle). Each row goes
 * through the generateFromPromptWorkflow — the composer step is skipped and
 * the user's prompt is fed directly to the image generator alongside the
 * product image.
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

export const submitPromptGeneration = mutation({
  args: {
    productId: v.id('products'),
    prompt: v.string(),
    aspectRatio,
    count: v.number(),
    model: v.optional(v.union(v.literal('nano-banana-2'), v.literal('gpt-image-2'))),
    productImageId: v.optional(v.id('productImages')),
    sourceAdId: v.optional(v.id('templateGenerations')),
    // When false the generation skips the source image entirely and calls the
    // text-to-image variant of the model instead of the edit variant.
    useSourceImage: v.optional(v.boolean()),
  },
  handler: async (ctx, { productId, prompt, aspectRatio: ar, count, model, productImageId, sourceAdId, useSourceImage }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')
    const userId = identity.tokenIdentifier

    await enforceGenerationRateLimit(ctx, userId, 'submitPromptGeneration')

    // Validate prompt length
    if (prompt.length < 10 || prompt.length > 2000) {
      throw new Error('Prompt must be 10-2000 characters')
    }
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

    // Default useSourceImage to true for backwards-compatibility.
    const shouldUseSource = useSourceImage !== false

    let resolvedImageId: typeof product.primaryImageId
    let productImageUrl: string

    if (!shouldUseSource) {
      // Text-to-image: skip source resolution entirely.
      // Store an empty string so the existing non-nullable schema field is satisfied;
      // generateFromAngle detects this and routes to the text-to-image endpoint.
      resolvedImageId = undefined
      productImageUrl = ''
    } else {
      // Resolve source: caller-supplied productImageId wins; fall back to primary.
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

      // When sourceAdId is provided, use the ad's outputUrl as the generation source image.
      if (sourceAdId) {
        const sourceAd = await ctx.db.get(sourceAdId)
        if (!sourceAd) throw new Error('Source ad not found')
        if (sourceAd.userId && sourceAd.userId !== userId) {
          throw new Error('Not authorized to use this ad as source')
        }
        if (sourceAd.status !== 'complete') throw new Error('Source ad is not complete')
        if (!sourceAd.outputUrl) throw new Error('Source ad has no output image')
        productImageUrl = sourceAd.outputUrl
      }
    }

    // Billing gates: capability, batch guard, credit reservation.
    const billing = await requireCapability(ctx, CAPABILITIES.GENERATE_VARIATIONS, 'submitPromptGeneration')
    if (count > 2) {
      await requireCapability(ctx, CAPABILITIES.BATCH_GENERATION, 'submitPromptGeneration')
    }
    await requireCredit(ctx, 'submitPromptGeneration', count)

    // Insert one row per requested variation, then start a workflow per row.
    for (let i = 0; i < count; i++) {
      const generationId = await ctx.db.insert('templateGenerations', {
        productId,
        productImageId: resolvedImageId,
        userId,
        productImageUrl,
        aspectRatio: ar,
        mode: 'prompt',
        colorAdapt: false,
        variationIndex: i,
        dynamicPrompt: prompt,
        status: 'queued',
        model: model ?? 'nano-banana-2',
      })
      await recordCreditUse(ctx, billing, 'submitPromptGeneration', CAPABILITIES.GENERATE_VARIATIONS)
      await workflow.start(ctx, internal.studio.generateFromPromptWorkflow, {
        generationId,
      })
    }

    return { ok: true, count }
  },
})
