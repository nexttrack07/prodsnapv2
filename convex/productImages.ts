import { v } from 'convex/values'
import {
  mutation,
  query,
  internalMutation,
  internalAction,
  internalQuery,
  type QueryCtx,
  type MutationCtx,
} from './_generated/server'
import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { CAPABILITIES, requireCapability } from './lib/billing'

// ─── Auth helpers ──────────────────────────────────────────────────────────

async function requireAuth(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    throw new Error('Not authenticated')
  }
  return identity.tokenIdentifier
}

async function getAuthUserId(ctx: QueryCtx | MutationCtx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity()
  return identity?.tokenIdentifier ?? null
}

// ─── Product Image Queries ─────────────────────────────────────────────────

/**
 * Gets all images for a product, organized by parent/child relationships.
 * Returns original images with their enhancements nested.
 */
export const getProductImages = query({
  args: { productId: v.id('products') },
  handler: async (ctx, { productId }) => {
    const userId = await getAuthUserId(ctx)

    // Verify product ownership
    const product = await ctx.db.get(productId)
    if (!product) return []
    if (product.userId && product.userId !== userId) return []

    const images = await ctx.db
      .query('productImages')
      .withIndex('by_product', (q) => q.eq('productId', productId))
      .collect()

    // Organize: originals with their enhancements
    const originals = images.filter((img) => img.type === 'original')
    const enhancements = images.filter((img) => img.type !== 'original')

    return originals.map((original) => ({
      ...original,
      enhancements: enhancements.filter((e) => e.parentImageId === original._id),
    }))
  },
})

/**
 * Gets all images for a product as a flat list.
 */
export const getProductImagesList = query({
  args: { productId: v.id('products') },
  handler: async (ctx, { productId }) => {
    const userId = await getAuthUserId(ctx)

    // Verify product ownership
    const product = await ctx.db.get(productId)
    if (!product) return []
    if (product.userId && product.userId !== userId) return []

    return ctx.db
      .query('productImages')
      .withIndex('by_product', (q) => q.eq('productId', productId))
      .collect()
  },
})

/**
 * Gets a single product image.
 */
export const getProductImage = query({
  args: { imageId: v.id('productImages') },
  handler: async (ctx, { imageId }) => {
    const userId = await getAuthUserId(ctx)
    const image = await ctx.db.get(imageId)
    if (!image) return null

    // Verify ownership via product
    const product = await ctx.db.get(image.productId)
    if (!product) return null
    if (product.userId && product.userId !== userId) return null

    return image
  },
})

export const getProductImageInternal = internalQuery({
  args: { imageId: v.id('productImages') },
  handler: async (ctx, { imageId }) => ctx.db.get(imageId),
})

// ─── Product Image Mutations ───────────────────────────────────────────────

/**
 * Adds a new original image to a product.
 */
export const addProductImage = mutation({
  args: {
    productId: v.id('products'),
    imageUrl: v.string(),
    thumbnailUrl: v.optional(v.string()),
  },
  handler: async (ctx, { productId, imageUrl, thumbnailUrl }) => {
    const userId = await requireAuth(ctx)

    // Verify product ownership
    const product = await ctx.db.get(productId)
    if (!product) throw new Error('Product not found')
    if (product.userId && product.userId !== userId) {
      throw new Error('Not authorized')
    }
    if (product.archivedAt) {
      throw new Error('Cannot add images to archived product')
    }

    const imageId = await ctx.db.insert('productImages', {
      productId,
      userId,
      imageUrl,
      thumbnailUrl,
      type: 'original',
      status: 'ready',
    })

    // If this is the first image, set it as primary
    if (!product.primaryImageId) {
      await ctx.db.patch(productId, { primaryImageId: imageId })
    }

    return imageId
  },
})

/**
 * Sets the primary image for a product.
 */
export const setPrimaryImage = mutation({
  args: {
    productId: v.id('products'),
    imageId: v.id('productImages'),
  },
  handler: async (ctx, { productId, imageId }) => {
    const userId = await requireAuth(ctx)

    // Verify product ownership
    const product = await ctx.db.get(productId)
    if (!product) throw new Error('Product not found')
    if (product.userId && product.userId !== userId) {
      throw new Error('Not authorized')
    }

    // Verify image belongs to this product
    const image = await ctx.db.get(imageId)
    if (!image || image.productId !== productId) {
      throw new Error('Image not found for this product')
    }

    await ctx.db.patch(productId, { primaryImageId: imageId })

    return { ok: true }
  },
})

/**
 * Deletes a product image.
 * If it's an original, also deletes all its enhancements.
 * If it's the last image, requires confirmation and deletes the product.
 */
export const deleteProductImage = mutation({
  args: {
    imageId: v.id('productImages'),
    confirmDeleteProduct: v.optional(v.boolean()),
  },
  handler: async (ctx, { imageId, confirmDeleteProduct }) => {
    const userId = await requireAuth(ctx)

    const image = await ctx.db.get(imageId)
    if (!image) throw new Error('Image not found')

    // Verify ownership via product
    const product = await ctx.db.get(image.productId)
    if (!product) throw new Error('Product not found')
    if (product.userId && product.userId !== userId) {
      throw new Error('Not authorized')
    }

    // Get all images for this product
    const allImages = await ctx.db
      .query('productImages')
      .withIndex('by_product', (q) => q.eq('productId', image.productId))
      .collect()

    // If this is an original, get its enhancements
    const imagesToDelete: Id<'productImages'>[] = [imageId]
    if (image.type === 'original') {
      const enhancements = allImages.filter((img) => img.parentImageId === imageId)
      imagesToDelete.push(...enhancements.map((e) => e._id))
    }

    // Calculate remaining images BEFORE any mutations
    const remaining = allImages.filter((img) => !imagesToDelete.includes(img._id))

    // Handle based on whether images will remain
    if (remaining.length === 0) {
      if (!confirmDeleteProduct) {
        return {
          requiresConfirmation: true,
          message: 'This is the last image. Deleting it will delete the product.',
        }
      }
      // Soft-delete the product and clear primary in one patch
      await ctx.db.patch(image.productId, {
        archivedAt: Date.now(),
        primaryImageId: undefined,
      })
    } else {
      // Update primary image BEFORE deleting if needed
      // This prevents referencing deleted images
      if (product.primaryImageId && imagesToDelete.includes(product.primaryImageId)) {
        // Prefer an original image from remaining
        const newPrimary = remaining.find((img) => img.type === 'original') || remaining[0]
        await ctx.db.patch(image.productId, { primaryImageId: newPrimary._id })
      }
    }

    // Now delete the images (after primary has been updated)
    for (const id of imagesToDelete) {
      await ctx.db.delete(id)
    }

    return { ok: true, deletedCount: imagesToDelete.length }
  },
})

// ─── Enhancement Mutations ─────────────────────────────────────────────────

/**
 * Triggers background removal for a product image.
 */
export const removeImageBackground = mutation({
  args: { imageId: v.id('productImages') },
  handler: async (ctx, { imageId }) => {
    const userId = await requireAuth(ctx)

    const image = await ctx.db.get(imageId)
    if (!image) throw new Error('Image not found')

    // Verify ownership via product
    const product = await ctx.db.get(image.productId)
    if (!product) throw new Error('Product not found')
    if (product.userId && product.userId !== userId) {
      throw new Error('Not authorized')
    }

    // Billing: capability check (no credit consumption in v1 for bg-removal).
    await requireCapability(ctx, CAPABILITIES.REMOVE_BACKGROUND, 'removeImageBackground')

    // Check if bg-removed version already exists
    const existing = await ctx.db
      .query('productImages')
      .withIndex('by_parent', (q) => q.eq('parentImageId', imageId))
      .filter((q) => q.eq(q.field('type'), 'background-removed'))
      .first()

    if (existing) {
      if (existing.status === 'processing') {
        throw new Error('Background removal already in progress')
      }
      // If failed, we can retry - delete the failed one
      if (existing.status === 'failed') {
        await ctx.db.delete(existing._id)
      } else {
        throw new Error('Background-removed version already exists')
      }
    }

    // Create a placeholder image in processing state
    const newImageId = await ctx.db.insert('productImages', {
      productId: image.productId,
      userId,
      imageUrl: '', // Will be filled after processing
      type: 'background-removed',
      parentImageId: imageId,
      status: 'processing',
    })

    // Start the background removal action
    await ctx.scheduler.runAfter(0, internal.productImages.runImageBackgroundRemoval, {
      imageId: newImageId,
      sourceImageUrl: image.imageUrl,
    })

    return { ok: true, newImageId }
  },
})

/**
 * Internal action to run background removal.
 */
export const runImageBackgroundRemoval = internalAction({
  args: {
    imageId: v.id('productImages'),
    sourceImageUrl: v.string(),
  },
  handler: async (ctx, { imageId, sourceImageUrl }) => {
    const image = await ctx.runQuery(internal.productImages.getProductImageInternal, {
      imageId,
    })
    if (!image) return

    try {
      const result = await ctx.runAction(internal.ai.removeBackground, {
        productId: image.productId,
        imageUrl: sourceImageUrl,
      })

      await ctx.runMutation(internal.productImages.saveImageEnhancement, {
        imageId,
        imageUrl: result.outputUrl,
      })
    } catch (err) {
      await ctx.runMutation(internal.productImages.failImageEnhancement, {
        imageId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  },
})

export const saveImageEnhancement = internalMutation({
  args: {
    imageId: v.id('productImages'),
    imageUrl: v.string(),
  },
  handler: async (ctx, { imageId, imageUrl }) => {
    await ctx.db.patch(imageId, {
      imageUrl,
      status: 'ready',
    })
  },
})

export const failImageEnhancement = internalMutation({
  args: {
    imageId: v.id('productImages'),
    error: v.string(),
  },
  handler: async (ctx, { imageId, error }) => {
    await ctx.db.patch(imageId, {
      status: 'failed',
      error,
    })
  },
})
