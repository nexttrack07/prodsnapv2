import { v } from 'convex/values'
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server'
import { internal } from './_generated/api'
import { workflow } from './studio'
import type { Id } from './_generated/dataModel'

const aspectRatioValidator = v.union(
  v.literal('1:1'),
  v.literal('4:5'),
  v.literal('9:16'),
)

// ─── Product lifecycle mutations ──────────────────────────────────────────

/**
 * Creates a new product from an uploaded image. Triggers analysis automatically.
 * The product name defaults to a cleaned-up version of the filename.
 */
export const createProduct = mutation({
  args: {
    imageUrl: v.string(),
    name: v.optional(v.string()),
    imageStorageId: v.optional(v.string()),
  },
  handler: async (ctx, { imageUrl, name, imageStorageId }) => {
    // Default name from URL if not provided (extract filename, clean up)
    const defaultName = name || deriveNameFromUrl(imageUrl)

    const productId = await ctx.db.insert('products', {
      name: defaultName,
      imageUrl,
      imageStorageId,
      status: 'analyzing',
    })

    // Fire-and-forget analysis — flips product to 'ready' or 'failed'.
    await ctx.scheduler.runAfter(0, internal.products.runProductAnalysis, {
      productId,
    })

    return productId
  },
})

/**
 * Derives a human-readable name from an image URL.
 * "blue-sneaker.png" → "Blue Sneaker"
 */
function deriveNameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname
    const filename = pathname.split('/').pop() || 'Product'
    // Remove extension, replace dashes/underscores with spaces, title case
    const withoutExt = filename.replace(/\.[^.]+$/, '')
    const withSpaces = withoutExt.replace(/[-_]/g, ' ')
    return withSpaces
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ')
  } catch {
    return 'Product'
  }
}

/**
 * Runs product analysis (vision + CLIP embedding).
 */
export const runProductAnalysis = internalAction({
  args: { productId: v.id('products') },
  handler: async (ctx, { productId }) => {
    const product = await ctx.runQuery(internal.products.getProductInternal, {
      productId,
    })
    if (!product) return

    try {
      const result = await ctx.runAction(internal.ai.analyzeProduct, {
        imageUrl: product.imageUrl,
      })
      await ctx.runMutation(internal.products.saveProductAnalysis, {
        productId,
        category: result.category,
        productDescription: result.productDescription,
        targetAudience: result.targetAudience,
        embedding: result.embedding,
      })
    } catch (err) {
      await ctx.runMutation(internal.products.markProductFailed, {
        productId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  },
})

export const saveProductAnalysis = internalMutation({
  args: {
    productId: v.id('products'),
    category: v.string(),
    productDescription: v.string(),
    targetAudience: v.string(),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, { productId, ...rest }) => {
    await ctx.db.patch(productId, { ...rest, status: 'ready' })
  },
})

export const markProductFailed = internalMutation({
  args: {
    productId: v.id('products'),
    error: v.string(),
  },
  handler: async (ctx, { productId, error }) => {
    await ctx.db.patch(productId, { status: 'failed', error })
  },
})

// ─── Product queries ──────────────────────────────────────────────────────

export const getProduct = query({
  args: { productId: v.id('products') },
  handler: async (ctx, { productId }) => {
    const product = await ctx.db.get(productId)
    if (!product || product.archivedAt) return null
    return product
  },
})

export const getProductInternal = internalQuery({
  args: { productId: v.id('products') },
  handler: async (ctx, { productId }) => ctx.db.get(productId),
})

/**
 * Lists all non-archived products, newest first.
 */
export const listProducts = query({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db
      .query('products')
      .filter((q) => q.eq(q.field('archivedAt'), undefined))
      .order('desc')
      .collect()
    return products
  },
})

/**
 * Gets a product with its generation count.
 */
export const getProductWithStats = query({
  args: { productId: v.id('products') },
  handler: async (ctx, { productId }) => {
    const product = await ctx.db.get(productId)
    if (!product || product.archivedAt) return null

    const generations = await ctx.db
      .query('templateGenerations')
      .withIndex('by_product', (q) => q.eq('productId', productId))
      .collect()

    const completedCount = generations.filter((g) => g.status === 'complete').length

    return {
      ...product,
      generationCount: generations.length,
      completedGenerationCount: completedCount,
    }
  },
})

// ─── Product mutations ────────────────────────────────────────────────────

/**
 * Updates product fields (name, description, audience).
 */
export const updateProduct = mutation({
  args: {
    productId: v.id('products'),
    name: v.optional(v.string()),
    productDescription: v.optional(v.string()),
    targetAudience: v.optional(v.string()),
  },
  handler: async (ctx, { productId, name, productDescription, targetAudience }) => {
    const patch: Record<string, string> = {}
    if (name !== undefined) patch.name = name
    if (productDescription !== undefined) patch.productDescription = productDescription
    if (targetAudience !== undefined) patch.targetAudience = targetAudience
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(productId, patch)
    }
  },
})

/**
 * Re-runs product analysis on an existing product.
 */
export const reanalyzeProduct = mutation({
  args: { productId: v.id('products') },
  handler: async (ctx, { productId }) => {
    const product = await ctx.db.get(productId)
    if (!product) throw new Error('Product not found')
    if (product.archivedAt) throw new Error('Cannot reanalyze archived product')

    await ctx.db.patch(productId, {
      status: 'analyzing',
      error: undefined,
    })
    await ctx.scheduler.runAfter(0, internal.products.runProductAnalysis, {
      productId,
    })
  },
})

/**
 * Soft-deletes a product by setting archivedAt timestamp.
 */
export const archiveProduct = mutation({
  args: { productId: v.id('products') },
  handler: async (ctx, { productId }) => {
    const product = await ctx.db.get(productId)
    if (!product) throw new Error('Product not found')
    if (product.archivedAt) return // Already archived

    await ctx.db.patch(productId, { archivedAt: Date.now() })
  },
})

/**
 * Restores an archived product.
 */
export const restoreProduct = mutation({
  args: { productId: v.id('products') },
  handler: async (ctx, { productId }) => {
    const product = await ctx.db.get(productId)
    if (!product) throw new Error('Product not found')
    if (!product.archivedAt) return // Not archived

    await ctx.db.patch(productId, { archivedAt: undefined })
  },
})

// ─── Generation queries for a product ─────────────────────────────────────

/**
 * Gets all generations for a product, newest first.
 */
export const getProductGenerations = query({
  args: { productId: v.id('products') },
  handler: async (ctx, { productId }) => {
    const generations = await ctx.db
      .query('templateGenerations')
      .withIndex('by_product', (q) => q.eq('productId', productId))
      .order('desc')
      .collect()
    return generations
  },
})

/**
 * Deletes a generation.
 */
export const deleteGeneration = mutation({
  args: { generationId: v.id('templateGenerations') },
  handler: async (ctx, { generationId }) => {
    const generation = await ctx.db.get(generationId)
    if (!generation) throw new Error('Generation not found')
    await ctx.db.delete(generationId)
  },
})

// ─── Generation from product ──────────────────────────────────────────────

/**
 * Submits a generation request for a product with selected templates.
 * This is the product-centric equivalent of studio.submitRun.
 */
export const generateFromProduct = mutation({
  args: {
    productId: v.id('products'),
    templateIds: v.array(v.id('adTemplates')),
    mode: v.union(v.literal('exact'), v.literal('remix')),
    colorAdapt: v.boolean(),
    variationsPerTemplate: v.number(),
    aspectRatio: aspectRatioValidator,
  },
  handler: async (ctx, args) => {
    if (args.templateIds.length === 0) throw new Error('No templates selected')
    if (args.templateIds.length > 3) throw new Error('At most 3 templates')
    if (args.variationsPerTemplate < 1 || args.variationsPerTemplate > 4) {
      throw new Error('variations must be 1-4')
    }

    const product = await ctx.db.get(args.productId)
    if (!product) throw new Error('Product not found')
    if (product.status !== 'ready') {
      throw new Error(`Product not ready (status=${product.status})`)
    }
    if (product.archivedAt) {
      throw new Error('Cannot generate from archived product')
    }

    // Create generations for each (template × variation) pair
    const generationIds: string[] = []
    let variationCounter = 0

    for (const templateId of args.templateIds) {
      const tpl = await ctx.db.get(templateId)
      if (!tpl) throw new Error(`Template ${templateId} not found`)
      if (tpl.status !== 'published') {
        throw new Error(`Template ${templateId} is not published`)
      }

      for (let v = 0; v < args.variationsPerTemplate; v++) {
        const genId = await ctx.db.insert('templateGenerations', {
          productId: args.productId,
          templateId,
          productImageUrl: product.imageUrl,
          templateImageUrl: tpl.imageUrl,
          templateSnapshot: {
            name: tpl.category || undefined,
            aspectRatio: tpl.aspectRatio,
          },
          aspectRatio: args.aspectRatio,
          mode: args.mode,
          colorAdapt: args.colorAdapt,
          variationIndex: variationCounter++,
          status: 'queued',
        })
        generationIds.push(genId)

        // Start the generation workflow
        await workflow.start(ctx, internal.studio.generateFromTemplateWorkflow, {
          generationId: genId,
        })
      }
    }

    return { ok: true, generationIds }
  },
})

/**
 * List all published templates with cursor-based pagination for infinite scroll.
 * Shows all templates regardless of aspect ratio.
 */
export const listTemplates = query({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { cursor, limit = 24 }) => {
    let q = ctx.db
      .query('adTemplates')
      .withIndex('by_status', (q) => q.eq('status', 'published'))
      .order('desc')

    if (cursor) {
      // Cursor is the _id of the last item from previous page
      const cursorDoc = await ctx.db.get(cursor as Id<'adTemplates'>)
      if (cursorDoc) {
        q = ctx.db
          .query('adTemplates')
          .withIndex('by_status', (q) => q.eq('status', 'published'))
          .order('desc')
          .filter((q) => q.lt(q.field('_creationTime'), cursorDoc._creationTime))
      }
    }

    const results = await q.take(limit + 1)
    const hasMore = results.length > limit
    const items = hasMore ? results.slice(0, limit) : results
    const nextCursor = hasMore ? items[items.length - 1]._id : null

    return {
      items,
      nextCursor,
      hasMore,
    }
  },
})
