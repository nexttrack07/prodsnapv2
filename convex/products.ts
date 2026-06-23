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
import type { Doc, Id } from './_generated/dataModel'
import {
  CAPABILITIES,
  requireCapability,
  requireProductLimit,
  requireProductLimitForUser,
} from './lib/billing'
import { requireCredits } from './lib/billing/credits'
import { billingError } from './lib/billing/errors'
import { requireAdminIdentity } from './lib/admin/requireAdmin'
import {
  buildRecommendedConcepts,
  type MarketingAngleInput,
} from './lib/adTestRecommendations'

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

  const recentUnits = recent.reduce((sum, event) => sum + (event.units ?? 1), 0)
  if (recentUnits >= RATE_LIMIT_MAX_CALLS) {
    await ctx.db.insert('billingEvents', {
      userId,
      mutationName,
      allowed: false,
      timestamp: Date.now(),
      context: 'rate-limited',
    })
    throw billingError(
      'RATE_LIMIT',
      'Too many requests — please wait a moment before generating again.',
    )
  }
}

export async function recordGenerationUsage(
  ctx: MutationCtx,
  userId: string,
  mutationName: string,
  units = 1,
): Promise<void> {
  await ctx.db.insert('billingEvents', {
    userId,
    mutationName,
    allowed: true,
    timestamp: Date.now(),
    units,
    context: 'usage',
  })
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
    // Brand assigned at creation. Omit for an unbranded product.
    brandKitId: v.optional(v.id('brandKits')),
  },
  handler: async (ctx, { imageUrl, name, imageStorageId, brandKitId }) => {
    const userId = await requireAuth(ctx)
    // Billing: enforce plan's product count limit before insert.
    await requireProductLimit(ctx, 'createProduct')

    // Validate brand ownership before associating it with the product.
    if (brandKitId) {
      const kit = await ctx.db.get(brandKitId)
      if (!kit || kit.userId !== userId) throw new Error('Brand not found')
    }

    // Default name from URL if not provided (extract filename, clean up)
    const defaultName = name || deriveNameFromUrl(imageUrl)

    // Create the product first (without primaryImageId)
    const productId = await ctx.db.insert('products', {
      name: defaultName,
      imageUrl, // Keep for backward compatibility during migration
      imageStorageId,
      status: 'analyzing',
      userId,
      ...(brandKitId ? { brandKitId } : {}),
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

// ─── Demo "Try with a sample" on-ramp ────────────────────────────────────────

/**
 * Admin-only: designate one analyzed product as the demo sample that fresh
 * users clone via "Try with a sample". Marks exactly one — clears any prior.
 * Run once from the Convex dashboard with the product's id (it's in the
 * /studio/<id> URL of the product you want to showcase).
 */
export const setSampleSourceProduct = mutation({
  args: { productId: v.id('products') },
  handler: async (ctx, { productId }) => {
    await requireAdminIdentity(ctx)
    const product = await ctx.db.get(productId)
    if (!product) throw new Error('Product not found')
    if (product.status !== 'ready' || !product.primaryImageId) {
      throw new Error('Sample product must be analyzed (ready) with a primary image')
    }
    // Clear any previously-flagged sample(s) so exactly one is the source.
    const existing = await ctx.db
      .query('products')
      .withIndex('by_sample_source', (q) => q.eq('isSampleSource', true))
      .collect()
    for (const p of existing) {
      if (p._id !== productId) await ctx.db.patch(p._id, { isSampleSource: false })
    }
    await ctx.db.patch(productId, { isSampleSource: true })
  },
})

/**
 * Returns a lightweight summary of the demo sample product, or null if none
 * is configured. Drives whether the "Try with a sample" CTA renders.
 */
export const getSampleProduct = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return null
    const sample = await ctx.db
      .query('products')
      .withIndex('by_sample_source', (q) => q.eq('isSampleSource', true))
      .first()
    if (!sample || sample.status !== 'ready') return null
    return { _id: sample._id, name: sample.name }
  },
})

/**
 * Clones the demo sample product into the caller's account as a ready-to-use
 * product (image + analysis + angles copied), so a brand-new user can hit
 * Generate immediately. Only available to genuinely fresh users — anyone who
 * already has a product or a brand kit is rejected.
 */
export const createProductFromSample = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx)

    const existingProduct = await ctx.db
      .query('products')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .first()
    if (existingProduct) {
      throw new Error('The sample is only available before you add your own product.')
    }
    const existingBrand = await ctx.db
      .query('brandKits')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .first()
    if (existingBrand) {
      throw new Error('The sample is only available before you create a brand.')
    }

    const sample = await ctx.db
      .query('products')
      .withIndex('by_sample_source', (q) => q.eq('isSampleSource', true))
      .first()
    if (!sample || sample.status !== 'ready') {
      throw new Error('No sample product is available right now.')
    }

    // Resolve the sample's primary image URL (fall back to the legacy field).
    let imageUrl = sample.imageUrl
    if (sample.primaryImageId) {
      const img = await ctx.db.get(sample.primaryImageId)
      if (img) imageUrl = img.imageUrl
    }
    if (!imageUrl) throw new Error('Sample product has no image.')

    // Clone the analyzed product into the caller's account (status: ready).
    const productId = await ctx.db.insert('products', {
      name: sample.name,
      status: 'ready',
      userId,
      imageUrl,
      category: sample.category,
      productDescription: sample.productDescription,
      targetAudience: sample.targetAudience,
      valueProposition: sample.valueProposition,
      marketingAngles: sample.marketingAngles,
      customerLanguage: sample.customerLanguage,
    })
    const imageId = await ctx.db.insert('productImages', {
      productId,
      userId,
      imageUrl,
      type: 'original',
      status: 'ready',
    })
    await ctx.db.patch(productId, { primaryImageId: imageId })

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
      if (!product.imageUrl) {
        throw new Error('Product has no image URL')
      }
      const result = await ctx.runAction(internal.ai.analyzeProduct, {
        imageUrl: product.imageUrl,
        customerLanguage: product.customerLanguage,
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

    // Persist "what to test next" recommendations from the fresh analysis.
    // These are stored concepts (not query-time LLM calls) that Home reads
    // directly. Re-analysis refreshes them via replaceProductRecommendations.
    const product = await ctx.db.get(productId)
    if (product?.userId && rest.marketingAngles && rest.marketingAngles.length > 0) {
      await replaceProductRecommendations(
        ctx,
        productId,
        product.userId,
        rest.marketingAngles,
      )
    }
  },
})

/**
 * Replaces a product's pending Ad Test recommendations from its marketing
 * angles. Deletes only un-consumed, un-dismissed rows (so the shelf refreshes
 * on re-analysis) while preserving recommendation history the user has acted
 * on. Idempotent enough for repeated analysis runs.
 */
async function replaceProductRecommendations(
  ctx: MutationCtx,
  productId: Id<'products'>,
  userId: string,
  marketingAngles: MarketingAngleInput[],
): Promise<void> {
  const existing = await ctx.db
    .query('adTestRecommendations')
    .withIndex('by_productId', (q) => q.eq('productId', productId))
    .collect()
  for (const row of existing) {
    if (row.consumedAt === undefined && row.dismissedAt === undefined) {
      await ctx.db.delete(row._id)
    }
  }

  const now = Date.now()
  const concepts = buildRecommendedConcepts(marketingAngles, now)
  for (const concept of concepts) {
    await ctx.db.insert('adTestRecommendations', {
      userId,
      productId,
      concept,
      createdAt: now,
      updatedAt: now,
    })
  }
}

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
    customerLanguage: v.optional(v.array(v.string())),
    description: v.optional(v.string()),
    price: v.optional(v.number()),
    currency: v.optional(v.string()),
    category: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    aiNotes: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { userId, name, imageUrls, customerLanguage, description, price, currency, category, tags, aiNotes },
  ) => {
    if (imageUrls.length === 0) {
      throw new Error('At least one product image is required')
    }
    await requireProductLimitForUser(ctx, userId, 'createProductFromImport')
    const primaryImageUrl = imageUrls[0]
    // Clean customer language: non-empty, max 500 chars, max 50
    const cleanedLanguage = customerLanguage
      ?.map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => s.slice(0, 500))
      .slice(0, 50)
    const cleanedDescription = description?.trim().slice(0, 1500)
    const cleanedAiNotes = aiNotes?.trim().slice(0, 500)
    const cleanedTags = tags
      ?.map((t) => t.trim())
      .filter((t) => t.length > 0)
      .slice(0, 20)
    const productId = await ctx.db.insert('products', {
      name,
      imageUrl: primaryImageUrl, // back-compat
      status: 'analyzing',
      userId,
      ...(cleanedLanguage && cleanedLanguage.length > 0 ? { customerLanguage: cleanedLanguage } : {}),
      ...(cleanedDescription ? { productDescription: cleanedDescription } : {}),
      ...(price != null ? { price } : {}),
      ...(currency ? { currency } : {}),
      ...(category ? { category } : {}),
      ...(cleanedTags && cleanedTags.length > 0 ? { tags: cleanedTags } : {}),
      ...(cleanedAiNotes ? { aiNotes: cleanedAiNotes } : {}),
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

/**
 * Creates a new product with full rich metadata from the /products/new route.
 * Supports multiple images (all uploaded to R2 beforehand).
 */
export const createProductRich = mutation({
  args: {
    name: v.string(),
    imageUrls: v.array(v.string()),
    productDescription: v.optional(v.string()),
    category: v.optional(v.string()),
    price: v.optional(v.number()),
    currency: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    aiNotes: v.optional(v.string()),
    // Brand assigned at creation. Omit for an unbranded product.
    brandKitId: v.optional(v.id('brandKits')),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx)
    if (args.imageUrls.length === 0) throw new Error('At least one image is required')
    if (args.name.trim().length === 0) throw new Error('Name is required')
    await requireProductLimitForUser(ctx, userId, 'createProductRich')

    // Validate brand ownership before associating it with the product.
    if (args.brandKitId) {
      const kit = await ctx.db.get(args.brandKitId)
      if (!kit || kit.userId !== userId) throw new Error('Brand not found')
    }

    const productId = await ctx.db.insert('products', {
      name: args.name.trim(),
      status: 'analyzing',
      userId,
      imageUrl: args.imageUrls[0],
      ...(args.brandKitId ? { brandKitId: args.brandKitId } : {}),
      ...(args.productDescription ? { productDescription: args.productDescription.trim() } : {}),
      ...(args.category ? { category: args.category.trim() } : {}),
      ...(args.price != null ? { price: args.price } : {}),
      ...(args.currency ? { currency: args.currency } : {}),
      ...(args.tags && args.tags.length > 0 ? { tags: args.tags.map((t) => t.trim()).filter(Boolean).slice(0, 20) } : {}),
      ...(args.aiNotes ? { aiNotes: args.aiNotes.trim() } : {}),
    })

    const imageIds: Id<'productImages'>[] = []
    for (const url of args.imageUrls) {
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
    await ctx.scheduler.runAfter(0, internal.products.runProductAnalysis, { productId })
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

    // Batch fetch: get generations for user's products in ONE query (avoids
    // N+1 when computing counts). Bounded with .take() so a power user with a
    // huge generation history can't blow the Convex per-query read limit and
    // error out the whole products page. Beyond the cap the per-product count
    // badge is approximate — acceptable for a dashboard stat.
    const GENERATION_COUNT_SCAN_CAP = 5000
    const allGenerations = await ctx.db
      .query('templateGenerations')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .take(GENERATION_COUNT_SCAN_CAP)

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
      aspectRatio: string
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
        .slice(0, 12)
        .map((a) => ({
          _id: a._id as string,
          outputUrl: a.outputUrl as string,
          aspectRatio: a.aspectRatio ?? '1:1',
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
    brandKitId: v.optional(v.id('brandKits')),
    customerLanguage: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { productId, name, productDescription, targetAudience, brandKitId, customerLanguage }) => {
    const userId = await requireAuth(ctx)
    const product = await ctx.db.get(productId)
    if (!product) throw new Error('Product not found')
    if (product.userId && product.userId !== userId) {
      throw new Error('Not authorized to update this product')
    }

    const patch: Record<string, unknown> = {}
    if (name !== undefined) patch.name = name
    if (productDescription !== undefined) patch.productDescription = productDescription
    if (targetAudience !== undefined) patch.targetAudience = targetAudience
    if (brandKitId !== undefined) patch.brandKitId = brandKitId
    if (customerLanguage !== undefined) {
      // Validate: non-empty strings, max 500 chars each, max 50 items
      const cleaned = customerLanguage
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => s.slice(0, 500))
        .slice(0, 50)
      patch.customerLanguage = cleaned
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(productId, patch)
    }
  },
})

/**
 * Removes the brand association from a product.
 * Requires authentication and ownership.
 */
export const clearProductBrand = mutation({
  args: { productId: v.id('products') },
  handler: async (ctx, { productId }) => {
    const userId = await requireAuth(ctx)
    const product = await ctx.db.get(productId)
    if (!product) throw new Error('Product not found')
    if (product.userId && product.userId !== userId) {
      throw new Error('Not authorized to update this product')
    }
    await ctx.db.patch(productId, { brandKitId: undefined })
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

// NOTE: The legacy product-level background-removal path
// (removeProductBackground / runBackgroundRemoval / saveBackgroundRemoval /
// failBackgroundRemoval / clearBackgroundRemoval) was removed in the #42
// cleanup. The active path is image-level: productImages.removeImageBackground.
// The deprecated products.backgroundRemovedUrl / backgroundRemovalStatus fields
// are kept for now — the data migration and userDeletion R2 cleanup still read
// them.

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
// Map a generated creative's aspect ratio to its Meta placement, so Ad Test
// creatives produced by the template wizard carry the same placement metadata
// as angle-based ones (used for grouping + export filenames).
const PLACEMENT_FOR_ASPECT: Record<
  string,
  'feed_square' | 'feed_vertical' | 'story_reel' | 'landscape'
> = {
  '1:1': 'feed_square',
  '4:5': 'feed_vertical',
  '9:16': 'story_reel',
  '16:9': 'landscape',
}

export const generateFromProduct = mutation({
  args: {
    productId: v.id('products'),
    templateIds: v.array(v.id('adTemplates')),
    mode: v.union(v.literal('exact'), v.literal('remix')),
    colorAdapt: v.boolean(),
    variationsPerTemplate: v.number(),
    aspectRatio: aspectRatioValidator,
    model: v.optional(v.union(v.literal('nano-banana-2'), v.literal('gpt-image-2'))),
    /** Optional: pick a specific source image. Defaults to the primary. */
    productImageId: v.optional(v.id('productImages')),
    /** Apply brand theme (colors/font/tagline/offer). Defaults to true. */
    applyBrand: v.optional(v.boolean()),
    /** Apply customer voice (brand voice + customer phrases). Defaults to true. */
    applyVoice: v.optional(v.boolean()),
    /**
     * Optional: attach these creatives to an Ad Test. The test becomes the
     * container that groups creatives + copy. When set, each generated row is
     * tagged with adTestId (+ placement/adUnitIndex) and the test's planned
     * counter and status are advanced; completion bumps the test's counters via
     * the generation workflow. When absent, this is a standalone generation.
     */
    adTestId: v.optional(v.id('adTests')),
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

    // When attaching to an Ad Test, verify it's owned and belongs to this
    // product. We compute the next adUnitIndex so creatives added across
    // multiple generate passes keep a stable, gapless order (used for export
    // filenames and grid ordering).
    let adTestBaseUnitIndex = 0
    if (args.adTestId) {
      const adTest = await ctx.db.get(args.adTestId)
      if (!adTest || adTest.userId !== userId) throw new Error('Ad Test not found')
      if (adTest.productId !== args.productId) {
        throw new Error('Ad Test does not belong to this product')
      }
      if (adTest.archivedAt) throw new Error('Cannot add to an archived Ad Test')
      const existing = await ctx.db
        .query('templateGenerations')
        .withIndex('by_adTestId', (q) => q.eq('adTestId', args.adTestId))
        .collect()
      adTestBaseUnitIndex = existing.reduce(
        (max, g) => Math.max(max, (g.adUnitIndex ?? -1) + 1),
        0,
      )
    }

    // Billing: capability enforcement. Standalone generation keeps the legacy
    // paid-feature gate. In-test generation (adTestId set) is the primary,
    // credit-metered flow — free users have 100 starter credits and must be
    // able to generate within them — so it's gated by requireCredits below
    // only, mirroring the starter activation path.
    if (!args.adTestId) {
      await requireCapability(
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
    }

    // Resolve the source image: caller-supplied productImageId wins (so the
    // wizard can pick a non-primary source for this run); falls back to the
    // product's primary image; legacy fallback to the deprecated imageUrl.
    let productImageUrl: string
    let productImageId: Id<'productImages'> | undefined

    if (args.productImageId) {
      const picked = await ctx.db.get(args.productImageId)
      if (!picked) throw new Error('Source image not found')
      if (picked.productId !== args.productId) {
        throw new Error('Source image does not belong to this product')
      }
      if (picked.status !== 'ready') {
        throw new Error('Source image not ready')
      }
      productImageUrl = picked.imageUrl
      productImageId = picked._id
    } else if (product.primaryImageId) {
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

    // Pre-flight credit check for the whole batch, so an out-of-credits user
    // gets a clean "insufficient credits" error up front instead of a string
    // of failed generations after fal.ai has already run.
    const productModelKey =
      (args.model ?? 'nano-banana-2') === 'gpt-image-2' ? 'gpt-image-2-edit' : 'nano-banana-2'
    await requireCredits(
      ctx,
      productModelKey,
      args.templateIds.length * args.variationsPerTemplate,
    )
    await recordGenerationUsage(
      ctx,
      userId,
      'generateFromProduct',
      args.templateIds.length * args.variationsPerTemplate,
    )

    // Create generations for each (template × variation) pair
    const generationIds: string[] = []
    let variationCounter = 0

    for (const templateId of args.templateIds) {
      const tpl = await ctx.db.get(templateId)
      if (!tpl) throw new Error(`Template ${templateId} not found`)
      if (tpl.status !== 'published') {
        throw new Error(`Template ${templateId} is not published`)
      }
      // A user may generate from a curated template, their own custom
      // template, or anyone's public custom template — but never from
      // someone else's private upload.
      if (tpl.ownerUserId && tpl.ownerUserId !== userId && tpl.visibility !== 'public') {
        throw new Error(`Template ${templateId} is not available`)
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
            // Custom templates carry a user-given name; curated rows fall back
            // to their category label.
            name: tpl.name || tpl.category || undefined,
            aspectRatio: tpl.aspectRatio,
          },
          aspectRatio: args.aspectRatio,
          mode: args.mode,
          colorAdapt: args.colorAdapt,
          applyBrand: args.applyBrand ?? true,
          applyVoice: args.applyVoice ?? true,
          variationIndex: variationCounter,
          status: 'queued',
          model: args.model ?? 'nano-banana-2',
          // Ad Test linkage (only when generating into a test).
          adTestId: args.adTestId,
          placement: args.adTestId
            ? PLACEMENT_FOR_ASPECT[args.aspectRatio]
            : undefined,
          adUnitIndex: args.adTestId
            ? adTestBaseUnitIndex + variationCounter
            : undefined,
        })
        variationCounter++
        generationIds.push(genId)

        // Start the generation workflow
        await workflow.start(ctx, internal.studio.generateFromTemplateWorkflow, {
          generationId: genId,
        })
      }
    }

    // Advance the Ad Test: bump its planned counter and flip to generating.
    // (Completion bumps completed/failed/winner via the generation workflow;
    // plannedImageCount is owned at fan-out time, here.)
    if (args.adTestId) {
      const adTest = await ctx.db.get(args.adTestId)
      if (adTest) {
        await ctx.db.patch(args.adTestId, {
          plannedImageCount: adTest.plannedImageCount + generationIds.length,
          status: 'generating',
          updatedAt: Date.now(),
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
      //
      // Browse shows curated + anyone's public custom templates; private
      // custom rows (a user's own un-shared uploads) never appear here. The
      // visibility filter has to run AFTER the index read, so a single
      // take(limit + 1) is wrong: one private upload inside that window drops
      // the post-filter count to `limit`, flips hasMore to false, and strands
      // every older curated template behind a dead cursor (the "only 24
      // templates" bug). Instead, keep paging the index in batches until we've
      // collected limit + 1 *visible* rows or run out.
      let boundTime: number | undefined
      if (cursor) {
        const cursorDoc = await ctx.db.get(cursor as Id<'adTemplates'>)
        // Missing cursor doc (deleted since) → start from the top rather than
        // returning an empty, dead-end page.
        boundTime = cursorDoc?._creationTime
      }

      const visible: Doc<'adTemplates'>[] = []
      while (visible.length < limit + 1) {
        let q = ctx.db
          .query('adTemplates')
          .withIndex('by_status', (x) => x.eq('status', 'published'))
          .order('desc')
        if (boundTime !== undefined) {
          const t = boundTime
          q = q.filter((x) => x.lt(x.field('_creationTime'), t))
        }
        const batch = await q.take(limit + 1)
        if (batch.length === 0) break
        for (const row of batch) {
          boundTime = row._creationTime
          if (!row.ownerUserId || row.visibility === 'public') visible.push(row)
        }
        // Fewer than a full batch came back → the index is exhausted.
        if (batch.length < limit + 1) break
      }

      const hasMore = visible.length > limit
      const items = hasMore ? visible.slice(0, limit) : visible
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
      // Browse shows curated + anyone's public custom; never private custom.
      if (t.ownerUserId && t.visibility !== 'public') return false
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
 * Exact count of browse-visible templates (curated + anyone's public custom),
 * optionally narrowed by the same filters as `listTemplates`. Used for the
 * header tagline so it shows the full library size instead of the paginated
 * "24+" loaded count. Scans all published rows once — cheap at current size;
 * revisit (e.g. a maintained counter) past ~10k rows.
 */
export const countTemplates = query({
  args: {
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
    { search, productCategory, imageStyle, setting, primaryColor, aspectRatio, angleType },
  ) => {
    const all = await ctx.db
      .query('adTemplates')
      .withIndex('by_status', (q) => q.eq('status', 'published'))
      .collect()
    const needle = (search ?? '').trim().toLowerCase()
    let count = 0
    for (const t of all) {
      // Mirror listTemplates' visibility + filter predicate exactly.
      if (t.ownerUserId && t.visibility !== 'public') continue
      if (productCategory && t.productCategory !== productCategory) continue
      if (imageStyle && t.imageStyle !== imageStyle) continue
      if (setting && t.setting !== setting) continue
      if (primaryColor && t.primaryColor !== primaryColor) continue
      if (aspectRatio && t.aspectRatio !== aspectRatio) continue
      if (angleType && t.angleType !== angleType) continue
      if (needle) {
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
        if (!haystack.includes(needle)) continue
      }
      count++
    }
    return count
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
      // Filter chips come from the curated library only (custom rows are untagged).
      if (r.ownerUserId) continue
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
    // Match the discover browse: curated + public custom templates.
    const count = all.filter((t) => !t.ownerUserId || t.visibility === 'public').length
    return { count }
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

    // Billing: capability gate.
    await requireCapability(
      ctx,
      CAPABILITIES.GENERATE_VARIATIONS,
      'generateVariations',
    )

    // Get the source generation for metadata
    const sourceGen = await ctx.db.get(args.generationId)
    if (!sourceGen) throw new Error('Source generation not found')
    if (sourceGen.userId && sourceGen.userId !== userId) {
      throw new Error('Not authorized to use this source generation')
    }
    if (sourceGen.productId && sourceGen.productId !== args.productId) {
      throw new Error('Source generation does not belong to this product')
    }
    if (sourceGen.status !== 'complete' || !sourceGen.outputUrl) {
      throw new Error('Source generation is not ready')
    }

    const sourceImageUrl = sourceGen.outputUrl
    const productImageUrl =
      sourceGen.productImageUrl ||
      (product.primaryImageId
        ? (await ctx.db.get(product.primaryImageId))?.imageUrl
        : undefined) ||
      product.imageUrl
    if (!productImageUrl) {
      throw new Error('Product has no source image')
    }

    // Pre-flight credit check for the whole variation batch.
    const variationModelKey =
      (args.model ?? 'nano-banana-2') === 'gpt-image-2' ? 'gpt-image-2-edit' : 'nano-banana-2'
    await requireCredits(ctx, variationModelKey, args.variationCount)
    await recordGenerationUsage(ctx, userId, 'generateVariations', args.variationCount)

    const generationIds: string[] = []

    for (let i = 0; i < args.variationCount; i++) {
      const genId = await ctx.db.insert('templateGenerations', {
        productId: args.productId,
        userId, // Store userId on generation for efficient queries
        templateId: sourceGen.templateId,
        productImageUrl,
        templateImageUrl: sourceImageUrl, // Use the generated image as the "template"
        templateSnapshot: sourceGen.templateSnapshot,
        aspectRatio: sourceGen.aspectRatio,
        mode: 'variation' as const,
        colorAdapt: false,
        variationIndex: i,
        status: 'queued',
        model: args.model ?? 'nano-banana-2',
        variationSource: {
          sourceGenerationId: args.generationId,
          sourceImageUrl,
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

