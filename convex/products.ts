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
import {
  CAPABILITIES,
  recordCreditUse,
  requireCapability,
  requireCredit,
  requireProductLimit,
  requireProductLimitForUser,
} from './lib/billing'

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

// ─── Rate limiting ─────────────────────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_CALLS = 20

/**
 * Simple density check: at most 20 generation calls per user per 60 s.
 * Records a `rate-limited` billingEvent on denial so operators can audit
 * abuse patterns.
 *
 * For higher-scale throttling see the Convex Rate Limiter component — future work.
 */
export async function enforceGenerationRateLimit(
  ctx: MutationCtx,
  userId: string,
  mutationName: string,
): Promise<void> {
  const since = Date.now() - RATE_LIMIT_WINDOW_MS
  const recent = await ctx.db
    .query('billingEvents')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .filter((q) =>
      q.and(
        q.gte(q.field('timestamp'), since),
        q.or(
          q.eq(q.field('context'), 'usage'),
          q.eq(q.field('context'), 'rate-limited'),
        ),
      ),
    )
    .collect()

  if (recent.length >= RATE_LIMIT_MAX_CALLS) {
    await ctx.db.insert('billingEvents', {
      userId,
      mutationName,
      allowed: false,
      timestamp: Date.now(),
      context: 'rate-limited',
    })
    throw new Error('Too many requests — please wait a moment before generating again.')
  }
}

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
    // Billing: enforce plan's product count limit before insert.
    await requireProductLimit(ctx, 'createProduct')

    // Default name from URL if not provided (extract filename, clean up)
    const defaultName = name || deriveNameFromUrl(imageUrl)

    // Create the product first (without primaryImageId)
    const productId = await ctx.db.insert('products', {
      name: defaultName,
      imageUrl, // Keep for backward compatibility during migration
      imageStorageId,
      status: 'analyzing',
      userId,
    })

    // Create the productImage record
    const imageId = await ctx.db.insert('productImages', {
      productId,
      userId,
      imageUrl,
      type: 'original',
      status: 'ready',
    })

    // Set the primary image
    await ctx.db.patch(productId, { primaryImageId: imageId })

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
    if (!product.imageUrl) {
      throw new Error('Product has no image URL')
    }

    try {
      const result = await ctx.runAction(internal.ai.analyzeProduct, {
        imageUrl: product.imageUrl,
      })
      await ctx.runMutation(internal.products.saveProductAnalysis, {
        productId,
        category: result.category,
        productDescription: result.productDescription,
        targetAudience: result.targetAudience,
        valueProposition: result.valueProposition,
        marketingAngles: result.marketingAngles,
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
    valueProposition: v.optional(v.string()),
    marketingAngles: v.optional(
      v.array(
        v.object({
          title: v.string(),
          description: v.string(),
          hook: v.string(),
          suggestedAdStyle: v.string(),
          angleType: v.optional(v.union(
            v.literal('comparison'),
            v.literal('curiosity-narrative'),
            v.literal('social-proof'),
            v.literal('problem-callout'),
          )),
          tags: v.optional(v.object({
            productCategory: v.optional(v.string()),
            imageStyle: v.optional(v.string()),
            setting: v.optional(v.string()),
            primaryColor: v.optional(v.string()),
          })),
        }),
      ),
    ),
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

/**
 * Creates a product from a URL import. Skips public-mutation auth (the import
 * action runs server-side) but still attributes the product to the importing
 * user. Mirrors createProduct's setup of product + productImage + scheduling
 * the analysis pass.
 */
export const createProductFromImport = internalMutation({
  args: {
    userId: v.string(),
    name: v.string(),
    imageUrls: v.array(v.string()),
  },
  handler: async (ctx, { userId, name, imageUrls }) => {
    if (imageUrls.length === 0) {
      throw new Error('At least one product image is required')
    }
    await requireProductLimitForUser(ctx, userId, 'createProductFromImport')
    const primaryImageUrl = imageUrls[0]
    const productId = await ctx.db.insert('products', {
      name,
      imageUrl: primaryImageUrl, // back-compat
      status: 'analyzing',
      userId,
    })
    const imageIds: Id<'productImages'>[] = []
    for (const url of imageUrls) {
      const id = await ctx.db.insert('productImages', {
        productId,
        userId,
        imageUrl: url,
        type: 'original',
        status: 'ready',
      })
      imageIds.push(id)
    }
    await ctx.db.patch(productId, { primaryImageId: imageIds[0] })
    await ctx.scheduler.runAfter(0, internal.products.runProductAnalysis, {
      productId,
    })
    return productId
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

    // Use composite index for efficient user-scoped queries filtering archived
    const products = await ctx.db
      .query('products')
      .withIndex('by_userId_archived', (q) =>
        q.eq('userId', userId).eq('archivedAt', undefined)
      )
      .order('desc')
      .collect()

    if (products.length === 0) return []

    // Batch fetch: get all generations for user's products in ONE query
    // This avoids N+1 queries when fetching generation counts
    const allGenerations = await ctx.db
      .query('templateGenerations')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .collect()

    // Group generation counts by productId
    const countsByProduct = new Map<string, number>()
    for (const gen of allGenerations) {
      if (gen.productId) {
        const key = gen.productId as string
        countsByProduct.set(key, (countsByProduct.get(key) ?? 0) + 1)
      }
    }

    // Attach counts to products
    return products.map((product) => ({
      ...product,
      generationCount: countsByProduct.get(product._id as string) ?? 0,
    }))
  },
})

/**
 * Returns everything the new home/dashboard needs in a single query:
 *   - focusProduct: most-recently-created non-archived product (or null)
 *   - recentAds: last 6 completed generations for the focus product
 *   - suggestedCategory: most common product category among user's products
 *   - totalProducts / totalGenerations: counts for stat lines
 *
 * Returns null fields gracefully so the empty state can render.
 */
export const getFocusProduct = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) {
      return {
        focusProduct: null,
        recentAds: [],
        suggestedCategory: null,
        totalProducts: 0,
        totalGenerations: 0,
      }
    }

    const products = await ctx.db
      .query('products')
      .withIndex('by_userId_archived', (q) =>
        q.eq('userId', userId).eq('archivedAt', undefined),
      )
      .order('desc')
      .take(50)

    const focusProduct = products[0] ?? null

    let recentAds: Array<{
      _id: string
      outputUrl: string
      adCopy: { headlines: Array<string> } | null
      createdAt: number
    }> = []
    if (focusProduct) {
      const ads = await ctx.db
        .query('templateGenerations')
        .withIndex('by_product', (q) => q.eq('productId', focusProduct._id))
        .order('desc')
        .take(20)
      recentAds = ads
        .filter((a) => a.status === 'complete' && !!a.outputUrl)
        .slice(0, 6)
        .map((a) => ({
          _id: a._id as string,
          outputUrl: a.outputUrl as string,
          adCopy: a.adCopy
            ? { headlines: a.adCopy.headlines ?? [] }
            : null,
          createdAt: a._creationTime,
        }))
    }

    // Pre-select the user's most common product category for the templates
    // shelf chip filter. Falls back to undefined when no products exist.
    const categoryCounts = new Map<string, number>()
    for (const p of products) {
      if (p.category) {
        categoryCounts.set(p.category, (categoryCounts.get(p.category) ?? 0) + 1)
      }
    }
    let suggestedCategory: string | null = null
    let topCount = 0
    for (const [cat, count] of categoryCounts) {
      if (count > topCount) {
        topCount = count
        suggestedCategory = cat
      }
    }

    const allGens = await ctx.db
      .query('templateGenerations')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .take(1000)

    return {
      focusProduct: focusProduct
        ? {
            _id: focusProduct._id,
            name: focusProduct.name,
            imageUrl: focusProduct.imageUrl ?? null,
            category: focusProduct.category ?? null,
            status: focusProduct.status,
            description: focusProduct.productDescription ?? null,
            updatedAt: focusProduct._creationTime,
          }
        : null,
      recentAds,
      suggestedCategory,
      totalProducts: products.length,
      totalGenerations: allGens.length,
    }
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

// ─── Image Enhancements (DEPRECATED) ──────────────────────────────────────
// These functions operate on the legacy `backgroundRemovedUrl` field on products.
// For new code, use `productImages.removeImageBackground` which creates entries
// in the productImages table with proper parent/child relationships.
// These will be removed once all products are migrated to the new system.

/**
 * @deprecated Use `productImages.removeImageBackground` instead.
 * This operates on the legacy product-level background removal fields.
 * Triggers background removal for a product image.
 * Requires authentication and ownership.
 */
export const removeProductBackground = mutation({
  args: { productId: v.id('products') },
  handler: async (ctx, { productId }) => {
    const userId = await requireAuth(ctx)
    const product = await ctx.db.get(productId)
    if (!product) throw new Error('Product not found')
    if (product.userId && product.userId !== userId) {
      throw new Error('Not authorized to modify this product')
    }
    if (product.archivedAt) throw new Error('Cannot modify archived product')
    if (product.backgroundRemovalStatus === 'processing') {
      throw new Error('Background removal already in progress')
    }
    // Billing: capability check (no credit consumption in v1 for bg-removal).
    await requireCapability(ctx, CAPABILITIES.REMOVE_BACKGROUND, 'removeProductBackground')

    await ctx.db.patch(productId, {
      backgroundRemovalStatus: 'processing',
    })

    await ctx.scheduler.runAfter(0, internal.products.runBackgroundRemoval, {
      productId,
    })

    return { ok: true }
  },
})

/**
 * @deprecated Use `productImages.runImageBackgroundRemoval` instead.
 * Internal action to run background removal.
 */
export const runBackgroundRemoval = internalAction({
  args: { productId: v.id('products') },
  handler: async (ctx, { productId }) => {
    const product = await ctx.runQuery(internal.products.getProductInternal, {
      productId,
    })
    if (!product) return
    if (!product.imageUrl) {
      throw new Error('Product has no image URL')
    }

    try {
      const result = await ctx.runAction(internal.ai.removeBackground, {
        productId,
        imageUrl: product.imageUrl,
      })

      await ctx.runMutation(internal.products.saveBackgroundRemoval, {
        productId,
        backgroundRemovedUrl: result.outputUrl,
      })
    } catch (err) {
      await ctx.runMutation(internal.products.failBackgroundRemoval, {
        productId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  },
})

/** @deprecated Use `productImages.saveImageEnhancement` instead. */
export const saveBackgroundRemoval = internalMutation({
  args: {
    productId: v.id('products'),
    backgroundRemovedUrl: v.string(),
  },
  handler: async (ctx, { productId, backgroundRemovedUrl }) => {
    await ctx.db.patch(productId, {
      backgroundRemovedUrl,
      backgroundRemovalStatus: 'complete',
    })
  },
})

/** @deprecated Use `productImages.failImageEnhancement` instead. */
export const failBackgroundRemoval = internalMutation({
  args: {
    productId: v.id('products'),
    error: v.string(),
  },
  handler: async (ctx, { productId, error }) => {
    await ctx.db.patch(productId, {
      backgroundRemovalStatus: 'failed',
      error,
    })
  },
})

/**
 * @deprecated Use productImages table deletion instead.
 * Clears the background-removed image (revert to original).
 */
export const clearBackgroundRemoval = mutation({
  args: { productId: v.id('products') },
  handler: async (ctx, { productId }) => {
    const userId = await requireAuth(ctx)
    const product = await ctx.db.get(productId)
    if (!product) throw new Error('Product not found')
    if (product.userId && product.userId !== userId) {
      throw new Error('Not authorized to modify this product')
    }

    await ctx.db.patch(productId, {
      backgroundRemovedUrl: undefined,
      backgroundRemovalStatus: 'idle',
    })

    return { ok: true }
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
    model: v.optional(v.union(v.literal('nano-banana-2'), v.literal('gpt-image-2'))),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx)

    // Rate limit: must run before billing to avoid burning credits on abuse.
    await enforceGenerationRateLimit(ctx, userId, 'generateFromProduct')

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

    // Billing: capability + credit enforcement.
    const billing = await requireCapability(
      ctx,
      CAPABILITIES.GENERATE_VARIATIONS,
      'generateFromProduct',
    )
    if (args.variationsPerTemplate > 2) {
      await requireCapability(
        ctx,
        CAPABILITIES.BATCH_GENERATION,
        'generateFromProduct',
      )
    }
    const totalCredits = args.templateIds.length * args.variationsPerTemplate
    await requireCredit(ctx, 'generateFromProduct', totalCredits)

    // Get the primary image to use for generation
    let productImageUrl: string
    let productImageId: Id<'productImages'> | undefined

    if (product.primaryImageId) {
      const primaryImage = await ctx.db.get(product.primaryImageId)
      if (!primaryImage || primaryImage.status !== 'ready') {
        throw new Error('Primary image not available')
      }
      productImageUrl = primaryImage.imageUrl
      productImageId = primaryImage._id
    } else if (product.imageUrl) {
      // Fallback for legacy products not yet migrated
      productImageUrl = product.imageUrl
    } else {
      throw new Error('Product has no image')
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
          productImageId, // Track which image was used
          userId, // Store userId on generation for efficient queries
          templateId,
          productImageUrl,
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
          model: args.model ?? 'nano-banana-2',
        })
        generationIds.push(genId)

        // Billing: record credit consumption before scheduling — ensures
        // retries/failures still count against quota.
        await recordCreditUse(
          ctx,
          billing,
          'generateFromProduct',
          CAPABILITIES.GENERATE_VARIATIONS,
        )

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
 *
 * Supports search (substring across the structured tag fields) and single-value
 * filters (productCategory / imageStyle / setting / primaryColor / aspectRatio).
 * For the current library size (<500) all matching is done in-memory after a
 * single index scan; for larger libraries this should switch to the dedicated
 * structured-tag indexes already declared on adTemplates.
 */
export const listTemplates = query({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    search: v.optional(v.string()),
    productCategory: v.optional(v.string()),
    imageStyle: v.optional(v.string()),
    setting: v.optional(v.string()),
    primaryColor: v.optional(v.string()),
    aspectRatio: v.optional(aspectRatioValidator),
    angleType: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { cursor, limit = 24, search, productCategory, imageStyle, setting, primaryColor, aspectRatio, angleType },
  ) => {
    const hasFilter =
      !!search ||
      !!productCategory ||
      !!imageStyle ||
      !!setting ||
      !!primaryColor ||
      !!aspectRatio ||
      !!angleType

    if (!hasFilter) {
      // Fast path: cursor-based pagination over the by_status index.
      let q = ctx.db
        .query('adTemplates')
        .withIndex('by_status', (q) => q.eq('status', 'published'))
        .order('desc')
      if (cursor) {
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
      return { items, nextCursor, hasMore }
    }

    // Filtered path: scan all published, filter in-memory, paginate by cursor.
    const all = await ctx.db
      .query('adTemplates')
      .withIndex('by_status', (q) => q.eq('status', 'published'))
      .order('desc')
      .collect()

    const needle = (search ?? '').trim().toLowerCase()

    const matched = all.filter((t) => {
      if (productCategory && t.productCategory !== productCategory) return false
      if (imageStyle && t.imageStyle !== imageStyle) return false
      if (setting && t.setting !== setting) return false
      if (primaryColor && t.primaryColor !== primaryColor) return false
      if (aspectRatio && t.aspectRatio !== aspectRatio) return false
      if (angleType && t.angleType !== angleType) return false
      if (!needle) return true
      const haystack = [
        t.productCategory,
        t.subcategory,
        t.imageStyle,
        t.setting,
        t.composition,
        t.primaryColor,
        t.sceneDescription,
      ]
        .filter((v): v is string => typeof v === 'string')
        .join(' ')
        .toLowerCase()
      return haystack.includes(needle)
    })

    let startIdx = 0
    if (cursor) {
      const idx = matched.findIndex((t) => t._id === cursor)
      if (idx < 0) {
        return { items: [], nextCursor: null, hasMore: false }
      }
      startIdx = idx + 1
    }
    const slice = matched.slice(startIdx, startIdx + limit + 1)
    const hasMore = slice.length > limit
    const items = hasMore ? slice.slice(0, limit) : slice
    const nextCursor = hasMore ? items[items.length - 1]._id : null
    return { items, nextCursor, hasMore }
  },
})

/**
 * Distinct values currently in use across published templates, for the
 * user-facing filter UI. Cheap to compute given current library size.
 */
export const listTemplateFilterOptions = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query('adTemplates')
      .withIndex('by_status', (q) => q.eq('status', 'published'))
      .collect()

    const productCategories = new Set<string>()
    const imageStyles = new Set<string>()
    const settings = new Set<string>()
    const primaryColors = new Set<string>()
    const angleTypes = new Set<string>()
    for (const r of rows) {
      if (r.productCategory) productCategories.add(r.productCategory)
      if (r.imageStyle) imageStyles.add(r.imageStyle)
      if (r.setting) settings.add(r.setting)
      if (r.primaryColor) primaryColors.add(r.primaryColor)
      if (r.angleType) angleTypes.add(r.angleType)
    }
    return {
      productCategories: [...productCategories].sort(),
      imageStyles: [...imageStyles].sort(),
      settings: [...settings].sort(),
      primaryColors: [...primaryColors].sort(),
      angleTypes: [...angleTypes].sort(),
    }
  },
})

export const countPublishedTemplates = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db
      .query('adTemplates')
      .withIndex('by_status', (q) => q.eq('status', 'published'))
      .collect()
    return { count: all.length }
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
    model: v.optional(v.union(v.literal('nano-banana-2'), v.literal('gpt-image-2'))),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx)

    // Rate limit: must run before billing to avoid burning credits on abuse.
    await enforceGenerationRateLimit(ctx, userId, 'generateVariations')

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

    // Billing: capability + reserve credits upfront.
    const billing = await requireCapability(
      ctx,
      CAPABILITIES.GENERATE_VARIATIONS,
      'generateVariations',
    )
    await requireCredit(ctx, 'generateVariations', args.variationCount)

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
        model: args.model ?? 'nano-banana-2',
        variationSource: {
          sourceGenerationId: args.generationId,
          sourceImageUrl: args.sourceImageUrl,
          changeText: args.changeText,
          changeIcons: args.changeIcons,
          changeColors: args.changeColors,
        },
      })
      generationIds.push(genId)

      // Billing: consume one credit per generation.
      await recordCreditUse(
        ctx,
        billing,
        'generateVariations',
        CAPABILITIES.GENERATE_VARIATIONS,
      )

      // Start the variation workflow
      await workflow.start(ctx, internal.studio.generateVariationWorkflow, {
        generationId: genId,
      })
    }

    return { ok: true, generationIds }
  },
})

