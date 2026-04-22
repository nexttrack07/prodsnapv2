'use node'

import { v } from 'convex/values'
import { action } from '../_generated/server'
import { internal } from '../_generated/api'
import { composeVariationPromptCore, generateVariationImageCore } from '../ai'
import { uploadFromUrl } from '../r2'
import { requireAdmin } from '../lib/admin/requireAdmin'

export const runComposer = action({
  args: { runId: v.id('adminDebugRuns') },
  handler: async (ctx, { runId }) => {
    await requireAdmin(ctx)

    // 1) Fetch the run
    const run = await ctx.runQuery(internal.admin.playground.getRunInternal, { runId })
    if (!run) throw new Error('Debug run not found')
    if (run.status !== 'draft') throw new Error(`Run is not in draft state (current: ${run.status})`)

    const composerStartedAt = Date.now()

    // 2) Mark composing
    await ctx.runMutation(internal.admin.playground.patchRun, {
      runId,
      patch: { status: 'composing', composerStartedAt },
    })

    // 3) Determine source/product image URLs from labels
    const sourceIndex = run.composerImageLabels.indexOf('source')
    if (sourceIndex === -1) throw new Error('No source image label found in composerImageLabels')
    const sourceImageUrl = run.composerImageUrls[sourceIndex]

    const productIndex = run.composerImageLabels.indexOf('product')
    const productImageUrl = productIndex !== -1 ? run.composerImageUrls[productIndex] : undefined

    try {
      // 4) Call the core composer helper
      const result = await composeVariationPromptCore({
        sourceImageUrl,
        productImageUrl,
        changeText: run.changeText,
        changeIcons: run.changeIcons,
        changeColors: run.changeColors,
      })

      // 5) Patch success
      await ctx.runMutation(internal.admin.playground.patchRun, {
        runId,
        patch: {
          status: 'composed',
          composerSystemPrompt: result.systemPrompt,
          composerUserPrompt: result.userPrompt,
          composerRawResponse: result.rawResponse,
          composerPrompt: result.prompt,
          composerDurationMs: Date.now() - composerStartedAt,
        },
      })
    } catch (err) {
      // 6) Patch failure
      await ctx.runMutation(internal.admin.playground.patchRun, {
        runId,
        patch: {
          status: 'failed',
          composerError: err instanceof Error ? err.message : String(err),
          composerDurationMs: Date.now() - composerStartedAt,
        },
      })
      throw err
    }
  },
})

export const runGenerator = action({
  args: {
    runId: v.id('adminDebugRuns'),
    editedPrompt: v.optional(v.string()),
    generatorImageUrls: v.array(v.string()),
    generatorImageLabels: v.array(v.string()),
    model: v.optional(v.union(v.literal('nano-banana-2'), v.literal('gpt-image-2'))),
  },
  handler: async (ctx, { runId, editedPrompt, generatorImageUrls, generatorImageLabels, model }) => {
    await requireAdmin(ctx)

    // 1) Fetch run
    const run = await ctx.runQuery(internal.admin.playground.getRunInternal, { runId })
    if (!run) throw new Error('Debug run not found')

    // 2) Determine final prompt
    const finalPrompt = editedPrompt ?? run.composerPrompt
    if (!finalPrompt) throw new Error('No prompt available — run composer first or provide editedPrompt')

    // 3) Get aspect ratio from source generation
    const aspectRatio: string = await ctx.runQuery(
      internal.admin.playground.getSourceGenAspectRatio,
      { generationId: run.sourceGenerationId },
    )

    const generatorStartedAt = Date.now()

    const resolvedModel = model ?? 'nano-banana-2'

    // 4) Mark generating
    await ctx.runMutation(internal.admin.playground.patchRun, {
      runId,
      patch: {
        status: 'generating',
        generatorImageUrls,
        generatorImageLabels,
        generatorPromptUsed: finalPrompt,
        generatorParams: { aspectRatio, model: resolvedModel },
        generatorStartedAt,
        model: resolvedModel,
        ...(editedPrompt !== undefined ? { editedPrompt } : {}),
      },
    })

    try {
      // 5) Call the core generator helper
      const { rawResponse, generatedUrl } = await generateVariationImageCore({
        model: resolvedModel,
        prompt: finalPrompt,
        imageUrls: generatorImageUrls,
        aspectRatio,
      })

      // 6) Upload to R2
      const outputUrl = await uploadFromUrl(
        generatedUrl,
        `admin-debug/${runId}/${Date.now()}.png`,
        'image/png',
      )

      // 7) Patch success
      await ctx.runMutation(internal.admin.playground.patchRun, {
        runId,
        patch: {
          status: 'complete',
          generatorOutputUrl: outputUrl,
          generatorRawResponse: rawResponse,
          generatorDurationMs: Date.now() - generatorStartedAt,
        },
      })
    } catch (err) {
      // 8) Patch failure
      await ctx.runMutation(internal.admin.playground.patchRun, {
        runId,
        patch: {
          status: 'failed',
          generatorError: err instanceof Error ? err.message : String(err),
          generatorDurationMs: Date.now() - generatorStartedAt,
        },
      })
      throw err
    }
  },
})
