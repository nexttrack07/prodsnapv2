/**
 * AI-powered prompt suggestions. Given a product (with analysis) + brand kit,
 * calls Gemini to generate 5 diverse, concrete ad-creative scene prompts.
 * The action is fire-and-return — no persistence.
 */
import { v } from 'convex/values'
import { action, internalMutation, internalQuery, type ActionCtx } from './_generated/server'
import { api, internal } from './_generated/api'

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_CALLS = 10

export const checkSuggestRateLimit = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const since = Date.now() - RATE_LIMIT_WINDOW_MS
    const recent = await ctx.db
      .query('billingEvents')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .filter((q) =>
        q.and(
          q.gte(q.field('timestamp'), since),
          q.eq(q.field('mutationName'), 'suggestPromptIdeas'),
        ),
      )
      .collect()
    return recent.length
  },
})

export const recordSuggestRateLimited = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    await ctx.db.insert('billingEvents', {
      userId,
      mutationName: 'suggestPromptIdeas',
      allowed: false,
      timestamp: Date.now(),
      context: 'rate-limited',
    })
  },
})

export const recordSuggestUsage = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    await ctx.db.insert('billingEvents', {
      userId,
      mutationName: 'suggestPromptIdeas',
      allowed: true,
      timestamp: Date.now(),
      context: 'usage',
    })
  },
})

export const suggestPromptIdeas = action({
  args: {
    productId: v.id('products'),
  },
  handler: async (
    ctx: ActionCtx,
    { productId },
  ): Promise<string[]> => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')
    const userId = identity.tokenIdentifier

    // Rate limit: 10/min/user
    const recentCount: number = await ctx.runQuery(internal.promptSuggestions.checkSuggestRateLimit, { userId })
    if (recentCount >= RATE_LIMIT_MAX_CALLS) {
      await ctx.runMutation(internal.promptSuggestions.recordSuggestRateLimited, { userId })
      throw new Error('Too many requests — please wait a moment before generating suggestions again.')
    }

    const product = await ctx.runQuery(api.products.getProduct, { productId })
    if (!product) throw new Error('Product not found')
    if (product.status !== 'ready') {
      throw new Error('Product analysis is not ready yet')
    }

    // Load brand kit for context
    const brandKit = await ctx.runQuery(internal.brandKits.getBrandKitInternal, { userId })

    // Build context lines for the LLM
    const lines: string[] = []
    if (product.name) lines.push(`Product name: ${product.name}`)
    if (product.category) lines.push(`Category: ${product.category}`)
    if (product.productDescription) lines.push(`Description: ${product.productDescription}`)
    if (product.valueProposition) lines.push(`Value proposition: ${product.valueProposition}`)
    if (product.targetAudience) lines.push(`Target audience: ${product.targetAudience}`)
    if (product.marketingAngles && product.marketingAngles.length > 0) {
      lines.push(`Marketing angles: ${product.marketingAngles.map((a: { title: string }) => a.title).join(', ')}`)
    }
    if (brandKit?.voice) lines.push(`Brand voice: ${brandKit.voice}`)
    if (brandKit?.tagline) lines.push(`Brand tagline: ${brandKit.tagline}`)
    if (brandKit?.currentOffer) lines.push(`Current offer: ${brandKit.currentOffer}`)
    if (brandKit?.customerLanguage && brandKit.customerLanguage.length > 0) {
      lines.push(`Customer language: ${brandKit.customerLanguage.join('; ')}`)
    }

    const prompt = `${lines.join('\n')}

Generate exactly 5 distinct, concrete ad-creative scene prompts for this product's ad images. Each prompt should:
- Be 25-50 words
- Mention the product by name where natural
- Specify setting + lighting + mood + composition
- Be visually diverse from the others (don't all be "studio shot" — vary across lifestyle, flat-lay, outdoor, close-up, editorial, etc.)
- Be ready to feed directly into an image generation model

Return a JSON array of exactly 5 strings. Example format:
["prompt 1 text here", "prompt 2 text here", "prompt 3 text here", "prompt 4 text here", "prompt 5 text here"]

Return ONLY the JSON array, no other text.`

    const result = await ctx.runAction(internal.ai.callTextInternal, {
      prompt,
      systemPrompt: 'You are a senior art director for DTC product photography ads. Write specific, vivid image prompts that would produce scroll-stopping Facebook ad images. Be concrete about composition, lighting, and setting. Return valid JSON only.',
    })

    // Parse the response
    let suggestions: string[]
    try {
      let jsonStr = result.trim()
      const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim()
      }
      const arrayMatch = jsonStr.match(/\[[\s\S]*\]/)
      if (arrayMatch) {
        jsonStr = arrayMatch[0]
      }
      const parsed = JSON.parse(jsonStr)
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('Expected a non-empty array')
      }
      suggestions = parsed.filter((s: unknown): s is string => typeof s === 'string').slice(0, 5)
      if (suggestions.length === 0) {
        throw new Error('No valid string suggestions in response')
      }
    } catch (err) {
      throw new Error(`Failed to parse prompt suggestions: ${err instanceof Error ? err.message : String(err)}`)
    }

    // Record usage
    await ctx.runMutation(internal.promptSuggestions.recordSuggestUsage, { userId })

    return suggestions
  },
})
