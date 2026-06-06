import { v } from 'convex/values'
import { query, mutation, internalQuery, internalMutation } from './_generated/server'
import { internal } from './_generated/api'
import { requireAdminIdentity } from './lib/admin/requireAdmin'

export const listIdeas = query({
  args: {},
  handler: async (ctx) => {
    const adminUserId = await requireAdminIdentity(ctx)
    return ctx.db
      .query('ideas')
      .withIndex('by_adminUserId', q => q.eq('adminUserId', adminUserId))
      .order('desc')
      .take(500)
  },
})

export const saveIdeas = mutation({
  args: {
    ideas: v.array(v.object({
      title: v.string(),
      typography: v.string(),
      imageDescription: v.string(),
      style: v.string(),
      colorPalette: v.string(),
      mood: v.string(),
      generationPrompt: v.string(),
      sourceInstruction: v.optional(v.string()),
    })),
  },
  handler: async (ctx, { ideas }) => {
    const adminUserId = await requireAdminIdentity(ctx)
    const now = Date.now()
    for (const idea of ideas) {
      await ctx.db.insert('ideas', {
        adminUserId,
        ...idea,
        status: 'pending',
        createdAt: now,
      })
    }
  },
})

export const updateIdea = mutation({
  args: {
    id: v.id('ideas'),
    title: v.optional(v.string()),
    typography: v.optional(v.string()),
    imageDescription: v.optional(v.string()),
    style: v.optional(v.string()),
    colorPalette: v.optional(v.string()),
    mood: v.optional(v.string()),
    generationPrompt: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...updates }) => {
    const adminUserId = await requireAdminIdentity(ctx)
    const doc = await ctx.db.get(id)
    if (!doc || doc.adminUserId !== adminUserId) throw new Error('Forbidden')
    if (doc.status === 'queued' || doc.status === 'generating') {
      throw new Error('Cannot edit while queued or generating')
    }
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined),
    )
    await ctx.db.patch(id, filtered)
  },
})

export const deleteIdea = mutation({
  args: { id: v.id('ideas') },
  handler: async (ctx, { id }) => {
    const adminUserId = await requireAdminIdentity(ctx)
    const doc = await ctx.db.get(id)
    if (!doc || doc.adminUserId !== adminUserId) throw new Error('Forbidden')
    await ctx.db.delete(id)
  },
})

export const queueIdeas = mutation({
  args: { ids: v.array(v.id('ideas')) },
  handler: async (ctx, { ids }) => {
    const adminUserId = await requireAdminIdentity(ctx)
    for (const id of ids) {
      const doc = await ctx.db.get(id)
      if (!doc || doc.adminUserId !== adminUserId) continue
      if (doc.status !== 'pending' && doc.status !== 'failed') continue
      await ctx.db.patch(id, { status: 'queued', errorMessage: undefined })
      await ctx.scheduler.runAfter(0, internal.ideaActions.processIdea, {
        ideaId: id,
        adminUserId,
      })
    }
  },
})

// ─── Internal (called by ideaActions) ────────────────────────────────────────

export const getIdea = internalQuery({
  args: { id: v.id('ideas') },
  handler: async (ctx, { id }) => ctx.db.get(id),
})

export const markGenerating = internalMutation({
  args: { id: v.id('ideas') },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { status: 'generating' })
  },
})

export const markFailed = internalMutation({
  args: { id: v.id('ideas'), errorMessage: v.string() },
  handler: async (ctx, { id, errorMessage }) => {
    await ctx.db.patch(id, { status: 'failed', errorMessage })
  },
})

export const completeIdea = internalMutation({
  args: {
    id: v.id('ideas'),
    adminUserId: v.string(),
    imageUrl: v.string(),
    storageKey: v.string(),
    prompt: v.string(),
    promptTitle: v.string(),
    bgRemovedUrl: v.optional(v.string()),
  },
  handler: async (ctx, { id, adminUserId, imageUrl, storageKey, prompt, promptTitle, bgRemovedUrl }) => {
    const idea = await ctx.db.get(id)
    if (!idea) return
    await ctx.db.insert('designOutputs', {
      adminUserId,
      imageUrl,
      storageKey,
      prompt,
      promptTitle,
      conceptTitle: idea.title,
      referenceImageUrls: [],
      bgRemovedUrl,
      createdAt: Date.now(),
    })
    await ctx.db.delete(id)
  },
})
