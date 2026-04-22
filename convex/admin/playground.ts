import { v } from 'convex/values'
import { query, mutation, internalQuery, internalMutation } from '../_generated/server'
import { requireAdminIdentity } from '../lib/admin/requireAdmin'

// ─── Internal helpers (used by playgroundActions.ts via internal.admin.playground.*) ─

export const getRunInternal = internalQuery({
  args: { runId: v.id('adminDebugRuns') },
  handler: async (ctx, { runId }) => ctx.db.get(runId),
})

export const patchRun = internalMutation({
  args: {
    runId: v.id('adminDebugRuns'),
    patch: v.any(),
  },
  handler: async (ctx, { runId, patch }) => {
    await ctx.db.patch(runId, patch)
  },
})

export const getSourceGenAspectRatio = internalQuery({
  args: { generationId: v.id('templateGenerations') },
  handler: async (ctx, { generationId }) => {
    const gen = await ctx.db.get(generationId)
    return gen?.aspectRatio ?? '1:1'
  },
})

// ─── Public queries ──────────────────────────────────────────────────────────

/**
 * List the top 50 most recent completed generations across all users.
 * Joins in product name, userId, and primary image URL.
 */
export const listAllGenerations = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminIdentity(ctx)

    const generations = await ctx.db
      .query('templateGenerations')
      .withIndex('by_userId')
      .order('desc')
      .filter((q) => q.eq(q.field('status'), 'complete'))
      .take(50)

    return Promise.all(
      generations.map(async (gen) => {
        let productName: string | undefined
        let productUserId: string | undefined
        let productImageUrl: string | undefined

        if (gen.productId) {
          const product = await ctx.db.get(gen.productId)
          if (product) {
            productName = product.name
            productUserId = product.userId

            // Try primary image from productImages table
            if (product.primaryImageId) {
              const primaryImg = await ctx.db.get(product.primaryImageId)
              productImageUrl = primaryImg?.imageUrl ?? product.imageUrl
            } else {
              productImageUrl = product.imageUrl
            }
          }
        }

        return {
          _id: gen._id,
          outputUrl: gen.outputUrl,
          productName,
          productUserId,
          mode: gen.mode,
          aspectRatio: gen.aspectRatio,
          createdAt: gen._creationTime,
          productImageUrl: productImageUrl ?? gen.productImageUrl,
        }
      }),
    )
  },
})

export const getDebugRun = query({
  args: { runId: v.id('adminDebugRuns') },
  handler: async (ctx, { runId }) => {
    await requireAdminIdentity(ctx)
    return ctx.db.get(runId)
  },
})

export const listMyDebugRuns = query({
  args: {},
  handler: async (ctx) => {
    const adminUserId = await requireAdminIdentity(ctx)

    return ctx.db
      .query('adminDebugRuns')
      .withIndex('by_admin', (q) => q.eq('adminUserId', adminUserId))
      .order('desc')
      .take(50)
  },
})

// ─── Public mutation ─────────────────────────────────────────────────────────

export const createDebugRun = mutation({
  args: {
    sourceGenerationId: v.id('templateGenerations'),
    changeText: v.boolean(),
    changeIcons: v.boolean(),
    changeColors: v.boolean(),
    composerImageUrls: v.array(v.string()),
    composerImageLabels: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const adminUserId = await requireAdminIdentity(ctx)
    if (!args.changeText && !args.changeIcons && !args.changeColors) {
      throw new Error('Must select at least one thing to change')
    }
    if (args.composerImageUrls.length !== args.composerImageLabels.length) {
      throw new Error('Image URLs and labels must be parallel arrays')
    }
    if (args.composerImageUrls.length === 0) {
      throw new Error('At least one image must be selected for the composer')
    }
    const runId = await ctx.db.insert('adminDebugRuns', {
      adminUserId: adminUserId,
      sourceGenerationId: args.sourceGenerationId,
      changeText: args.changeText,
      changeIcons: args.changeIcons,
      changeColors: args.changeColors,
      composerImageUrls: args.composerImageUrls,
      composerImageLabels: args.composerImageLabels,
      status: 'draft',
      createdAt: Date.now(),
    })
    return { runId }
  },
})
