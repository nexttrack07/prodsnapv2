import { v } from 'convex/values'
import { internalMutation, internalQuery, mutation, query } from './_generated/server'
import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'

async function requireAuth(
  ctx: { auth: { getUserIdentity: () => Promise<unknown> } },
): Promise<string> {
  const identity = (await ctx.auth.getUserIdentity()) as
    | { tokenIdentifier: string }
    | null
  if (!identity) throw new Error('Not authenticated')
  return identity.tokenIdentifier
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

/** Returns the user's primary brand kit, falling back to oldest row. */
async function findPrimaryBrand(
  ctx: { db: { query: (t: 'brandKits') => any } },
  userId: string,
) {
  const all = await ctx.db
    .query('brandKits')
    .withIndex('by_userId', (q: any) => q.eq('userId', userId))
    .collect()
  if (all.length === 0) return null
  const primary = all.find((k: any) => k.isPrimary === true)
  return primary ?? all[0]
}

// ─── Queries ────────────────────────────────────────────────────────────────

/**
 * Returns the user's primary brand kit (backwards-compatible — used by compose
 * and ad-copy generation). Finds the `isPrimary` brand, falling back to the
 * oldest brand if none flagged.
 */
export const getBrandKit = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx)
    return await findPrimaryBrand(ctx, userId)
  },
})

export const getBrandKitInternal = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    return await findPrimaryBrand(ctx, userId)
  },
})

/**
 * Resolves the brand kit for a specific product. If the product has a
 * `brandKitId` set AND that brand belongs to the same user, returns it.
 * Otherwise falls back to the user's primary brand kit.
 */
export const getBrandKitForProductInternal = internalQuery({
  args: {
    userId: v.string(),
    productId: v.optional(v.id('products')),
  },
  handler: async (ctx, { userId, productId }) => {
    if (productId) {
      const product = await ctx.db.get(productId)
      if (product?.brandKitId) {
        const kit = await ctx.db.get(product.brandKitId)
        if (kit && kit.userId === userId) return kit
      }
    }
    return await findPrimaryBrand(ctx, userId)
  },
})

/** Returns all brand kits for the authenticated user, primary first. */
export const listBrandKits = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx)
    const all = await ctx.db
      .query('brandKits')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect()
    // Sort: primary first, then by creation time desc
    return all.sort((a, b) => {
      if (a.isPrimary && !b.isPrimary) return -1
      if (!a.isPrimary && b.isPrimary) return 1
      return b._creationTime - a._creationTime
    })
  },
})

/** Returns a single brand kit by ID, ownership-checked. */
export const getBrandKitById = query({
  args: { brandKitId: v.id('brandKits') },
  handler: async (ctx, { brandKitId }) => {
    const userId = await requireAuth(ctx)
    const kit = await ctx.db.get(brandKitId)
    if (!kit || kit.userId !== userId) return null
    return kit
  },
})

// ─── Mutations ──────────────────────────────────────────────────────────────

/** Create a new brand kit. Marks as primary if user has no other brands. */
export const createBrandKit = mutation({
  args: {
    name: v.string(),
    websiteUrl: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    logoStorageKey: v.optional(v.string()),
    colors: v.optional(v.array(v.string())),
    primaryFont: v.optional(v.string()),
    voice: v.optional(v.string()),
    tagline: v.optional(v.string()),
    currentOffer: v.optional(v.string()),
    customerLanguage: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx)
    const existing = await ctx.db
      .query('brandKits')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .first()

    const isFirst = !existing
    return await ctx.db.insert('brandKits', {
      userId,
      ...args,
      isPrimary: isFirst ? true : undefined,
      updatedAt: Date.now(),
    })
  },
})

/** Update a brand kit by ID, ownership-checked. */
export const updateBrandKitById = mutation({
  args: {
    brandKitId: v.id('brandKits'),
    name: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    logoStorageKey: v.optional(v.string()),
    colors: v.optional(v.array(v.string())),
    primaryFont: v.optional(v.string()),
    voice: v.optional(v.string()),
    tagline: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    currentOffer: v.optional(v.string()),
    customerLanguage: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { brandKitId, ...patch }) => {
    const userId = await requireAuth(ctx)
    const kit = await ctx.db.get(brandKitId)
    if (!kit) throw new Error('Brand kit not found')
    if (kit.userId !== userId) throw new Error('Not authorized')
    await ctx.db.patch(brandKitId, { ...patch, updatedAt: Date.now() })
    return brandKitId
  },
})

/**
 * Backwards-compatible update: writes to the user's primary brand.
 * Used by the existing brand-kit form and anywhere that doesn't know about
 * multi-brand yet.
 */
export const updateBrandKit = mutation({
  args: {
    logoUrl: v.optional(v.string()),
    logoStorageKey: v.optional(v.string()),
    colors: v.optional(v.array(v.string())),
    primaryFont: v.optional(v.string()),
    voice: v.optional(v.string()),
    tagline: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    currentOffer: v.optional(v.string()),
    customerLanguage: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx)
    const primary = await findPrimaryBrand(ctx, userId)

    const now = Date.now()
    if (primary) {
      await ctx.db.patch(primary._id, { ...args, updatedAt: now })
      return primary._id
    }
    return await ctx.db.insert('brandKits', {
      userId,
      ...args,
      isPrimary: true,
      updatedAt: now,
    })
  },
})

/** Delete a brand kit. If it was primary and others exist, promote the newest remaining. */
export const deleteBrandKit = mutation({
  args: { brandKitId: v.id('brandKits') },
  handler: async (ctx, { brandKitId }) => {
    const userId = await requireAuth(ctx)
    const kit = await ctx.db.get(brandKitId)
    if (!kit) throw new Error('Brand kit not found')
    if (kit.userId !== userId) throw new Error('Not authorized')

    const wasPrimary = kit.isPrimary === true
    await ctx.db.delete(brandKitId)

    // If it was primary, promote the most recent remaining brand
    if (wasPrimary) {
      const remaining = await ctx.db
        .query('brandKits')
        .withIndex('by_userId', (q) => q.eq('userId', userId))
        .order('desc')
        .first()
      if (remaining) {
        await ctx.db.patch(remaining._id, { isPrimary: true, updatedAt: Date.now() })
      }
    }
  },
})

/** Set a brand kit as primary. Clears isPrimary on all other user brands. */
export const setPrimaryBrandKit = mutation({
  args: { brandKitId: v.id('brandKits') },
  handler: async (ctx, { brandKitId }) => {
    const userId = await requireAuth(ctx)
    const kit = await ctx.db.get(brandKitId)
    if (!kit) throw new Error('Brand kit not found')
    if (kit.userId !== userId) throw new Error('Not authorized')

    // Clear primary on all other brands
    const all = await ctx.db
      .query('brandKits')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect()
    for (const other of all) {
      if (other._id !== brandKitId && other.isPrimary) {
        await ctx.db.patch(other._id, { isPrimary: undefined, updatedAt: Date.now() })
      }
    }

    await ctx.db.patch(brandKitId, { isPrimary: true, updatedAt: Date.now() })
  },
})

export const clearBrandLogo = mutation({
  args: { brandKitId: v.optional(v.id('brandKits')) },
  handler: async (ctx, { brandKitId }) => {
    const userId = await requireAuth(ctx)

    let kit
    if (brandKitId) {
      kit = await ctx.db.get(brandKitId)
      if (!kit || kit.userId !== userId) return
    } else {
      // Backwards compat: clear logo on primary brand
      kit = await findPrimaryBrand(ctx, userId)
      if (!kit) return
    }

    const keyToDelete = kit.logoStorageKey
    await ctx.db.patch(kit._id, {
      logoUrl: undefined,
      logoStorageKey: undefined,
      updatedAt: Date.now(),
    })
    if (keyToDelete) {
      await ctx.scheduler.runAfter(0, internal.r2.clearBrandLogoStorage, { key: keyToDelete })
    }
  },
})

// ─── Internal mutations (URL import flow) ───────────────────────────────────

/**
 * Upsert helper for the URL-import flow. Matches existing brand by websiteUrl
 * for this user. If not found, creates a new brand. If the user has no brands
 * yet, marks the new one as primary.
 */
export const upsertBrandKitFromImport = internalMutation({
  args: {
    userId: v.string(),
    name: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    logoStorageKey: v.optional(v.string()),
    colors: v.optional(v.array(v.string())),
    primaryFont: v.optional(v.string()),
    voice: v.optional(v.string()),
    tagline: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    currentOffer: v.optional(v.string()),
    customerLanguage: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { userId, ...incoming }) => {
    // Find existing brand by websiteUrl match for this user
    let existing: { _id: Id<'brandKits'> } | null = null
    if (incoming.websiteUrl) {
      const allBrands = await ctx.db
        .query('brandKits')
        .withIndex('by_userId', (q) => q.eq('userId', userId))
        .collect()
      existing = allBrands.find((b) => b.websiteUrl === incoming.websiteUrl) ?? null
    }

    // Fall back to first brand (legacy single-brand behavior)
    if (!existing) {
      existing = await ctx.db
        .query('brandKits')
        .withIndex('by_userId', (q) => q.eq('userId', userId))
        .first()
    }

    const cleaned: Record<string, unknown> = {}
    if (incoming.name) cleaned.name = incoming.name
    if (incoming.logoUrl) cleaned.logoUrl = incoming.logoUrl
    if (incoming.logoStorageKey) cleaned.logoStorageKey = incoming.logoStorageKey
    if (incoming.colors && incoming.colors.length > 0) cleaned.colors = incoming.colors
    if (incoming.primaryFont) cleaned.primaryFont = incoming.primaryFont
    if (incoming.voice) cleaned.voice = incoming.voice
    if (incoming.tagline) cleaned.tagline = incoming.tagline
    if (incoming.websiteUrl) cleaned.websiteUrl = incoming.websiteUrl
    if (incoming.currentOffer) cleaned.currentOffer = incoming.currentOffer
    if (incoming.customerLanguage && incoming.customerLanguage.length > 0) cleaned.customerLanguage = incoming.customerLanguage

    const now = Date.now()
    if (existing) {
      if (Object.keys(cleaned).length === 0) return existing._id
      await ctx.db.patch(existing._id, { ...cleaned, updatedAt: now })
      return existing._id
    }

    // No existing brand — check if user has any brands at all
    const anyBrand = await ctx.db
      .query('brandKits')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .first()
    const isFirst = !anyBrand

    return await ctx.db.insert('brandKits', {
      userId,
      ...cleaned,
      isPrimary: isFirst ? true : undefined,
      updatedAt: now,
    })
  },
})
