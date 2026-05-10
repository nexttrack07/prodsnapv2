import { v } from 'convex/values'
import {
  mutation,
  query,
  type QueryCtx,
  type MutationCtx,
} from './_generated/server'
import type { Id } from './_generated/dataModel'
import { requireSavedTemplateLimit } from './lib/billing'

// ─── Auth helpers (mirror products.ts pattern) ──────────────────────────────

async function requireAuth(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error('Not authenticated')
  return identity.tokenIdentifier
}

async function getAuthUserId(ctx: QueryCtx | MutationCtx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity()
  return identity?.tokenIdentifier ?? null
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Returns all inspirations for a product, enriched with template data when
 * kind=template. Requires auth + product ownership.
 */
export const listInspirationsForProduct = query({
  args: { productId: v.id('products') },
  handler: async (ctx, { productId }) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return []

    const product = await ctx.db.get(productId)
    if (!product || (product.userId && product.userId !== userId)) return []

    const rows = await ctx.db
      .query('productInspirations')
      .withIndex('by_product', (q) => q.eq('productId', productId))
      .order('desc')
      .take(100)

    // Enrich template inspirations with template data
    const enriched = await Promise.all(
      rows.map(async (row) => {
        if (row.kind === 'template' && row.templateId) {
          const tpl = await ctx.db.get(row.templateId)
          return {
            ...row,
            template: tpl
              ? {
                  thumbnailUrl: tpl.thumbnailUrl,
                  imageUrl: tpl.imageUrl,
                  aspectRatio: tpl.aspectRatio,
                  productCategory: tpl.productCategory,
                  imageStyle: tpl.imageStyle,
                  setting: tpl.setting,
                  angleType: tpl.angleType,
                }
              : null,
          }
        }
        return { ...row, template: null }
      }),
    )

    return enriched
  },
})

/**
 * For a logged-in user, returns the set of templateIds they've saved across
 * any product. Used to render the "saved" state on bookmark icons.
 */
export const listMyTemplateSaves = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return { saves: [] }

    const rows = await ctx.db
      .query('productInspirations')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .take(500)

    // Return unique template saves with their product associations
    const saves: Array<{
      templateId: Id<'adTemplates'>
      productId: Id<'products'>
      inspirationId: Id<'productInspirations'>
    }> = []

    for (const row of rows) {
      if (row.kind === 'template' && row.templateId) {
        saves.push({
          templateId: row.templateId,
          productId: row.productId,
          inspirationId: row._id,
        })
      }
    }

    return { saves }
  },
})

// ─── Mutations ───────────────────────────────────────────────────────────────

/**
 * Save a template as inspiration to a product. Deduplicates — no double-save
 * of the same template to the same product.
 */
export const saveTemplateAsInspiration = mutation({
  args: {
    productId: v.id('products'),
    templateId: v.id('adTemplates'),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { productId, templateId, note }) => {
    const userId = await requireAuth(ctx)

    // Ownership check
    const product = await ctx.db.get(productId)
    if (!product) throw new Error('Product not found')
    if (product.userId && product.userId !== userId) {
      throw new Error('Not authorized')
    }

    // Dedup check: same user + same template + same product
    const existing = await ctx.db
      .query('productInspirations')
      .withIndex('by_userId_template', (q) =>
        q.eq('userId', userId).eq('templateId', templateId),
      )
      .take(50)

    const alreadySaved = existing.find((r) => r.productId === productId)
    if (alreadySaved) {
      return alreadySaved._id
    }

    // Quota check only when actually inserting a new row (dedup short-circuits above).
    await requireSavedTemplateLimit(ctx, 'saveTemplateAsInspiration')

    return await ctx.db.insert('productInspirations', {
      productId,
      userId,
      kind: 'template',
      templateId,
      note,
      createdAt: Date.now(),
    })
  },
})

/**
 * Save an external image as inspiration.
 */
export const saveExternalInspiration = mutation({
  args: {
    productId: v.id('products'),
    imageUrl: v.string(),
    imageStorageKey: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { productId, imageUrl, imageStorageKey, sourceUrl, note }) => {
    const userId = await requireAuth(ctx)

    const product = await ctx.db.get(productId)
    if (!product) throw new Error('Product not found')
    if (product.userId && product.userId !== userId) {
      throw new Error('Not authorized')
    }

    await requireSavedTemplateLimit(ctx, 'saveExternalInspiration')

    return await ctx.db.insert('productInspirations', {
      productId,
      userId,
      kind: 'external',
      imageUrl,
      imageStorageKey,
      sourceUrl,
      note,
      createdAt: Date.now(),
    })
  },
})

/**
 * Remove an inspiration. Requires auth + ownership.
 */
export const removeInspiration = mutation({
  args: { inspirationId: v.id('productInspirations') },
  handler: async (ctx, { inspirationId }) => {
    const userId = await requireAuth(ctx)

    const row = await ctx.db.get(inspirationId)
    if (!row) throw new Error('Inspiration not found')
    if (row.userId !== userId) throw new Error('Not authorized')

    await ctx.db.delete(inspirationId)
  },
})

/**
 * Update a note on an inspiration.
 */
export const updateInspirationNote = mutation({
  args: {
    inspirationId: v.id('productInspirations'),
    note: v.string(),
  },
  handler: async (ctx, { inspirationId, note }) => {
    const userId = await requireAuth(ctx)

    const row = await ctx.db.get(inspirationId)
    if (!row) throw new Error('Inspiration not found')
    if (row.userId !== userId) throw new Error('Not authorized')

    await ctx.db.patch(inspirationId, { note })
  },
})
