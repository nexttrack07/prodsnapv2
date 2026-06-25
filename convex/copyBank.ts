/**
 * Product Copy Bank — user-triggered ad-copy generation, scoped to a PRODUCT
 * (no ad-test container). Each requested field mix is stored as its own
 * `copySets` row. CTA is a recommended Meta button value, not free-form prose.
 * Copy generation is UNMETERED for image-credit billing.
 *
 * Auth: every public function derives the user id from
 * `ctx.auth.getUserIdentity().tokenIdentifier`; we never accept a userId arg.
 */
import { v } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server'
import { internal } from './_generated/api'
import {
  copySetRequest,
  copySuggestion,
  normalizeCopySetRequest,
  normalizeCtaButton,
} from './lib/adTestValidators'

async function requireAuth(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error('Not authenticated')
  return identity.tokenIdentifier
}

async function getAuthUserId(
  ctx: QueryCtx | MutationCtx,
): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity()
  return identity?.tokenIdentifier ?? null
}

/** Optional angle the buyer can ground copy in (picked from product angles). */
const copyAngle = v.object({
  key: v.optional(v.string()),
  title: v.string(),
  description: v.optional(v.string()),
  hook: v.optional(v.string()),
  suggestedAdStyle: v.optional(v.string()),
})

/** Copy Bank field a suggestion belongs to. */
const copySetField = v.union(
  v.literal('headlines'),
  v.literal('primaryTexts'),
  v.literal('descriptions'),
)

// ─── List ──────────────────────────────────────────────────────────────────

export const listCopySets = query({
  args: { productId: v.id('products') },
  handler: async (ctx, { productId }) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return []

    const product = await ctx.db.get(productId)
    if (!product || (product.userId && product.userId !== userId)) return []

    const sets = await ctx.db
      .query('copySets')
      .withIndex('by_productId', (q) => q.eq('productId', productId))
      .order('desc')
      .take(100)

    return sets.filter((s) => s.userId === userId)
  },
})

// ─── Generation ──────────────────────────────────────────────────────────────

/**
 * Read-side context for Copy Bank generation: product marketing fields + the
 * product's brand kit (voice/tagline/offer/customer phrases). Runs as an
 * internal query so `generateCopySet` gathers everything in one owned read
 * before calling the LLM. Returns null when the product isn't owned.
 */
export const getCopyContextInternal = internalQuery({
  args: { userId: v.string(), productId: v.id('products') },
  handler: async (ctx, { userId, productId }) => {
    const product = await ctx.db.get(productId)
    if (!product || (product.userId && product.userId !== userId)) return null

    // Per-product brand kit only (matches image generation; no primary fallback).
    let brandKit: Doc<'brandKits'> | null = null
    if (product.brandKitId) {
      const kit = await ctx.db.get(product.brandKitId)
      if (kit && kit.userId === userId) brandKit = kit
    }

    const customerLanguage =
      product.customerLanguage && product.customerLanguage.length > 0
        ? product.customerLanguage
        : brandKit?.customerLanguage

    return {
      productName: product.name,
      productDescription: product.productDescription,
      targetAudience: product.targetAudience,
      valueProposition: product.valueProposition,
      brandVoice: brandKit?.voice,
      brandTagline: brandKit?.tagline,
      currentOffer: brandKit?.currentOffer,
      customerLanguage,
    }
  },
})

/** Inserts a Copy Bank row after generation; re-verifies product ownership. */
export const _insertCopySet = internalMutation({
  args: {
    userId: v.string(),
    productId: v.id('products'),
    angleKey: v.optional(v.string()),
    request: copySetRequest,
    headlines: v.array(copySuggestion),
    primaryTexts: v.array(copySuggestion),
    descriptions: v.array(copySuggestion),
    recommendedCtaButton: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<'copySets'>> => {
    const product = await ctx.db.get(args.productId)
    if (!product || (product.userId && product.userId !== args.userId)) {
      throw new Error('Product not found')
    }
    const now = Date.now()
    return ctx.db.insert('copySets', {
      userId: args.userId,
      productId: args.productId,
      angleKey: args.angleKey,
      request: args.request,
      headlines: args.headlines,
      primaryTexts: args.primaryTexts,
      descriptions: args.descriptions,
      recommendedCtaButton: args.recommendedCtaButton,
      createdAt: now,
      updatedAt: now,
    })
  },
})

/**
 * User-triggered Copy Bank generation for a product. The buyer picks which
 * fields + how many, and optionally an angle to ground the copy. Generates a
 * single `copySets` row. Runs: auth → validate → owned read → LLM → owned insert.
 */
export const generateCopySet = action({
  args: {
    productId: v.id('products'),
    angle: v.optional(copyAngle),
    request: copySetRequest,
    /** Encourage 1-2 relevant emoji in primary texts / descriptions. */
    emoji: v.optional(v.boolean()),
  },
  handler: async (ctx, { productId, angle, request, emoji }): Promise<Id<'copySets'>> => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')
    const userId = identity.tokenIdentifier

    // Throws on out-of-range counts / empty request before any LLM spend.
    const counts = normalizeCopySetRequest(request)

    const context = await ctx.runQuery(internal.copyBank.getCopyContextInternal, {
      userId,
      productId,
    })
    if (!context) throw new Error('Product not found')

    const ai = await ctx.runAction(internal.ai.generateCopyBankText, {
      productName: context.productName,
      productDescription: context.productDescription,
      targetAudience: context.targetAudience,
      valueProposition: context.valueProposition,
      angle: angle
        ? {
            title: angle.title,
            description: angle.description ?? '',
            hook: angle.hook ?? '',
            suggestedAdStyle: angle.suggestedAdStyle ?? '',
          }
        : undefined,
      brandVoice: context.brandVoice,
      brandTagline: context.brandTagline,
      currentOffer: context.currentOffer,
      customerLanguage: context.customerLanguage,
      headlineCount: counts.headlineCount,
      primaryTextCount: counts.primaryTextCount,
      descriptionCount: counts.descriptionCount,
      emoji: emoji ?? false,
    })

    const toSuggestions = (texts: string[]) =>
      texts.map((text, variantIndex) => ({
        text,
        variantIndex,
        angleKey: angle?.key,
      }))

    return ctx.runMutation(internal.copyBank._insertCopySet, {
      userId,
      productId,
      angleKey: angle?.key,
      request,
      headlines: toSuggestions(ai.headlines),
      primaryTexts: toSuggestions(ai.primaryTexts),
      descriptions: toSuggestions(ai.descriptions),
      recommendedCtaButton: normalizeCtaButton(ai.recommendedCtaButton),
    })
  },
})

// ─── Edit / delete suggestions ───────────────────────────────────────────────

export const updateCopySuggestion = mutation({
  args: {
    copySetId: v.id('copySets'),
    field: copySetField,
    variantIndex: v.number(),
    text: v.string(),
  },
  handler: async (ctx, { copySetId, field, variantIndex, text }) => {
    const userId = await requireAuth(ctx)
    const copySet = await ctx.db.get(copySetId)
    if (!copySet || copySet.userId !== userId) throw new Error('Copy set not found')

    const trimmed = text.trim()
    if (!trimmed) throw new Error('Suggestion text cannot be empty')

    const current = copySet[field]
    const idx = current.findIndex((s) => s.variantIndex === variantIndex)
    if (idx === -1) throw new Error('Suggestion not found')

    const updated = current.map((s, i) => (i === idx ? { ...s, text: trimmed } : s))
    await ctx.db.patch(copySetId, { [field]: updated, updatedAt: Date.now() })
    return null
  },
})

export const deleteCopySuggestion = mutation({
  args: {
    copySetId: v.id('copySets'),
    field: copySetField,
    variantIndex: v.number(),
  },
  handler: async (ctx, { copySetId, field, variantIndex }) => {
    const userId = await requireAuth(ctx)
    const copySet = await ctx.db.get(copySetId)
    if (!copySet || copySet.userId !== userId) throw new Error('Copy set not found')

    const current = copySet[field]
    const next = current.filter((s) => s.variantIndex !== variantIndex)
    if (next.length === current.length) throw new Error('Suggestion not found')
    await ctx.db.patch(copySetId, { [field]: next, updatedAt: Date.now() })

    // Clear any creative pairings (on this product) that referenced it.
    const selField: 'selectedHeadlineIndex' | 'selectedPrimaryTextIndex' | 'selectedDescriptionIndex' =
      field === 'headlines'
        ? 'selectedHeadlineIndex'
        : field === 'primaryTexts'
          ? 'selectedPrimaryTextIndex'
          : 'selectedDescriptionIndex'
    const gens = await ctx.db
      .query('templateGenerations')
      .withIndex('by_product', (q) => q.eq('productId', copySet.productId))
      .collect()
    for (const gen of gens) {
      if (gen.selectedCopySetId === copySetId && gen[selField] === variantIndex) {
        await ctx.db.patch(gen._id, { [selField]: undefined })
      }
    }
    return null
  },
})

export const setCopySetCta = mutation({
  args: {
    copySetId: v.id('copySets'),
    recommendedCtaButton: v.optional(v.string()),
  },
  handler: async (ctx, { copySetId, recommendedCtaButton }) => {
    const userId = await requireAuth(ctx)
    const copySet = await ctx.db.get(copySetId)
    if (!copySet || copySet.userId !== userId) throw new Error('Copy set not found')

    let normalized: string | undefined
    if (recommendedCtaButton) {
      normalized = normalizeCtaButton(recommendedCtaButton)
      if (!normalized) throw new Error('Unsupported CTA button')
    }
    await ctx.db.patch(copySetId, { recommendedCtaButton: normalized, updatedAt: Date.now() })
    return null
  },
})

export const deleteCopySet = mutation({
  args: { copySetId: v.id('copySets') },
  handler: async (ctx, { copySetId }) => {
    const userId = await requireAuth(ctx)
    const copySet = await ctx.db.get(copySetId)
    if (!copySet || copySet.userId !== userId) throw new Error('Copy set not found')

    const paired = await ctx.db
      .query('templateGenerations')
      .withIndex('by_product', (q) => q.eq('productId', copySet.productId))
      .collect()
    for (const gen of paired) {
      if (gen.selectedCopySetId === copySetId) {
        await ctx.db.patch(gen._id, {
          selectedCopySetId: undefined,
          selectedHeadlineIndex: undefined,
          selectedPrimaryTextIndex: undefined,
          selectedDescriptionIndex: undefined,
        })
      }
    }
    await ctx.db.delete(copySetId)
    return null
  },
})

// ─── Pairing (creative ↔ copy) ───────────────────────────────────────────────

/**
 * Pairs Copy Bank suggestions with a generated creative (→ a "saved ad").
 * Pass `copySetId` + indices to pair; omit `copySetId` to unpair. The creative
 * and the copy set must belong to the same owned product.
 */
export const pairCopyWithGeneration = mutation({
  args: {
    generationId: v.id('templateGenerations'),
    copySetId: v.optional(v.id('copySets')),
    headlineIndex: v.optional(v.number()),
    primaryTextIndex: v.optional(v.number()),
    descriptionIndex: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx)

    const gen = await ctx.db.get(args.generationId)
    if (!gen || gen.userId !== userId) throw new Error('Generation not found')

    if (!args.copySetId) {
      await ctx.db.patch(args.generationId, {
        selectedCopySetId: undefined,
        selectedHeadlineIndex: undefined,
        selectedPrimaryTextIndex: undefined,
        selectedDescriptionIndex: undefined,
      })
      return null
    }

    const copySet = await ctx.db.get(args.copySetId)
    if (!copySet || copySet.userId !== userId) throw new Error('Copy set not found')
    if (copySet.productId !== gen.productId) {
      throw new Error('Copy set does not belong to this product')
    }

    const checkIndex = (
      index: number | undefined,
      variants: Array<{ variantIndex: number }>,
      label: string,
    ) => {
      if (index === undefined) return
      if (!variants.some((variant) => variant.variantIndex === index)) {
        throw new Error(`Selected ${label} is not in this copy set`)
      }
    }
    checkIndex(args.headlineIndex, copySet.headlines, 'headline')
    checkIndex(args.primaryTextIndex, copySet.primaryTexts, 'primary text')
    checkIndex(args.descriptionIndex, copySet.descriptions, 'description')

    await ctx.db.patch(args.generationId, {
      selectedCopySetId: args.copySetId,
      selectedHeadlineIndex: args.headlineIndex,
      selectedPrimaryTextIndex: args.primaryTextIndex,
      selectedDescriptionIndex: args.descriptionIndex,
    })
    return null
  },
})
