/**
 * Ad copy generation. Given a product (with analysis) + angle index + brand
 * kit, returns headlines / primary texts / CTAs for the user to copy into
 * their ad. The action is fire-and-return (no persistence yet — generation is
 * cheap and users can re-run if they lose the results).
 */
import { v } from 'convex/values'
import { action, type ActionCtx } from './_generated/server'
import { api, internal } from './_generated/api'

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

    const product = await ctx.runQuery(api.products.getProduct, { productId })
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

    return await ctx.runAction(internal.ai.generateAdCopyText, {
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
  },
})
