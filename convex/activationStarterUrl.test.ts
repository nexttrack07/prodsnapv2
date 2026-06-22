/// <reference types="vite/client" />
/**
 * Tests for the URL-first starter on-ramp (landing hero → free test on YOUR product):
 *   - createStarterProductFromImport: creates a product from a finished import,
 *     bypassing the free-plan product limit, with one-time/fresh-user guards
 *   - activateStarterForProduct: grant + starter draft + generation on an owned,
 *     analyzed product; idempotent
 */
import { convexTest, type TestConvex } from 'convex-test'
import { expect, test } from 'vitest'
import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'

const modules = import.meta.glob('./**/*.*s')

const USER = 'user|owner'
const OTHER = 'user|intruder'

async function seedDoneImport(
  t: TestConvex<typeof schema>,
  fields: { userId?: string; images?: string[]; status?: 'done' | 'scraping' } = {},
): Promise<Id<'urlImports'>> {
  return t.run((ctx) =>
    ctx.db.insert('urlImports', {
      userId: fields.userId ?? USER,
      sourceUrl: 'https://example.com/product',
      status: fields.status ?? 'done',
      mode: 'product-and-brand',
      createdAt: Date.now(),
      distilledName: 'Hydration Mix',
      distilledDescription: 'An electrolyte drink mix',
      distilledCategory: 'beverage',
      distilledReviewSnippets: ['tastes great'],
      uploadedImageUrls:
        fields.images ?? ['https://cdn.example.com/p1.png', 'https://cdn.example.com/p2.png'],
    }),
  )
}

// ─── createStarterProductFromImport ──────────────────────────────────────────

test('creates a product from a finished import, bypassing the free product limit', async () => {
  const t = convexTest(schema, modules)
  // Free plan → product limit 0; the starter path must still create one.
  await t.run((ctx) =>
    ctx.db.insert('userPlans', { userId: USER, plan: 'free_user', syncedAt: Date.now() }),
  )
  const importId = await seedDoneImport(t)

  const productId = await t
    .withIdentity({ tokenIdentifier: USER })
    .mutation(api.activation.createStarterProductFromImport, { importId })

  const product = await t.run((ctx) => ctx.db.get(productId))
  expect(product!.name).toBe('Hydration Mix')
  expect(product!.status).toBe('analyzing')
  expect(product!.userId).toBe(USER)
  expect(product!.primaryImageId).toBeDefined()
  expect(product!.customerLanguage).toEqual(['tastes great'])

  const images = await t.run((ctx) =>
    ctx.db
      .query('productImages')
      .withIndex('by_product', (q) => q.eq('productId', productId))
      .collect(),
  )
  expect(images).toHaveLength(2)
})

test('rejects an unfinished import or one with no images', async () => {
  const t = convexTest(schema, modules)
  const asUser = t.withIdentity({ tokenIdentifier: USER })

  const scraping = await seedDoneImport(t, { status: 'scraping' })
  await expect(
    asUser.mutation(api.activation.createStarterProductFromImport, { importId: scraping }),
  ).rejects.toThrow(/not finished/)

  const noImages = await seedDoneImport(t, { images: [] })
  await expect(
    asUser.mutation(api.activation.createStarterProductFromImport, { importId: noImages }),
  ).rejects.toThrow(/couldn't find a product image/)
})

test('rejects a non-owner, an existing-product user, and an already-granted user', async () => {
  const t = convexTest(schema, modules)
  const importId = await seedDoneImport(t)

  // Non-owner.
  await expect(
    t
      .withIdentity({ tokenIdentifier: OTHER })
      .mutation(api.activation.createStarterProductFromImport, { importId }),
  ).rejects.toThrow(/Import not found/)

  // Already has a product.
  await t.run((ctx) =>
    ctx.db.insert('products', { name: 'Existing', status: 'ready', userId: USER }),
  )
  await expect(
    t
      .withIdentity({ tokenIdentifier: USER })
      .mutation(api.activation.createStarterProductFromImport, { importId }),
  ).rejects.toThrow(/already have a product/)
})

test('rejects a user who already received the starter grant', async () => {
  const t = convexTest(schema, modules)
  const importId = await seedDoneImport(t)
  await t.run((ctx) =>
    ctx.db.insert('onboardingProfiles', {
      userId: USER,
      currentStep: 1,
      hasReceivedStarterGrant: true,
      updatedAt: Date.now(),
    }),
  )
  await expect(
    t
      .withIdentity({ tokenIdentifier: USER })
      .mutation(api.activation.createStarterProductFromImport, { importId }),
  ).rejects.toThrow(/already activated/)
})

// ─── activateStarterForProduct ───────────────────────────────────────────────

async function seedReadyProduct(t: TestConvex<typeof schema>): Promise<Id<'products'>> {
  return t.run(async (ctx) => {
    const productId = await ctx.db.insert('products', {
      name: 'Hydration Mix',
      status: 'ready',
      userId: USER,
      marketingAngles: [
        {
          title: 'Core benefit',
          description: 'Lead with the benefit',
          hook: 'Feel the difference',
          suggestedAdStyle: 'UGC',
        },
      ],
    })
    const imageId = await ctx.db.insert('productImages', {
      productId,
      userId: USER,
      imageUrl: 'https://cdn.example.com/p.png',
      type: 'original',
      status: 'ready',
    })
    await ctx.db.patch(productId, { primaryImageId: imageId })
    return productId
  })
}

test('activateStarterForProduct grants credits and creates the starter test', async () => {
  const t = convexTest(schema, modules)
  const productId = await seedReadyProduct(t)

  const { adTestId } = await t
    .withIdentity({ tokenIdentifier: USER, email: 'real@example.com' })
    .action(api.activation.activateStarterForProduct, { productId })

  const adTest = await t.run((ctx) => ctx.db.get(adTestId as Id<'adTests'>))
  expect(adTest!.source).toBe('starter')
  expect(adTest!.productId).toBe(productId)
  expect(adTest!.placements).toEqual(['feed_square', 'feed_vertical', 'story_reel'])

  // Grant claimed.
  const balance = await t.run((ctx) =>
    ctx.db
      .query('creditBalances')
      .withIndex('by_userId', (q) => q.eq('userId', USER))
      .unique(),
  )
  expect(balance).not.toBeNull()
  // 100 free credits = 100,000 mc — must cover the 3-image starter test
  // (30,000 mc at 10,000 mc/image) with room to spare. Guards the regression
  // where the grant was 10x too small to afford a single image.
  expect(balance!.planAllowanceMc).toBe(100_000)
  const profile = await t.run((ctx) =>
    ctx.db
      .query('onboardingProfiles')
      .withIndex('by_userId', (q) => q.eq('userId', USER))
      .unique(),
  )
  expect(profile!.hasReceivedStarterGrant).toBe(true)
})

test('activateStarterForProduct rejects an already-activated account', async () => {
  const t = convexTest(schema, modules)
  const productId = await seedReadyProduct(t)
  // Pre-existing balance → already activated.
  await t.run((ctx) =>
    ctx.db.insert('creditBalances', {
      userId: USER,
      planAllowanceMc: 3000,
      planUsedMc: 0,
      topupBalanceMc: 0,
      periodStart: Date.now(),
      periodEnd: Date.now() + 1000,
      version: 1,
      updatedAt: Date.now(),
    }),
  )

  await expect(
    t
      .withIdentity({ tokenIdentifier: USER, email: 'real@example.com' })
      .action(api.activation.activateStarterForProduct, { productId }),
  ).rejects.toThrow(/already activated/)
})
