import { v } from 'convex/values'
import { paginationOptsValidator } from 'convex/server'
import {
  internalMutation,
  mutation,
  query,
} from './_generated/server'
import { components, internal } from './_generated/api'
import { WorkflowManager } from '@convex-dev/workflow'
import { Workpool } from '@convex-dev/workpool'
import { requireAdminIdentity } from './lib/admin/requireAdmin'

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
    // Structured tags (each is exactly ONE value)
    productCategory: v.string(),
    primaryColor: v.string(),
    imageStyle: v.string(),
    setting: v.string(),
    composition: v.string(),
    textAmount: v.string(),
    subcategory: v.optional(v.string()),
    sceneDescription: v.string(),
    // Legacy fields for backward compatibility
    moods: v.array(v.string()),
    aiTagsRaw: v.any(),
  },
  handler: async (ctx, { templateId, productCategory, ...rest }) => {
    await ctx.db.patch(templateId, {
      ...rest,
      productCategory,
      // Also set legacy 'category' field for backward compatibility
      category: productCategory,
      status: 'published',
    })
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
      const tags = await step.runAction(internal.ai.computeTemplateTags, { imageUrl })
      await step.runMutation(internal.templates.saveTemplateAnalysis, {
        templateId,
        // Structured tags (exactly ONE per category)
        productCategory: tags.productCategory,
        primaryColor: tags.primaryColor,
        imageStyle: tags.imageStyle,
        setting: tags.setting,
        composition: tags.composition,
        textAmount: tags.textAmount,
        subcategory: tags.subcategory ?? undefined,
        sceneDescription: tags.sceneDescription,
        // Legacy fields
        moods: [...tags.moods],
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
 * Admin-only: gated by requireAdminIdentity (CLERK_ADMIN_USER_IDS env list).
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
    contentHash: v.optional(v.string()),
    imageStorageKey: v.optional(v.string()),
    thumbnailStorageKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdminIdentity(ctx)
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
    await requireAdminIdentity(ctx)
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

/**
 * Paginated list of templates for the admin grid (newest first).
 * Replaces the old non-paginated `listAll`. Admin-only.
 */
export const listPaginated = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    await requireAdminIdentity(ctx)
    return await ctx.db
      .query('adTemplates')
      .order('desc')
      .paginate(paginationOpts)
  },
})

/**
 * Aggregated status counts for the admin stats pills. Uses the by_status
 * index to avoid a full table scan in the hot path. Past ~10k rows this
 * should move to the Convex Aggregate component for O(1) reads.
 */
export const getCounts = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminIdentity(ctx)
    const [published, ingesting, pending, failed] = await Promise.all([
      ctx.db
        .query('adTemplates')
        .withIndex('by_status', (q) => q.eq('status', 'published'))
        .collect(),
      ctx.db
        .query('adTemplates')
        .withIndex('by_status', (q) => q.eq('status', 'ingesting'))
        .collect(),
      ctx.db
        .query('adTemplates')
        .withIndex('by_status', (q) => q.eq('status', 'pending'))
        .collect(),
      ctx.db
        .query('adTemplates')
        .withIndex('by_status', (q) => q.eq('status', 'failed'))
        .collect(),
    ])
    return {
      total:
        published.length + ingesting.length + pending.length + failed.length,
      published: published.length,
      pending: pending.length + ingesting.length,
      failed: failed.length,
    }
  },
})

/**
 * Returns all existing content hashes for duplicate detection.
 * Client computes SHA-256 of new files and checks against this set.
 */
export const getExistingHashes = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminIdentity(ctx)
    const templates = await ctx.db.query('adTemplates').collect()
    return templates
      .map((t) => t.contentHash)
      .filter((h): h is string => h != null)
  },
})

export const getById = query({
  args: { id: v.id('adTemplates') },
  handler: async (ctx, { id }) => ctx.db.get(id),
})

/**
 * Retries ingestion for a single template (failed or published).  Useful
 * when tags need a refresh.
 */
export const retryTemplateIngest = mutation({
  args: { id: v.id('adTemplates') },
  handler: async (ctx, { id }) => {
    await requireAdminIdentity(ctx)
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
 * Retries ingestion for a batch of templates. Used by the admin UI for
 * bulk re-tagging selected templates.
 */
export const retryTemplatesBatch = mutation({
  args: { ids: v.array(v.id('adTemplates')) },
  handler: async (ctx, { ids }) => {
    await requireAdminIdentity(ctx)
    let queued = 0
    for (const id of ids) {
      const t = await ctx.db.get(id)
      if (!t) continue
      await ctx.db.patch(id, { status: 'pending', ingestError: undefined })
      await workflow.start(ctx, internal.templates.ingestTemplateWorkflow, {
        templateId: id,
        imageUrl: t.imageUrl,
      })
      queued++
    }
    return { queued }
  },
})

/**
 * Deletes a template row + best-effort cleanup of the R2 objects backing
 * its image and thumbnail. Legacy rows uploaded before storage keys were
 * tracked have no key and leak (will need an offline sweep).
 */
export const deleteTemplate = mutation({
  args: { id: v.id('adTemplates') },
  handler: async (ctx, { id }) => {
    await requireAdminIdentity(ctx)
    const row = await ctx.db.get(id)
    if (!row) return
    await ctx.db.delete(id)
    if (row.imageStorageKey) {
      await ctx.scheduler.runAfter(0, internal.r2.clearTemplateStorage, {
        key: row.imageStorageKey,
      })
    }
    if (
      row.thumbnailStorageKey &&
      row.thumbnailStorageKey !== row.imageStorageKey
    ) {
      await ctx.scheduler.runAfter(0, internal.r2.clearTemplateStorage, {
        key: row.thumbnailStorageKey,
      })
    }
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
