import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

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
    await ctx.db.patch(existing._id, {
      logoUrl: undefined,
      logoStorageKey: undefined,
      updatedAt: Date.now(),
    })
  },
})
