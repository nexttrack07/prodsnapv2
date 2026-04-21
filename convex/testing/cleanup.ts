import { internalMutation } from '../_generated/server'
import { v } from 'convex/values'

/**
 * Clean up test data after e2e tests.
 * Deletes all data created by a specific test user.
 */
export const cleanupTestData = internalMutation({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, { userId }) => {
    let deletedProducts = 0
    let deletedGenerations = 0

    // Get all test user's products
    const products = await ctx.db
      .query('products')
      .filter((q) => q.eq(q.field('userId'), userId))
      .collect()

    // Delete all generations for these products
    for (const product of products) {
      const generations = await ctx.db
        .query('templateGenerations')
        .filter((q) => q.eq(q.field('productId'), product._id))
        .collect()

      for (const gen of generations) {
        await ctx.db.delete(gen._id)
        deletedGenerations++
      }

      await ctx.db.delete(product._id)
      deletedProducts++
    }

    // Delete test templates (ones with test placeholder URLs)
    const templates = await ctx.db
      .query('adTemplates')
      .collect()

    let deletedTemplates = 0
    for (const template of templates) {
      if (template.imageUrl?.includes('placehold.co') && template.imageUrl?.includes('Test')) {
        await ctx.db.delete(template._id)
        deletedTemplates++
      }
    }

    return {
      deletedProducts,
      deletedGenerations,
      deletedTemplates,
      message: 'Test data cleaned up successfully',
    }
  },
})

/**
 * Clean up a specific product and its generations
 */
export const cleanupProduct = internalMutation({
  args: {
    productId: v.id('products'),
  },
  handler: async (ctx, { productId }) => {
    // Delete all generations for this product
    const generations = await ctx.db
      .query('templateGenerations')
      .filter((q) => q.eq(q.field('productId'), productId))
      .collect()

    for (const gen of generations) {
      await ctx.db.delete(gen._id)
    }

    // Delete the product
    await ctx.db.delete(productId)

    return {
      deletedGenerations: generations.length,
      message: 'Product and generations deleted',
    }
  },
})
