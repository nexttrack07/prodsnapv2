import { v } from 'convex/values'
import { paginationOptsValidator } from 'convex/server'
import {
  internalMutation,
  mutation,
  query,
} from './_generated/server'
import { components, internal } from './_generated/api'
import { WorkflowManager } from '@convex-dev/workflow'
import { logAdminAction, requireAdminIdentity } from './lib/admin/requireAdmin'

export const workflow = new WorkflowManager(components.workflow)

// ─── Writes used by the ingestion workflow ────────────────────────────────
export const markIngesting = internalMutation({
  args: { templateId: v.id('adTemplates') },
  handler: async (ctx, { templateId }) => {
    if (!(await ctx.db.get(templateId))) return
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
    // Playbook angle type — psychological lever this template fits best.
    // Optional because the AI is allowed to omit it when no clear match.
    angleType: v.optional(v.string()),
    // Legacy fields for backward compatibility
    moods: v.array(v.string()),
    aiTagsRaw: v.any(),
  },
  handler: async (ctx, { templateId, productCategory, ...rest }) => {
    if (!(await ctx.db.get(templateId))) return
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
    if (!(await ctx.db.get(templateId))) return
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
        angleType: tags.angleType ?? undefined,
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
    const adminUserId = await requireAdminIdentity(ctx)
    // Server-side dedup: if a row already exists with this content hash,
    // return its id instead of inserting a duplicate. The client also dedups
    // before upload, but this closes the multi-tab / hash-failure race.
    //
    // IMPORTANT: when we hit dedup, the bytes the client JUST uploaded to R2
    // are redundant — the existing row already points to its own R2 keys.
    // We must schedule cleanup of the new keys here, otherwise they leak.
    // The client cannot do this cleanup itself because, from its perspective,
    // createTemplate succeeded (returned an id without throwing).
    const hash = args.contentHash
    if (hash) {
      const existing = await ctx.db
        .query('adTemplates')
        .withIndex('by_content_hash', (q) => q.eq('contentHash', hash))
        .first()
      if (existing) {
        if (args.imageStorageKey) {
          await ctx.scheduler.runAfter(0, internal.r2.clearTemplateStorage, {
            key: args.imageStorageKey,
          })
        }
        if (
          args.thumbnailStorageKey &&
          args.thumbnailStorageKey !== args.imageStorageKey
        ) {
          await ctx.scheduler.runAfter(0, internal.r2.clearTemplateStorage, {
            key: args.thumbnailStorageKey,
          })
        }
        return existing._id
      }
    }
    const id = await ctx.db.insert('adTemplates', { ...args, status: 'pending' })
    await workflow.start(ctx, internal.templates.ingestTemplateWorkflow, {
      templateId: id,
      imageUrl: args.imageUrl,
    })
    await logAdminAction(ctx, adminUserId, {
      action: 'template.create',
      targetId: id,
    })
    return id
  },
})

// ─── Reads ────────────────────────────────────────────────────────────────
export const listPublished = query({
  args: {
    aspectRatio: v.optional(
      v.union(
        v.literal('1:1'),
        v.literal('4:5'),
        v.literal('9:16'),
        v.literal('16:9'),
      ),
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
 * Aggregated status counts for the admin stats pills. Single full collect +
 * local reduce — at <500 rows this is cheaper than 4 indexed scans because
 * each scan also materializes the matching rows, so the cumulative read cost
 * is the same as one full collect. Past ~10k rows move to the Convex
 * Aggregate component for O(1) reads.
 */
export const getCounts = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminIdentity(ctx)
    const all = await ctx.db.query('adTemplates').collect()
    let published = 0
    let pending = 0
    let failed = 0
    for (const row of all) {
      if (row.status === 'published') published++
      else if (row.status === 'failed') failed++
      else pending++ // 'pending' or 'ingesting'
    }
    return {
      total: all.length,
      published,
      pending,
      failed,
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

/**
 * Retries ingestion for a single template (failed or published).  Useful
 * when tags need a refresh. Skips templates already in pending/ingesting
 * state so a double-click doesn't fire two paid AI calls for the same row.
 */
export const retryTemplateIngest = mutation({
  args: { id: v.id('adTemplates') },
  handler: async (ctx, { id }) => {
    const adminUserId = await requireAdminIdentity(ctx)
    const t = await ctx.db.get(id)
    if (!t) throw new Error('Template not found')
    // Already-running guard: don't fire a second workflow for a template
    // that's currently being ingested. Avoids paying for duplicate AI calls
    // when the admin double-clicks Re-tag.
    if (t.status === 'pending' || t.status === 'ingesting') {
      return { skipped: true as const, reason: 'already-running' as const }
    }
    await ctx.db.patch(id, { status: 'pending', ingestError: undefined })
    await workflow.start(ctx, internal.templates.ingestTemplateWorkflow, {
      templateId: id,
      imageUrl: t.imageUrl,
    })
    await logAdminAction(ctx, adminUserId, {
      action: 'template.retry',
      targetId: id,
    })
    return { skipped: false as const }
  },
})

/**
 * Retries ingestion for a batch of templates. Used by the admin UI for
 * bulk re-tagging selected templates.
 */
export const retryTemplatesBatch = mutation({
  args: { ids: v.array(v.id('adTemplates')) },
  handler: async (ctx, { ids }) => {
    const adminUserId = await requireAdminIdentity(ctx)
    let queued = 0
    let alreadyRunning = 0
    const queuedIds: Array<typeof ids[number]> = []
    for (const id of ids) {
      const t = await ctx.db.get(id)
      if (!t) continue
      // Skip rows that are already mid-ingest — see retryTemplateIngest.
      if (t.status === 'pending' || t.status === 'ingesting') {
        alreadyRunning++
        continue
      }
      await ctx.db.patch(id, { status: 'pending', ingestError: undefined })
      await workflow.start(ctx, internal.templates.ingestTemplateWorkflow, {
        templateId: id,
        imageUrl: t.imageUrl,
      })
      queuedIds.push(id)
      queued++
    }
    if (queued > 0) {
      await logAdminAction(ctx, adminUserId, {
        action: 'template.retry-batch',
        details: { queued, alreadyRunning, ids: queuedIds },
      })
    }
    return { queued, alreadyRunning }
  },
})

/**
 * Best-effort cleanup of an R2 upload that never made it into the templates
 * table. The client invokes this when createTemplate throws after
 * uploadTemplateImage already wrote the bytes to R2 — without it, those
 * orphans leak forever. Same-key dedup matches deleteTemplate so an
 * abandoned upload where thumbnail and image happened to share a key
 * isn't double-deleted.
 */
export const cleanupOrphanedUpload = mutation({
  args: {
    imageStorageKey: v.optional(v.string()),
    thumbnailStorageKey: v.optional(v.string()),
  },
  handler: async (ctx, { imageStorageKey, thumbnailStorageKey }) => {
    const adminUserId = await requireAdminIdentity(ctx)
    if (imageStorageKey) {
      await ctx.scheduler.runAfter(0, internal.r2.clearTemplateStorage, {
        key: imageStorageKey,
      })
    }
    if (
      thumbnailStorageKey &&
      thumbnailStorageKey !== imageStorageKey
    ) {
      await ctx.scheduler.runAfter(0, internal.r2.clearTemplateStorage, {
        key: thumbnailStorageKey,
      })
    }
    if (imageStorageKey || thumbnailStorageKey) {
      await logAdminAction(ctx, adminUserId, {
        action: 'template.cleanup-orphan',
        details: { imageStorageKey, thumbnailStorageKey },
      })
    }
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
    const adminUserId = await requireAdminIdentity(ctx)
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
    await logAdminAction(ctx, adminUserId, {
      action: 'template.delete',
      targetId: id,
    })
  },
})

