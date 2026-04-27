import { v } from 'convex/values'
import { internalMutation, internalQuery, mutation, query } from './_generated/server'
import { internal } from './_generated/api'

async function requireAuth(
  ctx: { auth: { getUserIdentity: () => Promise<unknown> } },
): Promise<string> {
  const identity = (await ctx.auth.getUserIdentity()) as
    | { tokenIdentifier: string }
    | null
  if (!identity) throw new Error('Not authenticated')
  return identity.tokenIdentifier
}

export const getBrandKit = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx)
    const kit = await ctx.db
      .query('brandKits')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .first()
    return kit
  },
})

export const getBrandKitInternal = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query('brandKits')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .first()
  },
})

export const updateBrandKit = mutation({
  args: {
    logoUrl: v.optional(v.string()),
    logoStorageKey: v.optional(v.string()),
    colors: v.optional(v.array(v.string())),
    primaryFont: v.optional(v.string()),
    voice: v.optional(v.string()),
    tagline: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx)
    const existing = await ctx.db
      .query('brandKits')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .first()

    const now = Date.now()
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now })
      return existing._id
    }
    return await ctx.db.insert('brandKits', {
      userId,
      ...args,
      updatedAt: now,
    })
  },
})

export const clearBrandLogo = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx)
    const existing = await ctx.db
      .query('brandKits')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .first()
    if (!existing) return
    const keyToDelete = existing.logoStorageKey
    await ctx.db.patch(existing._id, {
      logoUrl: undefined,
      logoStorageKey: undefined,
      updatedAt: Date.now(),
    })
    if (keyToDelete) {
      await ctx.scheduler.runAfter(0, internal.r2.clearBrandLogoStorage, { key: keyToDelete })
    }
  },
})

/**
 * Upsert helper for the URL-import flow. Only patches fields that are provided;
 * never overwrites existing brand kit values with empty/undefined.
 */
export const upsertBrandKitFromImport = internalMutation({
  args: {
    userId: v.string(),
    logoUrl: v.optional(v.string()),
    logoStorageKey: v.optional(v.string()),
    colors: v.optional(v.array(v.string())),
    primaryFont: v.optional(v.string()),
    voice: v.optional(v.string()),
    tagline: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
  },
  handler: async (ctx, { userId, ...incoming }) => {
    const existing = await ctx.db
      .query('brandKits')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .first()

    const cleaned: Record<string, unknown> = {}
    if (incoming.logoUrl) cleaned.logoUrl = incoming.logoUrl
    if (incoming.logoStorageKey) cleaned.logoStorageKey = incoming.logoStorageKey
    if (incoming.colors && incoming.colors.length > 0) cleaned.colors = incoming.colors
    if (incoming.primaryFont) cleaned.primaryFont = incoming.primaryFont
    if (incoming.voice) cleaned.voice = incoming.voice
    if (incoming.tagline) cleaned.tagline = incoming.tagline
    if (incoming.websiteUrl) cleaned.websiteUrl = incoming.websiteUrl

    const now = Date.now()
    if (existing) {
      if (Object.keys(cleaned).length === 0) return existing._id
      await ctx.db.patch(existing._id, { ...cleaned, updatedAt: now })
      return existing._id
    }
    return await ctx.db.insert('brandKits', {
      userId,
      ...cleaned,
      updatedAt: now,
    })
  },
})
