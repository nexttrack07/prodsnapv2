import { internalMutation, mutation } from '../_generated/server'
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

    // Create test generations (completed) for variation testing
    const generationIds = []
    for (let i = 0; i < 2; i++) {
      const templateId = templateIds[i % templateIds.length]
      const generationId = await ctx.db.insert('templateGenerations', {
        productId,
        userId,
        templateId,
        productImageUrl: 'https://placehold.co/800x800/2a2a2a/ffffff?text=Test+Product',
        templateImageUrl: `https://placehold.co/1024x1024/1a1a1a/5474b4?text=Test+Template`,
        mode: 'exact',
        colorAdapt: false,
        variationIndex: 0,
        status: 'complete',
        outputUrl: `https://placehold.co/1024x1024/2a2a2a/5474b4?text=Generated+${i + 1}`,
        startedAt: Date.now() - 60000,
        finishedAt: Date.now() - 30000,
      })
      generationIds.push(generationId)
    }

    return {
      productId,
      templateIds,
      generationIds,
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

/**
 * Public mutation to seed test data for the authenticated user.
 * Only works in test mode (CONVEX_TEST_MODE=true).
 * Call this from e2e tests after authentication.
 */
export const seedForCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    // Only allow in test mode
    if (process.env.CONVEX_TEST_MODE !== 'true') {
      throw new Error('Seed mutation only available in test mode')
    }

    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error('Must be authenticated to seed test data')
    }

    const userId = identity.subject

    // Check if test data already exists
    const existingProduct = await ctx.db
      .query('products')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .filter((q) => q.eq(q.field('name'), 'E2E Test Product'))
      .first()

    if (existingProduct) {
      // Check if generations exist
      const existingGenerations = await ctx.db
        .query('templateGenerations')
        .withIndex('by_product', (q) => q.eq('productId', existingProduct._id))
        .collect()

      return {
        productId: existingProduct._id,
        generationCount: existingGenerations.length,
        message: 'Test data already exists',
        alreadySeeded: true,
      }
    }

    // Create test product
    const productId = await ctx.db.insert('products', {
      userId,
      name: 'E2E Test Product',
      imageUrl: 'https://placehold.co/800x800/2a2a2a/ffffff?text=Test+Product',
      status: 'ready',
      category: 'electronics',
      productDescription: 'A test product for e2e testing',
      targetAudience: 'testers, developers, QA engineers',
    })

    // Get existing templates to use for generations
    const templates = await ctx.db
      .query('adTemplates')
      .withIndex('by_status', (q) => q.eq('status', 'published'))
      .take(3)

    // Create test generations
    const generationIds = []
    for (let i = 0; i < Math.min(2, templates.length); i++) {
      const template = templates[i]
      const generationId = await ctx.db.insert('templateGenerations', {
        productId,
        userId,
        templateId: template._id,
        productImageUrl: 'https://placehold.co/800x800/2a2a2a/ffffff?text=Test+Product',
        templateImageUrl: template.imageUrl,
        mode: 'exact',
        colorAdapt: false,
        variationIndex: 0,
        status: 'complete',
        outputUrl: `https://placehold.co/1024x1024/2a2a2a/5474b4?text=Generated+${i + 1}`,
        startedAt: Date.now() - 60000,
        finishedAt: Date.now() - 30000,
      })
      generationIds.push(generationId)
    }

    return {
      productId,
      generationIds,
      message: 'Test data seeded successfully',
      alreadySeeded: false,
    }
  },
})
