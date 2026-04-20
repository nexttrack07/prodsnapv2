import { v } from 'convex/values'
import {
  internalMutation,
  mutation,
  query,
} from './_generated/server'
import { api, components, internal } from './_generated/api'
import { WorkflowManager } from '@convex-dev/workflow'
import { Workpool } from '@convex-dev/workpool'

export const workflow = new WorkflowManager(components.workflow)
export const ingestPool = new Workpool(components.ingestPool, {
  maxParallelism: 3,
  retryActionsByDefault: true,
  defaultRetryBehavior: { maxAttempts: 2, initialBackoffMs: 2000, base: 2 },
})

// ─── Writes used by the ingestion workflow / seed ─────────────────────────
export const insertPendingTemplate = internalMutation({
  args: {
    imageUrl: v.string(),
    thumbnailUrl: v.string(),
    aspectRatio: v.union(
      v.literal('1:1'),
      v.literal('4:5'),
      v.literal('9:16'),
      v.literal('16:9'),
    ),
    width: v.number(),
    height: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('adTemplates', {
      ...args,
      status: 'pending',
    })
  },
})

export const markIngesting = internalMutation({
  args: { templateId: v.id('adTemplates') },
  handler: async (ctx, { templateId }) => {
    await ctx.db.patch(templateId, { status: 'ingesting', ingestError: undefined })
  },
})

export const saveTemplateAnalysis = internalMutation({
  args: {
    templateId: v.id('adTemplates'),
    embedding: v.array(v.float64()),
    category: v.string(),
    subcategory: v.optional(v.string()),
    sceneTypes: v.array(v.string()),
    moods: v.array(v.string()),
    sceneDescription: v.string(),
    aiTagsRaw: v.any(),
  },
  handler: async (ctx, { templateId, ...rest }) => {
    await ctx.db.patch(templateId, { ...rest, status: 'published' })
  },
})

export const markIngestFailed = internalMutation({
  args: { templateId: v.id('adTemplates'), error: v.string() },
  handler: async (ctx, { templateId, error }) => {
    await ctx.db.patch(templateId, { status: 'failed', ingestError: error })
  },
})

// ─── Ingestion workflow ───────────────────────────────────────────────────
export const ingestTemplateWorkflow = workflow.define({
  args: { templateId: v.id('adTemplates'), imageUrl: v.string() },
  handler: async (step, { templateId, imageUrl }) => {
    await step.runMutation(internal.templates.markIngesting, { templateId })
    try {
      const [{ embedding }, tags] = await Promise.all([
        step.runAction(internal.ai.computeClipEmbedding, { imageUrl }),
        step.runAction(internal.ai.computeTemplateTags, { imageUrl }),
      ])
      await step.runMutation(internal.templates.saveTemplateAnalysis, {
        templateId,
        embedding,
        category: tags.category,
        subcategory: tags.subcategory ?? undefined,
        sceneTypes: [...tags.scene_types],
        moods: [...tags.moods],
        sceneDescription: tags.scene_description,
        aiTagsRaw: tags,
      })
    } catch (err) {
      await step.runMutation(internal.templates.markIngestFailed, {
        templateId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  },
})

// ─── Public entry points ──────────────────────────────────────────────────

/**
 * Adds a single template to the library and kicks off ingestion (embed + tag).
 * For the POC this is the admin path; in production, guard with auth.
 */
export const createTemplate = mutation({
  args: {
    imageUrl: v.string(),
    thumbnailUrl: v.string(),
    aspectRatio: v.union(
      v.literal('1:1'),
      v.literal('4:5'),
      v.literal('9:16'),
      v.literal('16:9'),
    ),
    width: v.number(),
    height: v.number(),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert('adTemplates', { ...args, status: 'pending' })
    await workflow.start(ctx, internal.templates.ingestTemplateWorkflow, {
      templateId: id,
      imageUrl: args.imageUrl,
    })
    return id
  },
})

/**
 * Seeds the library with a handful of public Facebook-ad-style stock photos
 * so the wizard has something to match against.  Safe to re-run; only inserts
 * if `adTemplates` is empty.
 */
export const seedSampleTemplates = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query('adTemplates').take(1)
    if (existing.length > 0) return { skipped: true, inserted: 0 }

    const samples = getSampleTemplates()
    let inserted = 0
    for (const s of samples) {
      const id = await ctx.db.insert('adTemplates', { ...s, status: 'pending' })
      await workflow.start(ctx, internal.templates.ingestTemplateWorkflow, {
        templateId: id,
        imageUrl: s.imageUrl,
      })
      inserted++
    }
    return { skipped: false, inserted }
  },
})

// ─── Reads ────────────────────────────────────────────────────────────────
export const listPublished = query({
  args: {
    aspectRatio: v.optional(
      v.union(v.literal('1:1'), v.literal('4:5'), v.literal('9:16')),
    ),
  },
  handler: async (ctx, { aspectRatio }) => {
    const q = aspectRatio
      ? ctx.db
          .query('adTemplates')
          .withIndex('by_aspect_status', (x) =>
            x.eq('aspectRatio', aspectRatio).eq('status', 'published'),
          )
      : ctx.db.query('adTemplates').withIndex('by_status', (x) => x.eq('status', 'published'))
    return await q.collect()
  },
})

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('adTemplates').collect()
  },
})

export const getById = query({
  args: { id: v.id('adTemplates') },
  handler: async (ctx, { id }) => ctx.db.get(id),
})

/**
 * Retries ingestion for every template stuck in `failed` or `pending`.
 * Safe to call repeatedly.
 */
export const retryFailedIngestions = mutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query('adTemplates').collect()
    const candidates = all.filter(
      (t) => t.status === 'failed' || t.status === 'pending',
    )
    for (const t of candidates) {
      await ctx.db.patch(t._id, { status: 'pending', ingestError: undefined })
      await workflow.start(ctx, internal.templates.ingestTemplateWorkflow, {
        templateId: t._id,
        imageUrl: t.imageUrl,
      })
    }
    return { retried: candidates.length }
  },
})

/**
 * Retries ingestion for a single template (failed or published).  Useful
 * when tags need a refresh.
 */
export const retryTemplateIngest = mutation({
  args: { id: v.id('adTemplates') },
  handler: async (ctx, { id }) => {
    const t = await ctx.db.get(id)
    if (!t) throw new Error('Template not found')
    await ctx.db.patch(id, { status: 'pending', ingestError: undefined })
    await workflow.start(ctx, internal.templates.ingestTemplateWorkflow, {
      templateId: id,
      imageUrl: t.imageUrl,
    })
  },
})

/**
 * Deletes a template row.  Does NOT delete the R2 object — leave cleanup
 * for an offline sweep.
 */
export const deleteTemplate = mutation({
  args: { id: v.id('adTemplates') },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id)
  },
})

// ─── Sample data ──────────────────────────────────────────────────────────
/**
 * Publicly-hosted, CC-licensed product imagery from Unsplash (source.unsplash.com).
 * All 1:1 for the POC.  These are NOT Facebook ads per se — they're
 * product/lifestyle photos that the CLIP embedder can meaningfully index.
 */
function getSampleTemplates() {
  // Direct Unsplash image URLs (sized to 1024x1024).
  const base = (id: string) => `https://images.unsplash.com/photo-${id}?w=1024&h=1024&fit=crop&auto=format`
  const thumb = (id: string) => `https://images.unsplash.com/photo-${id}?w=512&h=512&fit=crop&auto=format&q=80`
  const items = [
    // Skincare/cosmetics
    '1556228720-195a672e8a03', // serum bottle flat lay
    '1608248543803-ba4f8c70ae0b', // lotion on stone
    '1522337360788-8b13dee7a37e', // bathroom counter cosmetic
    // Beverage
    '1544252890-c3e95e867f88', // coffee cup lifestyle
    '1523362628745-0c100150b504', // juice bottle outdoor
    // Apparel / accessories
    '1551232864-3f0890e580d9', // sneaker hero shot
    '1523275335684-37898b6baf30', // watch studio
  ]
  return items.map((id) => ({
    imageUrl: base(id),
    thumbnailUrl: thumb(id),
    aspectRatio: '1:1' as const,
    width: 1024,
    height: 1024,
  }))
}
