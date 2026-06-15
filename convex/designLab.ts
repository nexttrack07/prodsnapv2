import { v } from 'convex/values'
import { internalMutation, query, mutation } from './_generated/server'
import { internal } from './_generated/api'
import { requireAdminIdentity } from './lib/admin/requireAdmin'

// ─── Internal mutation (called from designLabActions) ─────────────────────────

export const saveDesignOutput = internalMutation({
  args: {
    adminUserId: v.string(),
    imageUrl: v.string(),
    storageKey: v.string(),
    prompt: v.string(),
    promptTitle: v.string(),
    conceptTitle: v.string(),
    referenceImageUrls: v.array(v.string()),
    batchName: v.optional(v.string()),
    nicheDescription: v.optional(v.string()),
    bgRemovedUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert('designOutputs', {
      ...args,
      createdAt: Date.now(),
    })
  },
})

// ─── Batch-generate review step (approve / discard a preview) ─────────────────

/**
 * Persists a previewed design to the library after the admin approves it.
 * The image is already on R2 (uploaded during preview generation).
 */
export const approveDesignPreview = mutation({
  args: {
    imageUrl: v.string(),
    storageKey: v.string(),
    prompt: v.string(),
    promptTitle: v.string(),
    conceptTitle: v.string(),
    referenceImageUrls: v.array(v.string()),
    batchName: v.optional(v.string()),
    nicheDescription: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const adminUserId = await requireAdminIdentity(ctx)
    return ctx.db.insert('designOutputs', {
      ...args,
      adminUserId,
      createdAt: Date.now(),
    })
  },
})

/**
 * Discards a previewed design that was never approved — deletes its orphaned
 * R2 object so dismissing/redoing never leaks storage.
 */
export const discardDesignPreview = mutation({
  args: { storageKey: v.string() },
  handler: async (ctx, { storageKey }) => {
    await requireAdminIdentity(ctx)
    await ctx.scheduler.runAfter(0, internal.r2.clearUserObjectStorage, { key: storageKey })
  },
})

// ─── Queries ─────────────────────────────────────────────────────────────────

export const listDesignOutputs = query({
  args: {},
  handler: async (ctx) => {
    const adminUserId = await requireAdminIdentity(ctx)
    return ctx.db
      .query('designOutputs')
      .withIndex('by_adminUserId', (q) => q.eq('adminUserId', adminUserId))
      .order('desc')
      .take(200)
  },
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function bgRemovedKey(url: string): string | null {
  const base = process.env.R2_PUBLIC_URL
  if (!base) return null
  const prefix = base.endsWith('/') ? base : `${base}/`
  if (!url.startsWith(prefix)) return null
  return url.slice(prefix.length)
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export const updateBgRemovedUrl = internalMutation({
  args: { id: v.id('designOutputs'), bgRemovedUrl: v.string() },
  handler: async (ctx, { id, bgRemovedUrl }) => {
    const adminUserId = await requireAdminIdentity(ctx)
    const doc = await ctx.db.get(id)
    if (!doc || doc.adminUserId !== adminUserId) throw new Error('Forbidden')
    await ctx.db.patch(id, { bgRemovedUrl })
  },
})

export const updateUpscaledUrl = internalMutation({
  args: { id: v.id('designOutputs'), upscaledUrl: v.string() },
  handler: async (ctx, { id, upscaledUrl }) => {
    const adminUserId = await requireAdminIdentity(ctx)
    const doc = await ctx.db.get(id)
    if (!doc || doc.adminUserId !== adminUserId) throw new Error('Forbidden')
    await ctx.db.patch(id, { upscaledUrl })
  },
})

export const deleteDesignOutput = mutation({
  args: { id: v.id('designOutputs') },
  handler: async (ctx, { id }) => {
    const adminUserId = await requireAdminIdentity(ctx)
    const doc = await ctx.db.get(id)
    if (!doc) return
    if (doc.adminUserId !== adminUserId) throw new Error('Forbidden')
    await ctx.db.delete(id)
    await ctx.scheduler.runAfter(0, internal.r2.clearUserObjectStorage, { key: doc.storageKey })
    const nbKey = doc.bgRemovedUrl ? bgRemovedKey(doc.bgRemovedUrl) : null
    if (nbKey) await ctx.scheduler.runAfter(0, internal.r2.clearUserObjectStorage, { key: nbKey })
    const upKey = doc.upscaledUrl ? bgRemovedKey(doc.upscaledUrl) : null
    if (upKey) await ctx.scheduler.runAfter(0, internal.r2.clearUserObjectStorage, { key: upKey })
  },
})

export const bulkDeleteDesignOutputs = mutation({
  args: { ids: v.array(v.id('designOutputs')) },
  handler: async (ctx, { ids }) => {
    const adminUserId = await requireAdminIdentity(ctx)
    for (const id of ids) {
      const doc = await ctx.db.get(id)
      if (!doc || doc.adminUserId !== adminUserId) continue
      await ctx.db.delete(id)
      await ctx.scheduler.runAfter(0, internal.r2.clearUserObjectStorage, { key: doc.storageKey })
      const nbKey = doc.bgRemovedUrl ? bgRemovedKey(doc.bgRemovedUrl) : null
      if (nbKey) await ctx.scheduler.runAfter(0, internal.r2.clearUserObjectStorage, { key: nbKey })
      const upKey = doc.upscaledUrl ? bgRemovedKey(doc.upscaledUrl) : null
      if (upKey) await ctx.scheduler.runAfter(0, internal.r2.clearUserObjectStorage, { key: upKey })
    }
  },
})
