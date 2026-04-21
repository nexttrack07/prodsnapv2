import { v } from 'convex/values'
import { internalMutation, internalQuery } from './_generated/server'

/**
 * Migration: Migrate existing products to use productImages table.
 *
 * This migration:
 * 1. For each product with an imageUrl, creates a productImage record
 * 2. If the product has a backgroundRemovedUrl, creates an enhancement record
 * 3. Sets the primaryImageId on the product
 *
 * Run this via the Convex dashboard or CLI:
 * npx convex run migrations:migrateProductImages
 */
export const migrateProductImages = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, { batchSize = 50, cursor }) => {
    // Get products that have imageUrl but no primaryImageId (not yet migrated)
    let query = ctx.db
      .query('products')
      .filter((q) =>
        q.and(
          q.neq(q.field('imageUrl'), undefined),
          q.eq(q.field('primaryImageId'), undefined)
        )
      )

    const products = await query.take(batchSize)

    if (products.length === 0) {
      return { done: true, migrated: 0 }
    }

    let migrated = 0

    for (const product of products) {
      if (!product.imageUrl || !product.userId) continue

      // Create the original image record
      const originalImageId = await ctx.db.insert('productImages', {
        productId: product._id,
        userId: product.userId,
        imageUrl: product.imageUrl,
        type: 'original',
        status: 'ready',
      })

      // If there's a background-removed version, create that too
      let bgRemovedImageId = null
      if (product.backgroundRemovedUrl && product.backgroundRemovalStatus === 'complete') {
        bgRemovedImageId = await ctx.db.insert('productImages', {
          productId: product._id,
          userId: product.userId,
          imageUrl: product.backgroundRemovedUrl,
          type: 'background-removed',
          parentImageId: originalImageId,
          status: 'ready',
        })
      }

      // Set the primary image (prefer original for now)
      await ctx.db.patch(product._id, {
        primaryImageId: originalImageId,
      })

      migrated++
    }

    // Return cursor for pagination (use last product's _id)
    const lastProduct = products[products.length - 1]
    return {
      done: false,
      migrated,
      nextCursor: lastProduct._id,
      message: `Migrated ${migrated} products. Run again with cursor to continue.`,
    }
  },
})

/**
 * Check migration status - how many products still need migration.
 */
export const checkMigrationStatus = internalQuery({
  args: {},
  handler: async (ctx) => {
    const allProducts = await ctx.db.query('products').collect()

    const needsMigration = allProducts.filter(
      (p) => p.imageUrl && !p.primaryImageId
    )
    const alreadyMigrated = allProducts.filter((p) => p.primaryImageId)
    const noImage = allProducts.filter((p) => !p.imageUrl && !p.primaryImageId)

    return {
      total: allProducts.length,
      needsMigration: needsMigration.length,
      alreadyMigrated: alreadyMigrated.length,
      noImage: noImage.length,
    }
  },
})

/**
 * Run full migration in batches until complete.
 * This is a convenience function that loops until done.
 */
export const runFullMigration = internalMutation({
  args: {},
  handler: async (ctx) => {
    let totalMigrated = 0
    let cursor: string | undefined

    // Run in batches of 50
    for (let i = 0; i < 100; i++) {
      // Safety limit of 5000 products
      const result = await ctx.db
        .query('products')
        .filter((q) =>
          q.and(
            q.neq(q.field('imageUrl'), undefined),
            q.eq(q.field('primaryImageId'), undefined)
          )
        )
        .take(50)

      if (result.length === 0) {
        break
      }

      for (const product of result) {
        if (!product.imageUrl || !product.userId) continue

        // Create the original image record
        const originalImageId = await ctx.db.insert('productImages', {
          productId: product._id,
          userId: product.userId,
          imageUrl: product.imageUrl,
          type: 'original',
          status: 'ready',
        })

        // If there's a background-removed version, create that too
        if (product.backgroundRemovedUrl && product.backgroundRemovalStatus === 'complete') {
          await ctx.db.insert('productImages', {
            productId: product._id,
            userId: product.userId,
            imageUrl: product.backgroundRemovedUrl,
            type: 'background-removed',
            parentImageId: originalImageId,
            status: 'ready',
          })
        }

        // Set the primary image
        await ctx.db.patch(product._id, {
          primaryImageId: originalImageId,
        })

        totalMigrated++
      }
    }

    return {
      done: true,
      totalMigrated,
      message: `Migration complete. Migrated ${totalMigrated} products.`,
    }
  },
})
