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
