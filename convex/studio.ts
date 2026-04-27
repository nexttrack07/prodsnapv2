import { v } from 'convex/values'
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server'
import { components, internal } from './_generated/api'
import { WorkflowManager } from '@convex-dev/workflow'
import { Workpool } from '@convex-dev/workpool'
import type { Id } from './_generated/dataModel'
import {
  CAPABILITIES,
  recordCreditUse,
  requireCapability,
  requireCredit,
} from './lib/billing'

export const workflow = new WorkflowManager(components.workflow)
export const imageGenPool = new Workpool(components.imageGenPool, {
  maxParallelism: 5,
  retryActionsByDefault: true,
  defaultRetryBehavior: { maxAttempts: 2, initialBackoffMs: 3000, base: 2 },
})

// ─── Auth helpers ──────────────────────────────────────────────────────────
async function requireAuth(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error('Not authenticated')
  return identity.tokenIdentifier
}

/**
 * Asserts the caller owns `row` when the row has a `userId` field set.
 * Legacy rows (pre-auth) with no userId are allowed through — intentional for
 * backward compatibility on deprecated tables. New rows always carry userId.
 */
function assertOwnsIfTracked(row: { userId?: string }, userId: string, label: string) {
  if (row.userId !== undefined && row.userId !== userId) {
    throw new Error(`Not authorized to access ${label}`)
  }
}

// ─── Run lifecycle mutations ──────────────────────────────────────────────
export const createRun = mutation({
  args: { productImageUrl: v.string() },
  handler: async (ctx, { productImageUrl }) => {
    const userId = await requireAuth(ctx)
    const runId = await ctx.db.insert('studioRuns', {
      productImageUrl,
      status: 'analyzing',
      userId,
    })
    // Fire-and-forget analysis — flips run to 'ready' or 'failed'.
    await ctx.scheduler.runAfter(0, internal.studio.runAnalysis, { runId })
    return runId
  },
})

export const runAnalysis = internalAction({
  args: { runId: v.id('studioRuns') },
  handler: async (ctx, { runId }) => {
    const run = await ctx.runQuery(internal.studio.getRunInternal, { runId })
    if (!run) return
    try {
      const result = await ctx.runAction(internal.ai.analyzeProduct, {
        imageUrl: run.productImageUrl,
      })
      await ctx.runMutation(internal.studio.saveRunAnalysis, {
        runId,
        category: result.category,
        productDescription: result.productDescription,
        targetAudience: result.targetAudience,
      })
    } catch (err) {
      await ctx.runMutation(internal.studio.markRunFailed, {
        runId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  },
})

export const saveRunAnalysis = internalMutation({
  args: {
    runId: v.id('studioRuns'),
    category: v.string(),
    productDescription: v.string(),
    targetAudience: v.string(),
  },
  handler: async (ctx, { runId, ...rest }) => {
    await ctx.db.patch(runId, { ...rest, status: 'ready' })
  },
})

/**
 * Lets the user edit the AI-generated description / target audience.
 * Called when they manually tweak the analysis card in Step 2.
 */
export const updateRunAnalysis = mutation({
  args: {
    runId: v.id('studioRuns'),
    productDescription: v.optional(v.string()),
    targetAudience: v.optional(v.string()),
  },
  handler: async (ctx, { runId, productDescription, targetAudience }) => {
    const userId = await requireAuth(ctx)
    const run = await ctx.db.get(runId)
    if (!run) throw new Error('Run not found')
    assertOwnsIfTracked(run, userId, 'run')
    const patch: Record<string, string> = {}
    if (productDescription !== undefined) patch.productDescription = productDescription
    if (targetAudience !== undefined) patch.targetAudience = targetAudience
    if (Object.keys(patch).length > 0) await ctx.db.patch(runId, patch)
  },
})

/**
 * Re-runs product analysis on an existing run.  The UI calls this when the
 * user hits "Re-analyze".
 */
export const reanalyze = mutation({
  args: { runId: v.id('studioRuns') },
  handler: async (ctx, { runId }) => {
    const userId = await requireAuth(ctx)
    const run = await ctx.db.get(runId)
    if (!run) throw new Error('Run not found')
    assertOwnsIfTracked(run, userId, 'run')
    await ctx.db.patch(runId, {
      status: 'analyzing',
      error: undefined,
    })
    await ctx.scheduler.runAfter(0, internal.studio.runAnalysis, { runId })
  },
})

export const markRunFailed = internalMutation({
  args: { runId: v.id('studioRuns'), error: v.string() },
  handler: async (ctx, { runId, error }) => {
    await ctx.db.patch(runId, { status: 'failed', error })
  },
})

export const getRunInternal = internalQuery({
  args: { runId: v.id('studioRuns') },
  handler: async (ctx, { runId }) => ctx.db.get(runId),
})

// ─── Reactive reads the UI uses ───────────────────────────────────────────
export const getRun = query({
  args: { runId: v.id('studioRuns') },
  handler: async (ctx, { runId }) => ctx.db.get(runId),
})

export const getGenerations = query({
  args: { runId: v.id('studioRuns') },
  handler: async (ctx, { runId }) => {
    const rows = await ctx.db
      .query('templateGenerations')
      .withIndex('by_run', (q) => q.eq('runId', runId))
      .collect()
    // Attach template for display (skip when this generation seeds from an
    // angle, not a template).
    const withTemplate = await Promise.all(
      rows.map(async (r) => ({
        ...r,
        template: r.templateId ? await ctx.db.get(r.templateId) : null,
      })),
    )
    return withTemplate.sort((a, b) => a.variationIndex - b.variationIndex)
  },
})

// ─── Template matching (query-based, no embeddings) ───────────────────────
export const matchTemplates = query({
  args: {
    runId: v.id('studioRuns'),
    aspectRatio: v.union(
      v.literal('1:1'),
      v.literal('4:5'),
      v.literal('9:16'),
    ),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
    shuffle: v.optional(v.boolean()),
    shuffleSeed: v.optional(v.number()), // Seed for deterministic shuffle (required when shuffle=true)
  },
  handler: async (
    ctx,
    { runId, aspectRatio, limit, offset, shuffle, shuffleSeed },
  ): Promise<{
    rows: Array<{
      _id: Id<'adTemplates'>
      _score: number
      imageUrl: string
      thumbnailUrl: string
      aspectRatio: string
      category?: string
      subcategory?: string
    }>
    hasMore: boolean
    nextOffset: number
  }> => {
    const run = await ctx.db.get(runId)
    if (!run) throw new Error('Run not found')

    const pageSize = limit ?? 24
    const startOffset = offset ?? 0

    // Query published templates with matching aspect ratio
    const all = await ctx.db
      .query('adTemplates')
      .withIndex('by_aspect_status', (q) =>
        q.eq('aspectRatio', aspectRatio).eq('status', 'published'),
      )
      .collect()

    // Add a score of 1.0 for all (no vector ranking)
    let filtered = all.map((tpl) => ({ ...tpl, _score: 1.0 }))

    if (shuffle) {
      // Seeded Fisher-Yates shuffle for deterministic pagination
      // Uses a simple mulberry32 PRNG seeded by shuffleSeed
      const seed = shuffleSeed ?? Date.now()
      let state = seed
      const random = () => {
        state = (state + 0x6d2b79f5) | 0
        let t = Math.imul(state ^ (state >>> 15), 1 | state)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
      }
      for (let i = filtered.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1))
        ;[filtered[i], filtered[j]] = [filtered[j], filtered[i]]
      }
    }

    const page = filtered.slice(startOffset, startOffset + pageSize)
    const hasMore = !shuffle && filtered.length > startOffset + pageSize
    return {
      rows: page,
      hasMore,
      nextOffset: startOffset + page.length,
    }
  },
})

export const getTemplateInternal = internalQuery({
  args: { id: v.id('adTemplates') },
  handler: async (ctx, { id }) => ctx.db.get(id),
})

// ─── Submit + generate ────────────────────────────────────────────────────
export const submitRun = mutation({
  args: {
    runId: v.id('studioRuns'),
    templateIds: v.array(v.id('adTemplates')),
    mode: v.union(v.literal('exact'), v.literal('remix')),
    colorAdapt: v.boolean(),
    variationsPerTemplate: v.number(),
    aspectRatio: v.union(
      v.literal('1:1'),
      v.literal('4:5'),
      v.literal('9:16'),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx)
    if (args.templateIds.length === 0) throw new Error('No templates selected')
    if (args.templateIds.length > 3) throw new Error('At most 3 templates')
    if (args.variationsPerTemplate < 1 || args.variationsPerTemplate > 4) {
      throw new Error('variations must be 1-4')
    }
    const run = await ctx.db.get(args.runId)
    if (!run) throw new Error('Run not found')
    assertOwnsIfTracked(run, userId, 'run')
    if (run.status !== 'ready' && run.status !== 'complete') {
      throw new Error(`Run not ready (status=${run.status})`)
    }

    // Billing: capability + credit enforcement (same gates as generateFromProduct).
    const billing = await requireCapability(
      ctx,
      CAPABILITIES.GENERATE_VARIATIONS,
      'submitRun',
    )
    if (args.variationsPerTemplate > 2) {
      await requireCapability(ctx, CAPABILITIES.BATCH_GENERATION, 'submitRun')
    }
    const totalCredits = args.templateIds.length * args.variationsPerTemplate
    await requireCredit(ctx, 'submitRun', totalCredits)

    await ctx.db.patch(args.runId, {
      status: 'generating',
      mode: args.mode,
      colorAdapt: args.colorAdapt,
      variationsPerTemplate: args.variationsPerTemplate,
      aspectRatio: args.aspectRatio,
    })

    // Materialize (template × variation) pairs.
    let variationCounter = 0
    for (const templateId of args.templateIds) {
      const tpl = await ctx.db.get(templateId)
      if (!tpl) throw new Error(`Template ${templateId} not found`)
      if (tpl.status !== 'published') {
        throw new Error(`Template ${templateId} is not published`)
      }
      for (let v = 0; v < args.variationsPerTemplate; v++) {
        const genId = await ctx.db.insert('templateGenerations', {
          runId: args.runId,
          templateId,
          productImageUrl: run.productImageUrl,
          templateImageUrl: tpl.imageUrl,
          mode: args.mode,
          colorAdapt: args.colorAdapt,
          variationIndex: variationCounter++,
          status: 'queued',
          userId,
        })
        await recordCreditUse(ctx, billing, 'submitRun', CAPABILITIES.GENERATE_VARIATIONS)
        await workflow.start(ctx, internal.studio.generateFromTemplateWorkflow, {
          generationId: genId,
        })
      }
    }
    return { ok: true }
  },
})

export const generateFromTemplateWorkflow = workflow.define({
  args: { generationId: v.id('templateGenerations') },
  handler: async (step, { generationId }) => {
    const gen = await step.runQuery(internal.studio.getGenerationInternal, { generationId })
    if (!gen) return
    await step.runMutation(internal.studio.markGenerationRunning, { generationId })
    try {
      // Step 1 — compose the dynamic prompt (LLM looks at both images).
      await step.runMutation(internal.studio.setGenerationStep, {
        generationId,
        currentStep: 'Processing',
      })
      const { prompt } = await step.runAction(internal.ai.composePrompt, { generationId })
      await step.runMutation(internal.studio.saveDynamicPrompt, {
        generationId,
        dynamicPrompt: prompt,
      })

      // Step 2 — render the image and upload.
      await step.runMutation(internal.studio.setGenerationStep, {
        generationId,
        currentStep: 'Generating',
      })
      const { outputUrl } = await step.runAction(internal.ai.generateFromTemplate, {
        generationId,
      })
      await step.runMutation(internal.studio.markGenerationComplete, {
        generationId,
        outputUrl,
      })
    } catch (err) {
      await step.runMutation(internal.studio.markGenerationFailed, {
        generationId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
    // If this was the last pending generation in the run, flip run → complete.
    // Only applies to legacy run-based generations
    if (gen.runId) {
      await step.runMutation(internal.studio.maybeCompleteRun, {
        runId: gen.runId,
      })
    }
    // Generate ad copy alongside the image (best-effort — failures don't block the visual).
    try {
      const copy = await step.runAction(internal.ai.composeAdCopyForGeneration, { generationId })
      if (copy) {
        await step.runMutation(internal.studio.saveAdCopyOnGeneration, {
          generationId,
          headlines: copy.headlines,
          primaryTexts: copy.primaryTexts,
          ctas: copy.ctas,
        })
      }
    } catch (err) {
      console.warn('Ad copy generation failed for', generationId, err)
    }
  },
})

/**
 * Workflow for generating ads from a marketing angle (no template).
 * Same shape as generateFromTemplateWorkflow but uses the angle composer
 * and the product-only image generation action.
 */
export const generateFromAngleWorkflow = workflow.define({
  args: { generationId: v.id('templateGenerations') },
  handler: async (step, { generationId }) => {
    const gen = await step.runQuery(internal.studio.getGenerationInternal, { generationId })
    if (!gen) return
    await step.runMutation(internal.studio.markGenerationRunning, { generationId })
    try {
      await step.runMutation(internal.studio.setGenerationStep, {
        generationId,
        currentStep: 'Designing the scene',
      })
      const { prompt } = await step.runAction(internal.ai.composeFromAnglePrompt, { generationId })
      await step.runMutation(internal.studio.saveDynamicPrompt, {
        generationId,
        dynamicPrompt: prompt,
      })

      await step.runMutation(internal.studio.setGenerationStep, {
        generationId,
        currentStep: 'Generating',
      })
      const { outputUrl } = await step.runAction(internal.ai.generateFromAngle, {
        generationId,
      })
      await step.runMutation(internal.studio.markGenerationComplete, {
        generationId,
        outputUrl,
      })
    } catch (err) {
      await step.runMutation(internal.studio.markGenerationFailed, {
        generationId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
    // Generate ad copy alongside the image (best-effort — failures don't block the visual).
    try {
      const copy = await step.runAction(internal.ai.composeAdCopyForGeneration, { generationId })
      if (copy) {
        await step.runMutation(internal.studio.saveAdCopyOnGeneration, {
          generationId,
          headlines: copy.headlines,
          primaryTexts: copy.primaryTexts,
          ctas: copy.ctas,
        })
      }
    } catch (err) {
      console.warn('Ad copy generation failed for', generationId, err)
    }
  },
})

/**
 * Workflow for generating variations from an existing generated image.
 * Changes text, icons, and/or colors based on user selection.
 */
export const generateVariationWorkflow = workflow.define({
  args: { generationId: v.id('templateGenerations') },
  handler: async (step, { generationId }) => {
    const gen = await step.runQuery(internal.studio.getGenerationInternal, { generationId })
    if (!gen || !gen.variationSource) return

    await step.runMutation(internal.studio.markGenerationRunning, { generationId })
    try {
      // Step 1 — compose the variation prompt
      await step.runMutation(internal.studio.setGenerationStep, {
        generationId,
        currentStep: 'Processing',
      })
      const { prompt } = await step.runAction(internal.ai.composeVariationPrompt, { generationId })
      await step.runMutation(internal.studio.saveDynamicPrompt, {
        generationId,
        dynamicPrompt: prompt,
      })

      // Step 2 — generate the variation image
      await step.runMutation(internal.studio.setGenerationStep, {
        generationId,
        currentStep: 'Generating',
      })
      const { outputUrl } = await step.runAction(internal.ai.generateVariation, {
        generationId,
      })
      await step.runMutation(internal.studio.markGenerationComplete, {
        generationId,
        outputUrl,
      })
    } catch (err) {
      await step.runMutation(internal.studio.markGenerationFailed, {
        generationId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
    // Generate ad copy alongside the image (best-effort — failures don't block the visual).
    try {
      const copy = await step.runAction(internal.ai.composeAdCopyForGeneration, { generationId })
      if (copy) {
        await step.runMutation(internal.studio.saveAdCopyOnGeneration, {
          generationId,
          headlines: copy.headlines,
          primaryTexts: copy.primaryTexts,
          ctas: copy.ctas,
        })
      }
    } catch (err) {
      console.warn('Ad copy generation failed for', generationId, err)
    }
  },
})

export const getGenerationInternal = internalQuery({
  args: { generationId: v.id('templateGenerations') },
  handler: async (ctx, { generationId }) => ctx.db.get(generationId),
})

/**
 * Bundle everything the composer action needs: the generation row, the
 * originating run (so we can pass product description/category/audience to
 * the LLM), and the template (for scene_description + tags).
 */
export const getGenerationContextInternal = internalQuery({
  args: { generationId: v.id('templateGenerations') },
  handler: async (ctx, { generationId }) => {
    const generation = await ctx.db.get(generationId)
    if (!generation) return null

    // Support both new product-centric model and legacy run-based model
    const [product, run, template] = await Promise.all([
      generation.productId ? ctx.db.get(generation.productId) : null,
      generation.runId ? ctx.db.get(generation.runId) : null,
      generation.templateId ? ctx.db.get(generation.templateId) : null,
    ])

    // Normalize to a common "productContext" shape for downstream consumers
    const productContext = product ?? run

    return { generation, product, run, productContext, template }
  },
})

export const saveDynamicPrompt = internalMutation({
  args: {
    generationId: v.id('templateGenerations'),
    dynamicPrompt: v.string(),
  },
  handler: async (ctx, { generationId, dynamicPrompt }) => {
    await ctx.db.patch(generationId, { dynamicPrompt })
  },
})

export const setGenerationStep = internalMutation({
  args: {
    generationId: v.id('templateGenerations'),
    currentStep: v.string(),
  },
  handler: async (ctx, { generationId, currentStep }) => {
    await ctx.db.patch(generationId, { currentStep })
  },
})

export const markGenerationRunning = internalMutation({
  args: { generationId: v.id('templateGenerations') },
  handler: async (ctx, { generationId }) => {
    await ctx.db.patch(generationId, {
      status: 'running',
      currentStep: 'Queuing',
      startedAt: Date.now(),
      error: undefined,
      dynamicPrompt: undefined,
    })
  },
})

export const markGenerationComplete = internalMutation({
  args: {
    generationId: v.id('templateGenerations'),
    outputUrl: v.string(),
  },
  handler: async (ctx, { generationId, outputUrl }) => {
    await ctx.db.patch(generationId, {
      status: 'complete',
      outputUrl,
      currentStep: undefined,
      finishedAt: Date.now(),
      error: undefined,
    })
  },
})

export const markGenerationFailed = internalMutation({
  args: { generationId: v.id('templateGenerations'), error: v.string() },
  handler: async (ctx, { generationId, error }) => {
    await ctx.db.patch(generationId, {
      status: 'failed',
      error,
      currentStep: undefined,
      finishedAt: Date.now(),
    })
  },
})

export const saveAdCopyOnGeneration = internalMutation({
  args: {
    generationId: v.id('templateGenerations'),
    headlines: v.array(v.string()),
    primaryTexts: v.array(v.string()),
    ctas: v.array(v.string()),
  },
  handler: async (ctx, { generationId, headlines, primaryTexts, ctas }) => {
    await ctx.db.patch(generationId, {
      adCopy: { headlines, primaryTexts, ctas, generatedAt: Date.now() },
    })
  },
})

export const maybeCompleteRun = internalMutation({
  args: { runId: v.id('studioRuns') },
  handler: async (ctx, { runId }) => {
    const rows = await ctx.db
      .query('templateGenerations')
      .withIndex('by_run', (q) => q.eq('runId', runId))
      .collect()
    if (rows.length === 0) return
    const done = rows.every(
      (r) => r.status === 'complete' || r.status === 'failed',
    )
    if (done) {
      await ctx.db.patch(runId, { status: 'complete' })
    }
  },
})

// ─── Retry a single failed generation ─────────────────────────────────────
export const retryGeneration = mutation({
  args: { generationId: v.id('templateGenerations') },
  handler: async (ctx, { generationId }) => {
    const userId = await requireAuth(ctx)
    const gen = await ctx.db.get(generationId)
    if (!gen) throw new Error('Generation not found')
    assertOwnsIfTracked(gen, userId, 'generation')
    const now = Date.now()
    const pendingStartedAt = gen.startedAt ?? gen._creationTime
    const isStalePending =
      gen.status !== 'complete' &&
      gen.status !== 'failed' &&
      now - pendingStartedAt >= 90_000
    if (gen.status !== 'failed' && !isStalePending) {
      throw new Error('Only failed or timed-out generations can be retried')
    }
    // Billing: retries count against the monthly quota (counting rule).
    const billing = await requireCredit(ctx, 'retryGeneration', 1)
    await recordCreditUse(ctx, billing, 'retryGeneration', CAPABILITIES.GENERATE_VARIATIONS)
    await ctx.db.patch(generationId, {
      status: 'queued',
      error: undefined,
      currentStep: 'Queuing',
      outputUrl: undefined,
      startedAt: undefined,
      finishedAt: undefined,
    })
    // Update legacy run status if this is a run-based generation
    if (gen.runId) {
      await ctx.db.patch(gen.runId, { status: 'generating' })
    }
    if (gen.variationSource) {
      await workflow.start(ctx, internal.studio.generateVariationWorkflow, { generationId })
    } else if (gen.mode === 'angle') {
      await workflow.start(ctx, internal.studio.generateFromAngleWorkflow, { generationId })
    } else {
      await workflow.start(ctx, internal.studio.generateFromTemplateWorkflow, { generationId })
    }
  },
})
