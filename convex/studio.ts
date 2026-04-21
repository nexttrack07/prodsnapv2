import { v } from 'convex/values'
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server'
import { components, internal } from './_generated/api'
import { WorkflowManager } from '@convex-dev/workflow'
import { Workpool } from '@convex-dev/workpool'
import type { Id } from './_generated/dataModel'

export const workflow = new WorkflowManager(components.workflow)
export const imageGenPool = new Workpool(components.imageGenPool, {
  maxParallelism: 5,
  retryActionsByDefault: true,
  defaultRetryBehavior: { maxAttempts: 2, initialBackoffMs: 3000, base: 2 },
})

// ─── Run lifecycle mutations ──────────────────────────────────────────────
export const createRun = mutation({
  args: { productImageUrl: v.string() },
  handler: async (ctx, { productImageUrl }) => {
    const runId = await ctx.db.insert('studioRuns', {
      productImageUrl,
      status: 'analyzing',
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
    const run = await ctx.db.get(runId)
    if (!run) throw new Error('Run not found')
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
    // Attach template for display
    const withTemplate = await Promise.all(
      rows.map(async (r) => ({
        ...r,
        template: await ctx.db.get(r.templateId),
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
  },
  handler: async (
    ctx,
    { runId, aspectRatio, limit, offset, shuffle },
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
      // Fisher-Yates shuffle
      for (let i = filtered.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
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
    if (args.templateIds.length === 0) throw new Error('No templates selected')
    if (args.templateIds.length > 3) throw new Error('At most 3 templates')
    if (args.variationsPerTemplate < 1 || args.variationsPerTemplate > 4) {
      throw new Error('variations must be 1-4')
    }
    const run = await ctx.db.get(args.runId)
    if (!run) throw new Error('Run not found')
    if (run.status !== 'ready' && run.status !== 'complete') {
      throw new Error(`Run not ready (status=${run.status})`)
    }

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
        })
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
      ctx.db.get(generation.templateId),
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
    const gen = await ctx.db.get(generationId)
    if (!gen) throw new Error('Generation not found')
    if (gen.status !== 'failed') throw new Error('Only failed generations can be retried')
    await ctx.db.patch(generationId, {
      status: 'queued',
      error: undefined,
      currentStep: undefined,
      outputUrl: undefined,
    })
    // Update legacy run status if this is a run-based generation
    if (gen.runId) {
      await ctx.db.patch(gen.runId, { status: 'generating' })
    }
    await workflow.start(ctx, internal.studio.generateFromTemplateWorkflow, {
      generationId,
    })
  },
})
