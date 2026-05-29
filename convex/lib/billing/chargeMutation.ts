/**
 * Thin internalMutation wrapper so 'use node' actions in ai.ts can charge
 * credits via ctx.runMutation. Actions cannot call chargeCredits directly
 * because it is a mutation helper.
 */
import { v } from 'convex/values'
import { internalMutation } from '../../_generated/server'
import { chargeCredits } from './credits'

export const chargeCreditsInternal = internalMutation({
  args: {
    userId: v.string(),
    modelKey: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { userId, modelKey, note }) => {
    await chargeCredits(ctx, {
      userId,
      modelKey,
      metadata: note ? { note } : undefined,
    })
  },
})

/**
 * Idempotent per-generation charge. Call this ONLY after the generation's
 * output has been durably uploaded. The `creditCharged` flag on the row is
 * set in the same transaction as the deduction, so a workflow retry of the
 * generation action (retryActionsByDefault) cannot double-charge: the second
 * pass sees the flag and returns without deducting again.
 *
 * If the generation row is gone (deleted mid-flight) we no-op rather than
 * charging for output the user can no longer see.
 */
export const chargeForGenerationInternal = internalMutation({
  args: {
    generationId: v.id('templateGenerations'),
    userId: v.string(),
    modelKey: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { generationId, userId, modelKey, note }) => {
    const generation = await ctx.db.get(generationId)
    if (!generation) return
    if (generation.creditCharged) return

    await chargeCredits(ctx, {
      userId,
      modelKey,
      metadata: note ? { note } : undefined,
    })
    await ctx.db.patch(generationId, { creditCharged: true })
  },
})
