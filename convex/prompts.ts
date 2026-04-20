import { v } from 'convex/values'
import { internalQuery, mutation, query } from './_generated/server'

const KEY = 'generation'

export const DEFAULT_CORE_INSTRUCTIONS = `You are a prompt engineer for nano-banana, a vision-aware image-editing model. You receive two images: the first is an ad-template reference, the second is a user's product.

Produce a single nano-banana prompt that:
- Replaces the product featured in the first image with the product from the second image, matching scale, placement, and lighting direction.
- Rewrites any visible text in the first image so it fits the new product — adjust copy, tone, and audience. Do NOT leave the original copy in place if it references the old product.
- Swaps any icons, badges, callouts, or graphics that were specific to the old product for ones that fit the new one. Preserve purely decorative elements.
- Removes or replaces any brand logo, wordmark, or brand-specific badge that belonged to the template's original product. Scan both the template scene and — critically — the surface of the original product inside the scene for logos or brand marks, and strip them. If the user's product (the second image) has its own visible logo, reproduce that logo faithfully on the new product; if it does not, leave the product surface clean — do not invent a brand. Never carry the template's brand identity onto the new product.
- Preserves composition, camera angle, lighting quality, typography style, and overall mood.

Be concrete: describe the specific text changes, icon swaps, and logo removals you're directing the model to make. Reference the template as "the first image" and the product as "the second image".

Return only the final prompt — no preamble, no markdown, no explanation.`

export const DEFAULT_EXACT_ADDENDUM = `Mode: exact. Preserve the scene strictly — do not re-compose the layout or swap props beyond what's product-specific.`

export const DEFAULT_REMIX_ADDENDUM = `Mode: remix. You may re-compose the layout, camera angle, and props for a fresh scene that captures the same mood and target audience, but keep the template's typographic and color feel.`

export const DEFAULT_COLOR_ADAPT_ADDENDUM = `Additionally: subtly bias the background and accent palette toward the product's dominant colors, while keeping the template's overall look.`

// Fields kept with legacy names to avoid schema migration churn; the
// *meaning* is now "short addendum", not "full prompt".  Historical
// aliases exported so the admin enhance button keeps working.
export const DEFAULT_EXACT_PROMPT = DEFAULT_EXACT_ADDENDUM
export const DEFAULT_REMIX_PROMPT = DEFAULT_REMIX_ADDENDUM
export const DEFAULT_COLOR_ADAPT_SUFFIX = DEFAULT_COLOR_ADAPT_ADDENDUM

function defaults() {
  return {
    coreInstructions: DEFAULT_CORE_INSTRUCTIONS,
    exactPrompt: DEFAULT_EXACT_ADDENDUM,
    remixPrompt: DEFAULT_REMIX_ADDENDUM,
    colorAdaptSuffix: DEFAULT_COLOR_ADAPT_ADDENDUM,
  }
}

export const getPromptConfig = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query('promptConfigs')
      .withIndex('by_key', (q) => q.eq('key', KEY))
      .unique()
    if (row) {
      return {
        ...row,
        // Back-fill coreInstructions for rows saved before this field existed.
        coreInstructions: row.coreInstructions ?? DEFAULT_CORE_INSTRUCTIONS,
      }
    }
    return {
      key: KEY,
      ...defaults(),
      updatedAt: 0,
    }
  },
})

/**
 * Internal variant used by the composer action.
 */
export const getPromptConfigInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query('promptConfigs')
      .withIndex('by_key', (q) => q.eq('key', KEY))
      .unique()
    return {
      coreInstructions: row?.coreInstructions ?? DEFAULT_CORE_INSTRUCTIONS,
      exactAddendum: row?.exactPrompt ?? DEFAULT_EXACT_ADDENDUM,
      remixAddendum: row?.remixPrompt ?? DEFAULT_REMIX_ADDENDUM,
      colorAdaptAddendum: row?.colorAdaptSuffix ?? DEFAULT_COLOR_ADAPT_ADDENDUM,
    }
  },
})

export const updatePromptConfig = mutation({
  args: {
    coreInstructions: v.string(),
    exactPrompt: v.string(),
    remixPrompt: v.string(),
    colorAdaptSuffix: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('promptConfigs')
      .withIndex('by_key', (q) => q.eq('key', KEY))
      .unique()
    const now = Date.now()
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now })
    } else {
      await ctx.db.insert('promptConfigs', { key: KEY, ...args, updatedAt: now })
    }
  },
})

export const resetPromptConfig = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query('promptConfigs')
      .withIndex('by_key', (q) => q.eq('key', KEY))
      .unique()
    if (existing) await ctx.db.delete(existing._id)
  },
})
