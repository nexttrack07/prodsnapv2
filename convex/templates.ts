import { v } from 'convex/values'
import { paginationOptsValidator } from 'convex/server'
import {
  internalMutation,
  mutation,
  query,
} from './_generated/server'
import { components, internal } from './_generated/api'
import type { TemplateStrategy, TemplateAdaptation } from './ai'
import { WorkflowManager } from '@convex-dev/workflow'
import { logAdminAction, requireAdminIdentity } from './lib/admin/requireAdmin'

export const workflow = new WorkflowManager(components.workflow)

// Mirrors REASONING_MODEL in ai.ts. Duplicated (not imported) because ai.ts is
// a `'use node'` module and importing from it into this (default-runtime)
// mutations file would drag the Node action runtime in. Keep in sync.
const REASONING_MODEL_VERSION = 'google/gemini-2.5-pro'

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

// Validator for the nested Template Intelligence object. Kept here next to the
// mutation that writes it; mirrors the `adTemplates.intelligence` shape in
// schema.ts. `extractedAt` is stamped by the caller (workflow handler).
const intelligenceValidator = v.object({
  look: v.object({
    visibleText: v.object({
      headline: v.optional(v.string()),
      subheadline: v.optional(v.string()),
      body: v.optional(v.string()),
      badge: v.optional(v.string()),
      cta: v.optional(v.string()),
    }),
    productPlacement: v.optional(v.string()),
    humanPresence: v.optional(v.string()),
    negativeSpace: v.optional(v.string()),
    safeZones: v.optional(v.array(v.string())),
  }),
  strategy: v.object({
    angle: v.object({
      title: v.string(),
      insight: v.string(),
      angleType: v.optional(v.string()),
    }),
    hook: v.string(),
    creativeConcept: v.string(),
    targetBuyer: v.string(),
    claims: v.array(v.string()),
    cta: v.optional(v.string()),
    proofType: v.optional(v.string()),
    emotionalDriver: v.optional(v.string()),
    funnelStage: v.optional(v.string()),
    buyerAwareness: v.optional(v.string()),
    bestFor: v.object({
      productCategories: v.array(v.string()),
      badFitCategories: v.array(v.string()),
      neededAssets: v.array(v.string()),
    }),
  }),
  adaptation: v.object({
    creativeArchetype: v.string(),
    coreMechanic: v.string(),
    adaptationInstructions: v.string(),
    productSubstitutionRules: v.array(v.string()),
    preserve: v.array(v.string()),
    avoid: v.array(v.string()),
  }),
  reverseEngineeredPrompt: v.string(),
  extractedAt: v.number(),
  modelVersion: v.optional(v.string()),
})

export const saveTemplateIntelligence = internalMutation({
  args: {
    templateId: v.id('adTemplates'),
    intelligence: intelligenceValidator,
  },
  handler: async (ctx, { templateId, intelligence }) => {
    if (!(await ctx.db.get(templateId))) return
    await ctx.db.patch(templateId, { intelligence })
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
      // ─── Pass A (vision/Flash): flat visual tags + the on-image "look".
      // Required: if this fails, the template can't be classified at all, so
      // we fall through to markIngestFailed (current behavior).
      const tags = await step.runAction(internal.ai.computeTemplateTags, { imageUrl })

      // ─── Passes B + C (reasoning model): best-effort. A flaky Pro call must
      // NOT block the library — we still publish with flat tags below. We only
      // write the `intelligence` object when BOTH strategy (B) and adaptation
      // (C) succeed, because the schema requires both. Pass C is also gated on
      // B succeeding, since it reasons over B's output.
      let strategy: TemplateStrategy | null = null
      try {
        strategy = await step.runAction(internal.ai.computeTemplateStrategy, { imageUrl })
      } catch (err) {
        console.error(
          `[ingestTemplateWorkflow] template ${templateId}: strategy pass (B) failed, publishing with flat tags only: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      }

      let adaptation: TemplateAdaptation | null = null
      if (strategy) {
        try {
          adaptation = await step.runAction(internal.ai.computeTemplateAdaptation, {
            imageUrl,
            strategyJson: JSON.stringify(strategy),
            lookJson: JSON.stringify(tags.look),
          })
        } catch (err) {
          console.error(
            `[ingestTemplateWorkflow] template ${templateId}: adaptation pass (C) failed, publishing with flat tags only: ${
              err instanceof Error ? err.message : String(err)
            }`,
          )
        }
      }

      // Always save flat tags + publish (back-compat, library availability).
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

      // Store the deep intelligence only when both reasoning passes landed
      // (the schema requires strategy + adaptation). If either failed we skip
      // this write — the template is still published with flat tags above.
      if (strategy && adaptation) {
        await step.runMutation(internal.templates.saveTemplateIntelligence, {
          templateId,
          intelligence: {
            look: {
              visibleText: {
                headline: tags.look.visibleText?.headline,
                subheadline: tags.look.visibleText?.subheadline,
                body: tags.look.visibleText?.body,
                badge: tags.look.visibleText?.badge,
                cta: tags.look.visibleText?.cta,
              },
              productPlacement: tags.look.productPlacement,
              humanPresence: tags.look.humanPresence,
              negativeSpace: tags.look.negativeSpace,
              safeZones: tags.look.safeZones,
            },
            strategy,
            adaptation: adaptation.adaptation,
            reverseEngineeredPrompt: adaptation.reverseEngineeredPrompt,
            // Date.now() is fine here: this is a workflow.define handler running
            // server-side (not a Workflow *script*), so it's allowed.
            extractedAt: Date.now(),
            modelVersion: REASONING_MODEL_VERSION,
          },
        })
      } else {
        console.warn(
          `[ingestTemplateWorkflow] template ${templateId}: published with flat tags but WITHOUT intelligence (strategy=${!!strategy}, adaptation=${!!adaptation}).`,
        )
      }
    } catch (err) {
      await step.runMutation(internal.templates.markIngestFailed, {
        templateId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  },
})

// ─── Public entry points ──────────────────────────────────────────────────

// Partial validator for updateTemplateIntelligence — all sub-objects and leaf
// fields are optional so the admin can patch individual fields without
// resubmitting the full intelligence object.
const partialIntelligenceValidator = v.object({
  look: v.optional(
    v.object({
      visibleText: v.optional(
        v.object({
          headline: v.optional(v.string()),
          subheadline: v.optional(v.string()),
          body: v.optional(v.string()),
          badge: v.optional(v.string()),
          cta: v.optional(v.string()),
        }),
      ),
      productPlacement: v.optional(v.string()),
      humanPresence: v.optional(v.string()),
      negativeSpace: v.optional(v.string()),
      safeZones: v.optional(v.array(v.string())),
    }),
  ),
  strategy: v.optional(
    v.object({
      angle: v.optional(
        v.object({
          title: v.optional(v.string()),
          insight: v.optional(v.string()),
          angleType: v.optional(v.string()),
        }),
      ),
      hook: v.optional(v.string()),
      creativeConcept: v.optional(v.string()),
      targetBuyer: v.optional(v.string()),
      claims: v.optional(v.array(v.string())),
      cta: v.optional(v.string()),
      proofType: v.optional(v.string()),
      emotionalDriver: v.optional(v.string()),
      funnelStage: v.optional(v.string()),
      buyerAwareness: v.optional(v.string()),
      bestFor: v.optional(
        v.object({
          productCategories: v.optional(v.array(v.string())),
          badFitCategories: v.optional(v.array(v.string())),
          neededAssets: v.optional(v.array(v.string())),
        }),
      ),
    }),
  ),
  adaptation: v.optional(
    v.object({
      creativeArchetype: v.optional(v.string()),
      coreMechanic: v.optional(v.string()),
      adaptationInstructions: v.optional(v.string()),
      productSubstitutionRules: v.optional(v.array(v.string())),
      preserve: v.optional(v.array(v.string())),
      avoid: v.optional(v.array(v.string())),
    }),
  ),
  reverseEngineeredPrompt: v.optional(v.string()),
})

/**
 * Admin mutation to partially update a template's intelligence object.
 * Deep-merges the provided partial intelligence over the existing value so
 * the admin can edit individual fields without resubmitting everything.
 */
export const updateTemplateIntelligence = mutation({
  args: {
    templateId: v.id('adTemplates'),
    intelligence: partialIntelligenceValidator,
  },
  handler: async (ctx, { templateId, intelligence }) => {
    const adminUserId = await requireAdminIdentity(ctx)
    const existing = await ctx.db.get(templateId)
    if (!existing) throw new Error('Template not found')

    const base = existing.intelligence
    // The schema requires a full intelligence object (look/strategy/adaptation/
    // reverseEngineeredPrompt/extractedAt all present). This partial-edit path
    // only ever produces a valid object by spreading an existing `base`; with no
    // base, `merged` would be missing required fields (e.g. extractedAt) and the
    // patch would throw. Editing requires intelligence to exist first.
    if (!base) {
      throw new Error(
        'Template has no intelligence to edit yet — run Re-analyze first.',
      )
    }

    // Deep-merge: each top-level section (look, strategy, adaptation) is
    // merged individually so a partial update to strategy.angle doesn't wipe
    // strategy.hook, and so on.
    const merged = {
      ...base,
      ...(intelligence.look !== undefined
        ? {
            look: {
              ...base?.look,
              ...intelligence.look,
              visibleText: {
                ...base?.look?.visibleText,
                ...intelligence.look.visibleText,
              },
            },
          }
        : {}),
      ...(intelligence.strategy !== undefined
        ? {
            strategy: {
              ...base?.strategy,
              ...intelligence.strategy,
              angle: {
                ...base?.strategy?.angle,
                ...intelligence.strategy.angle,
              },
              bestFor: {
                ...base?.strategy?.bestFor,
                ...intelligence.strategy.bestFor,
              },
            },
          }
        : {}),
      ...(intelligence.adaptation !== undefined
        ? {
            adaptation: {
              ...base?.adaptation,
              ...intelligence.adaptation,
            },
          }
        : {}),
      ...(intelligence.reverseEngineeredPrompt !== undefined
        ? { reverseEngineeredPrompt: intelligence.reverseEngineeredPrompt }
        : {}),
    }

    await ctx.db.patch(templateId, { intelligence: merged as typeof existing.intelligence })
    await logAdminAction(ctx, adminUserId, {
      action: 'template.updateIntelligence',
      targetId: templateId,
    })
  },
})

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
    const rows = await q.take(1000)
    // Curated library only — never leak user-owned custom templates here.
    return rows.filter((t) => !t.ownerUserId)
  },
})

/**
 * Fetch a single template by id for the preview drawer. Returns the row only
 * if the caller may view it: a curated row (no owner), an admin-approved public
 * custom row, or the caller's own upload. Returns null otherwise (unknown id,
 * not published, or someone else's private/pending template).
 *
 * This lets the templates page open a preview reliably from a `?preview=<id>`
 * deep link (e.g. the home shelf) without depending on the clicked template
 * happening to be in the first page of the paginated browse query.
 */
export const getViewableById = query({
  args: { id: v.id('adTemplates') },
  handler: async (ctx, { id }) => {
    const tpl = await ctx.db.get(id)
    if (!tpl || tpl.status !== 'published') return null
    if (!tpl.ownerUserId) return tpl // curated library row
    if (tpl.visibility === 'public') return tpl
    const identity = await ctx.auth.getUserIdentity()
    if (identity && tpl.ownerUserId === identity.tokenIdentifier) return tpl
    return null
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
    // Admin stats cover the curated library only — exclude custom rows.
    const all = (await ctx.db.query('adTemplates').collect()).filter(
      (t) => !t.ownerUserId,
    )
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
    // Dedup is curated-library only — custom uploads don't participate.
    const templates = (await ctx.db.query('adTemplates').collect()).filter(
      (t) => !t.ownerUserId,
    )
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
