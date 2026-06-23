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
  requireCapability,
} from './lib/billing'
import { requireCredits } from './lib/billing/credits'
import { enforceGenerationRateLimit, recordGenerationUsage } from './products'

// Global cap on how many generation workflow steps run concurrently. This is
// what bounds simultaneous fal.ai calls (and blocking Convex actions): when more
// generations are started than this, the extras wait in the workflow pool's
// queue with status 'queued' instead of all running at once — which is what makes
// the "queued vs generating" UI accurate AND prevents a burst from exhausting
// Convex's action concurrency limit.
//
// Tune toward your fal.ai account's concurrency limit (self-serve 2→40) so a
// 'running' row reflects work fal is actually processing rather than work queued
// at fal. Start conservative; raise once the fal limit is confirmed.
const GENERATION_MAX_PARALLELISM = 8
export const workflow = new WorkflowManager(components.workflow, {
  workpoolOptions: { maxParallelism: GENERATION_MAX_PARALLELISM },
})
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
    if (gen.adTestId) {
      await step.runMutation(internal.adTests.updateCountersForGeneration, {
        adTestId: gen.adTestId,
      })
      await step.runMutation(internal.adTests.setStatusFromChildren, {
        adTestId: gen.adTestId,
      })
    }
    // Ad copy is now opt-in — user requests it from the ad detail panel via
    // api.adCopy.generateAdCopy after the image lands.
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
    if (gen.adTestId) {
      await step.runMutation(internal.adTests.updateCountersForGeneration, {
        adTestId: gen.adTestId,
      })
      await step.runMutation(internal.adTests.setStatusFromChildren, {
        adTestId: gen.adTestId,
      })
    }
    // Ad copy is now opt-in — user requests it from the ad detail panel via
    // api.adCopy.generateAdCopy after the image lands.
  },
})

/**
 * Workflow for generating ads from a free-form user prompt (no template, no
 * angle composer step). The user's dynamicPrompt is already stored on the row
 * — we skip the LLM composer and feed the prompt + product image straight to
 * the image generator.
 */
export const generateFromPromptWorkflow = workflow.define({
  args: { generationId: v.id('templateGenerations') },
  handler: async (step, { generationId }) => {
    const gen = await step.runQuery(internal.studio.getGenerationInternal, { generationId })
    if (!gen) return
    await step.runMutation(internal.studio.markGenerationRunning, { generationId })
    try {
      // No composer step — the user's prompt is already in dynamicPrompt.
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
    if (gen.adTestId) {
      await step.runMutation(internal.adTests.updateCountersForGeneration, {
        adTestId: gen.adTestId,
      })
      await step.runMutation(internal.adTests.setStatusFromChildren, {
        adTestId: gen.adTestId,
      })
    }
    // Generate ad copy alongside the image (best-effort).
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
    if (gen.adTestId) {
      await step.runMutation(internal.adTests.updateCountersForGeneration, {
        adTestId: gen.adTestId,
      })
      await step.runMutation(internal.adTests.setStatusFromChildren, {
        adTestId: gen.adTestId,
      })
    }
    // Ad copy is now opt-in — user requests it from the ad detail panel via
    // api.adCopy.generateAdCopy after the image lands.
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
    if (process.env.DEBUG_AI === 'true') {
      console.log(`[saveDynamicPrompt] generationId=${generationId} incomingLen=${dynamicPrompt.length}`)
    }
    if (!dynamicPrompt || dynamicPrompt.length === 0) {
      throw new Error(`saveDynamicPrompt called with empty string for generationId=${generationId}`)
    }
    await ctx.db.patch(generationId, { dynamicPrompt })
    const after = await ctx.db.get(generationId)
    if (process.env.DEBUG_AI === 'true') {
      console.log(`[saveDynamicPrompt] generationId=${generationId} postPatchLen=${after?.dynamicPrompt?.length ?? 'undef'}`)
    }
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
    // Only clear dynamicPrompt for flows that have a composer step that
    // will repopulate it (angle, template). For prompt-mode and variation
    // flows the prompt is set at insert time and there's no composer to
    // rewrite it — clearing here causes generateFromAngle to throw
    // "Dynamic prompt missing" downstream.
    const gen = await ctx.db.get(generationId)
    const hasComposer = gen?.mode === 'angle' || gen?.mode === 'exact' || gen?.mode === 'remix'
    await ctx.db.patch(generationId, {
      status: 'running',
      currentStep: 'Queuing',
      startedAt: Date.now(),
      error: undefined,
      ...(hasComposer ? { dynamicPrompt: undefined } : {}),
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
    // Sized for the slowest case (gpt-image-2 at quality=high). Don't let
    // users retry into a still-running Fal.ai request and double-bill
    // themselves. Matches the UI threshold in studio.$productId.tsx.
    const isStalePending =
      gen.status !== 'complete' &&
      gen.status !== 'failed' &&
      now - pendingStartedAt >= 300_000
    if (gen.status !== 'failed' && !isStalePending) {
      throw new Error('Only failed or timed-out generations can be retried')
    }
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
    if (gen.adTestId) {
      await ctx.db.patch(gen.adTestId, { status: 'generating', updatedAt: Date.now() })
    }
    if (gen.variationSource) {
      await workflow.start(ctx, internal.studio.generateVariationWorkflow, { generationId }, { startAsync: true })
    } else if (gen.mode === 'prompt') {
      await workflow.start(ctx, internal.studio.generateFromPromptWorkflow, { generationId }, { startAsync: true })
    } else if (gen.mode === 'angle') {
      await workflow.start(ctx, internal.studio.generateFromAngleWorkflow, { generationId }, { startAsync: true })
    } else {
      await workflow.start(ctx, internal.studio.generateFromTemplateWorkflow, { generationId }, { startAsync: true })
    }
  },
})

// ─── Stuck-generation watchdog ────────────────────────────────────────────
// Rows stuck in 'queued' or 'running' beyond this threshold are considered
// orphaned (the workflow never started or was dropped by the workpool).
// Sized comfortably above GENERATION_TIMEOUT_MS (300 000 ms / 5 min) so we
// never kill genuinely in-flight work.
const STUCK_GENERATION_THRESHOLD_MS = 6 * 60 * 1000 // 6 minutes

export const markStuckGenerationsFailed = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now()
    const cutoff = now - STUCK_GENERATION_THRESHOLD_MS

    // Collect all queued rows older than the threshold.
    const stuckQueued = await ctx.db
      .query('templateGenerations')
      .withIndex('by_userId') // full scan is acceptable for a small table
      .filter((q) =>
        q.and(
          q.eq(q.field('status'), 'queued'),
          q.lt(q.field('_creationTime'), cutoff),
        ),
      )
      .collect()

    // Collect all running rows whose startedAt is older than the threshold.
    const stuckRunning = await ctx.db
      .query('templateGenerations')
      .withIndex('by_userId')
      .filter((q) =>
        q.and(
          q.eq(q.field('status'), 'running'),
          q.lt(q.field('startedAt'), cutoff),
        ),
      )
      .collect()

    const allStuck = [...stuckQueued, ...stuckRunning]
    const affectedAdTestIds = new Set<Id<'adTests'>>()
    for (const gen of allStuck) {
      await ctx.db.patch(gen._id, {
        status: 'failed',
        error: 'Generation timed out — please try again.',
        finishedAt: now,
      })
      if (gen.adTestId) affectedAdTestIds.add(gen.adTestId)
    }

    // Refresh counters + status for any ad tests whose child rows were timed out.
    for (const adTestId of affectedAdTestIds) {
      await ctx.scheduler.runAfter(0, internal.adTests.updateCountersForGeneration, { adTestId })
      await ctx.scheduler.runAfter(0, internal.adTests.setStatusFromChildren, { adTestId })
    }

    return { marked: allStuck.length }
  },
})
