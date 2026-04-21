import { internalMutation } from '../_generated/server'
import { v } from 'convex/values'

/**
 * Seed test data for e2e tests.
 * Creates a test product and templates for testing workflows.
 */
export const seedTestData = internalMutation({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, { userId }) => {
    // Create a test product
    const productId = await ctx.db.insert('products', {
      userId,
      name: 'E2E Test Product',
      imageUrl: 'https://placehold.co/800x800/2a2a2a/ffffff?text=Test+Product',
      status: 'ready',
      category: 'electronics',
      productDescription: 'A test product for e2e testing',
      targetAudience: 'testers, developers, QA engineers',
    })

    // Create test templates with different aspect ratios
    const templateConfigs = [
      { aspectRatio: '1:1' as const, width: 1024, height: 1024 },
      { aspectRatio: '4:5' as const, width: 1024, height: 1280 },
      { aspectRatio: '9:16' as const, width: 1024, height: 1820 },
    ]

    const templateIds = []
    for (const config of templateConfigs) {
      const templateId = await ctx.db.insert('adTemplates', {
        imageUrl: `https://placehold.co/${config.width}x${config.height}/1a1a1a/5474b4?text=Test+${config.aspectRatio}`,
        thumbnailUrl: `https://placehold.co/256x256/1a1a1a/5474b4?text=Test+${config.aspectRatio}`,
        aspectRatio: config.aspectRatio,
        width: config.width,
        height: config.height,
        status: 'published',
        productCategory: 'electronics',
        primaryColor: 'neutral',
        imageStyle: 'product-hero',
        setting: 'studio',
        composition: 'centered',
        textAmount: 'minimal-text',
        sceneDescription: 'A test template for e2e testing',
        moods: ['minimal'],
      })
      templateIds.push(templateId)
    }

    return {
      productId,
      templateIds,
      message: 'Test data seeded successfully',
    }
  },
})

/**
 * Get test user's product for verification
 */
export const getTestProduct = internalMutation({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, { userId }) => {
    const product = await ctx.db
      .query('products')
      .filter((q) => q.eq(q.field('userId'), userId))
      .filter((q) => q.eq(q.field('name'), 'E2E Test Product'))
      .first()

    return product
  },
})
