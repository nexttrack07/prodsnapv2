/**
 * Seed the creditPricing table with default per-model milliCredit costs.
 *
 * Run via: npx convex run lib/billing/seedPricing:seedPricing
 *
 * Idempotent — inserts if absent, patches if present. Safe to run multiple times.
 */
import { internalMutation } from '../../_generated/server'

type PricingEntry = {
  modelKey: string
  creditsMc: number
}

const PRICING_SEED: PricingEntry[] = [
  { modelKey: 'nano-banana-2',   creditsMc: 10_000 },
  { modelKey: 'gpt-image-2',     creditsMc: 10_000 },
  { modelKey: 'gpt-image-2-edit', creditsMc: 10_000 },
  { modelKey: 'bria-rmbg',       creditsMc: 2_000 },
]

export const seedPricing = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now()
    for (const { modelKey, creditsMc } of PRICING_SEED) {
      const existing = await ctx.db
        .query('creditPricing')
        .withIndex('by_modelKey', (q) => q.eq('modelKey', modelKey))
        .unique()

      if (existing === null) {
        await ctx.db.insert('creditPricing', {
          modelKey,
          creditsMc,
          active: true,
          updatedAt: now,
        })
      } else {
        await ctx.db.patch(existing._id, {
          creditsMc,
          active: true,
          updatedAt: now,
        })
      }
    }
  },
})
