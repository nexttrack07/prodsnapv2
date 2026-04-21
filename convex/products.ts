import { v } from 'convex/values'
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
  type MutationCtx,
} from './_generated/server'
import { internal } from './_generated/api'
import { workflow } from './studio'
import type { Id } from './_generated/dataModel'

// ─── Auth helpers ──────────────────────────────────────────────────────────

/**
 * Gets the authenticated user's ID from Clerk JWT.
 * Throws if user is not authenticated.
 */
async function requireAuth(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    throw new Error('Not authenticated')
  }
  // Use tokenIdentifier for unique user ID (includes issuer + subject)
  return identity.tokenIdentifier
}

/**
 * Gets the authenticated user's ID, or null if not authenticated.
 */
async function getAuthUserId(ctx: QueryCtx | MutationCtx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity()
  return identity?.tokenIdentifier ?? null
}

const aspectRatioValidator = v.union(
  v.literal('1:1'),
  v.literal('4:5'),
  v.literal('9:16'),
)

// ─── Product lifecycle mutations ──────────────────────────────────────────

/**
 * Creates a new product from an uploaded image. Triggers analysis automatically.
 * The product name defaults to a cleaned-up version of the filename.
 * Requires authentication.
 */
export const createProduct = mutation({
  args: {
    imageUrl: v.string(),
    name: v.optional(v.string()),
    imageStorageId: v.optional(v.string()),
  },
  handler: async (ctx, { imageUrl, name, imageStorageId }) => {
    const userId = await requireAuth(ctx)

    // Default name from URL if not provided (extract filename, clean up)
    const defaultName = name || deriveNameFromUrl(imageUrl)

    const productId = await ctx.db.insert('products', {
      name: defaultName,
      imageUrl,
      imageStorageId,
      status: 'analyzing',
      userId,
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
 * Runs product analysis (vision).
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
    const userId = await getAuthUserId(ctx)
    const product = await ctx.db.get(productId)
    if (!product || product.archivedAt) return null
    // Only return product if user owns it (or it's legacy data without userId)
    if (product.userId && product.userId !== userId) return null
    return product
  },
})

export const getProductInternal = internalQuery({
  args: { productId: v.id('products') },
  handler: async (ctx, { productId }) => ctx.db.get(productId),
})

/**
 * Lists all non-archived products for the authenticated user, newest first.
 * Includes generation count for each product.
 * Returns empty array if not authenticated.
 */
export const listProducts = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return []

    // Use index for efficient user-scoped queries
    const products = await ctx.db
      .query('products')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .filter((q) => q.eq(q.field('archivedAt'), undefined))
      .order('desc')
      .collect()

    // Fetch generation counts for each product
    const productsWithCounts = await Promise.all(
      products.map(async (product) => {
        const generations = await ctx.db
          .query('templateGenerations')
          .withIndex('by_product', (q) => q.eq('productId', product._id))
          .collect()
        return {
          ...product,
          generationCount: generations.length,
        }
      })
    )

    return productsWithCounts
  },
})

/**
 * Gets a product with its generation count.
 * Only returns the product if the authenticated user owns it.
 */
export const getProductWithStats = query({
  args: { productId: v.id('products') },
  handler: async (ctx, { productId }) => {
    const userId = await getAuthUserId(ctx)
    const product = await ctx.db.get(productId)
    if (!product || product.archivedAt) return null
    // Only return product if user owns it (or it's legacy data without userId)
    if (product.userId && product.userId !== userId) return null

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
 * Requires authentication and ownership.
 */
export const updateProduct = mutation({
  args: {
    productId: v.id('products'),
    name: v.optional(v.string()),
    productDescription: v.optional(v.string()),
    targetAudience: v.optional(v.string()),
  },
  handler: async (ctx, { productId, name, productDescription, targetAudience }) => {
    const userId = await requireAuth(ctx)
    const product = await ctx.db.get(productId)
    if (!product) throw new Error('Product not found')
    if (product.userId && product.userId !== userId) {
      throw new Error('Not authorized to update this product')
    }

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
 * Requires authentication and ownership.
 */
export const reanalyzeProduct = mutation({
  args: { productId: v.id('products') },
  handler: async (ctx, { productId }) => {
    const userId = await requireAuth(ctx)
    const product = await ctx.db.get(productId)
    if (!product) throw new Error('Product not found')
    if (product.userId && product.userId !== userId) {
      throw new Error('Not authorized to reanalyze this product')
    }
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
 * Requires authentication and ownership.
 */
export const archiveProduct = mutation({
  args: { productId: v.id('products') },
  handler: async (ctx, { productId }) => {
    const userId = await requireAuth(ctx)
    const product = await ctx.db.get(productId)
    if (!product) throw new Error('Product not found')
    if (product.userId && product.userId !== userId) {
      throw new Error('Not authorized to archive this product')
    }
    if (product.archivedAt) return // Already archived

    await ctx.db.patch(productId, { archivedAt: Date.now() })
  },
})

/**
 * Restores an archived product.
 * Requires authentication and ownership.
 */
export const restoreProduct = mutation({
  args: { productId: v.id('products') },
  handler: async (ctx, { productId }) => {
    const userId = await requireAuth(ctx)
    const product = await ctx.db.get(productId)
    if (!product) throw new Error('Product not found')
    if (product.userId && product.userId !== userId) {
      throw new Error('Not authorized to restore this product')
    }
    if (!product.archivedAt) return // Not archived

    await ctx.db.patch(productId, { archivedAt: undefined })
  },
})

// ─── Generation queries for a product ─────────────────────────────────────

/**
 * Gets all generations for a product, newest first.
 * Requires authentication and product ownership.
 */
export const getProductGenerations = query({
  args: { productId: v.id('products') },
  handler: async (ctx, { productId }) => {
    const userId = await getAuthUserId(ctx)
    // Verify product ownership
    const product = await ctx.db.get(productId)
    if (!product) return []
    if (product.userId && product.userId !== userId) return []

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
 * Requires authentication and ownership of the parent product.
 */
export const deleteGeneration = mutation({
  args: { generationId: v.id('templateGenerations') },
  handler: async (ctx, { generationId }) => {
    const userId = await requireAuth(ctx)
    const generation = await ctx.db.get(generationId)
    if (!generation) throw new Error('Generation not found')

    // Verify ownership via the parent product
    if (generation.productId) {
      const product = await ctx.db.get(generation.productId)
      if (product?.userId && product.userId !== userId) {
        throw new Error('Not authorized to delete this generation')
      }
    }

    await ctx.db.delete(generationId)
  },
})

// ─── Generation from product ──────────────────────────────────────────────

/**
 * Submits a generation request for a product with selected templates.
 * This is the product-centric equivalent of studio.submitRun.
 * Requires authentication and product ownership.
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
    const userId = await requireAuth(ctx)

    if (args.templateIds.length === 0) throw new Error('No templates selected')
    if (args.templateIds.length > 3) throw new Error('At most 3 templates')
    if (args.variationsPerTemplate < 1 || args.variationsPerTemplate > 4) {
      throw new Error('variations must be 1-4')
    }

    const product = await ctx.db.get(args.productId)
    if (!product) throw new Error('Product not found')
    if (product.userId && product.userId !== userId) {
      throw new Error('Not authorized to generate from this product')
    }
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
          userId, // Store userId on generation for efficient queries
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

/**
 * Generate variations from an existing generated image.
 * User can choose to change text, icons, and/or colors.
 * Requires authentication and product ownership.
 */
export const generateVariations = mutation({
  args: {
    generationId: v.id('templateGenerations'),
    productId: v.id('products'),
    sourceImageUrl: v.string(),
    productImageUrl: v.string(),
    changeText: v.boolean(),
    changeIcons: v.boolean(),
    changeColors: v.boolean(),
    variationCount: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx)

    // Verify product ownership
    const product = await ctx.db.get(args.productId)
    if (!product) throw new Error('Product not found')
    if (product.userId && product.userId !== userId) {
      throw new Error('Not authorized to create variations for this product')
    }

    if (args.variationCount < 1 || args.variationCount > 3) {
      throw new Error('Variation count must be 1-3')
    }
    if (!args.changeText && !args.changeIcons && !args.changeColors) {
      throw new Error('Must select at least one thing to change')
    }

    // Get the source generation for metadata
    const sourceGen = await ctx.db.get(args.generationId)
    if (!sourceGen) throw new Error('Source generation not found')

    const generationIds: string[] = []

    for (let i = 0; i < args.variationCount; i++) {
      const genId = await ctx.db.insert('templateGenerations', {
        productId: args.productId,
        userId, // Store userId on generation for efficient queries
        templateId: sourceGen.templateId,
        productImageUrl: args.productImageUrl,
        templateImageUrl: args.sourceImageUrl, // Use the generated image as the "template"
        templateSnapshot: sourceGen.templateSnapshot,
        aspectRatio: sourceGen.aspectRatio,
        mode: 'variation' as const,
        colorAdapt: false,
        variationIndex: i,
        status: 'queued',
        variationSource: {
          sourceGenerationId: args.generationId,
          sourceImageUrl: args.sourceImageUrl,
          changeText: args.changeText,
          changeIcons: args.changeIcons,
          changeColors: args.changeColors,
        },
      })
      generationIds.push(genId)

      // Start the variation workflow
      await workflow.start(ctx, internal.studio.generateVariationWorkflow, {
        generationId: genId,
      })
    }

    return { ok: true, generationIds }
  },
})
