/// <reference types="vite/client" />
/**
 * Integration tests for persisted Home Ad Test recommendations (issue #39):
 *   - saveProductAnalysis persists recommendations from marketing angles
 *   - re-analysis refreshes pending rows but preserves consumed ones
 *   - getHomeAdTestSurface returns recs (priority order) + winners, owner-scoped
 *   - createRecommendedAdTest creates a draft + marks consumed
 *   - dismissRecommendation removes a rec from the Home surface
 */
import { convexTest, type TestConvex } from 'convex-test'
import { expect, test } from 'vitest'
import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'

const modules = import.meta.glob('./**/*.*s')

const USER = 'user|owner'
const OTHER = 'user|intruder'

const ANGLES = [
  { title: 'Benefit angle', description: 'Lead with the benefit', hook: 'Feel it', suggestedAdStyle: 'UGC' },
  { title: 'Social proof', description: 'Loved by thousands', hook: 'Join them', suggestedAdStyle: 'testimonial' },
]

async function seedProduct(
  t: TestConvex<typeof schema>,
  userId = USER,
): Promise<Id<'products'>> {
  return t.run((ctx) =>
    ctx.db.insert('products', { name: 'Hydration Mix', status: 'analyzing', userId }),
  )
}

async function analyze(
  t: TestConvex<typeof schema>,
  productId: Id<'products'>,
  angles = ANGLES,
): Promise<void> {
  await t.mutation(internal.products.saveProductAnalysis, {
    productId,
    category: 'beverage',
    productDescription: 'An electrolyte drink mix',
    targetAudience: 'athletes',
    valueProposition: 'Hydrate faster',
    marketingAngles: angles,
  })
}

async function recsFor(
  t: TestConvex<typeof schema>,
  productId: Id<'products'>,
) {
  return t.run((ctx) =>
    ctx.db
      .query('adTestRecommendations')
      .withIndex('by_productId', (q) => q.eq('productId', productId))
      .collect(),
  )
}

// ─── persistence ───────────────────────────────────────────────────────────────

test('saveProductAnalysis persists recommendations from marketing angles', async () => {
  const t = convexTest(schema, modules)
  const productId = await seedProduct(t)
  await analyze(t, productId)

  const recs = await recsFor(t, productId)
  // starter + 2 angles.
  expect(recs).toHaveLength(3)
  expect(recs.every((r) => r.userId === USER)).toBe(true)
  expect(recs.some((r) => r.concept.source === 'starter')).toBe(true)

  // Product flipped to ready.
  const product = await t.run((ctx) => ctx.db.get(productId))
  expect(product!.status).toBe('ready')
})

test('re-analysis replaces pending recommendations but keeps consumed ones', async () => {
  const t = convexTest(schema, modules)
  const productId = await seedProduct(t)
  await analyze(t, productId)

  // Consume one recommendation, then re-analyze.
  const before = await recsFor(t, productId)
  const consumed = before[0]
  await t.run((ctx) => ctx.db.patch(consumed._id, { consumedAt: Date.now() }))

  await analyze(t, productId)
  const after = await recsFor(t, productId)

  // The consumed row survives; the other pending rows were replaced (not piled up).
  expect(after.some((r) => r._id === consumed._id)).toBe(true)
  // 1 consumed (kept) + 3 fresh = 4 total, not 6.
  expect(after).toHaveLength(4)
})

// ─── getHomeAdTestSurface ────────────────────────────────────────────────────

test('getHomeAdTestSurface returns recs in priority order + owner scoped', async () => {
  const t = convexTest(schema, modules)
  const productId = await seedProduct(t)
  await analyze(t, productId)

  const surface = await t
    .withIdentity({ tokenIdentifier: USER })
    .query(api.adTests.getHomeAdTestSurface, {})

  expect(surface.focusProductId).toBe(productId)
  expect(surface.recommendations.length).toBe(3)
  // Priority ascending → starter (0) first.
  expect(surface.recommendations[0].source).toBe('starter')
  expect(
    surface.recommendations.map((r) => r.priority),
  ).toEqual([0, 1, 2])

  // A different user sees nothing (no product of their own).
  const otherSurface = await t
    .withIdentity({ tokenIdentifier: OTHER })
    .query(api.adTests.getHomeAdTestSurface, {})
  expect(otherSurface.focusProductId).toBeNull()
})

test('getHomeAdTestSurface surfaces recent winners with their test name', async () => {
  const t = convexTest(schema, modules)
  const productId = await seedProduct(t)
  await analyze(t, productId)

  const adTestId = await t.run(async (ctx) => {
    const now = Date.now()
    const id = await ctx.db.insert('adTests', {
      userId: USER,
      productId,
      name: 'Benefit Test',
      status: 'ready',
      source: 'recommendation',
      angles: [{ key: 'benefit', title: 'Benefit' }],
      placements: ['feed_square'],
      aspectRatios: ['1:1'],
      plannedImageCount: 1,
      completedImageCount: 1,
      failedImageCount: 0,
      winnerCount: 1,
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.insert('templateGenerations', {
      productId,
      userId: USER,
      productImageUrl: 'https://example.com/p.png',
      mode: 'angle',
      colorAdapt: false,
      variationIndex: 0,
      status: 'complete',
      outputUrl: 'https://cdn.example.com/w.png',
      isWinner: true,
      adTestId: id,
    })
    return id
  })

  const surface = await t
    .withIdentity({ tokenIdentifier: USER })
    .query(api.adTests.getHomeAdTestSurface, {})

  expect(surface.recentWinners).toHaveLength(1)
  expect(surface.recentWinners[0].adTestId).toBe(adTestId)
  expect(surface.recentWinners[0].adTestName).toBe('Benefit Test')
})

// ─── createRecommendedAdTest / dismiss ────────────────────────────────────────

test('createRecommendedAdTest creates a draft and marks the rec consumed', async () => {
  const t = convexTest(schema, modules)
  const productId = await seedProduct(t)
  await analyze(t, productId)

  const recs = await recsFor(t, productId)
  const starter = recs.find((r) => r.concept.source === 'starter')!

  const adTestId = await t
    .withIdentity({ tokenIdentifier: USER })
    .mutation(api.adTests.createRecommendedAdTest, {
      recommendationId: starter._id,
    })

  const adTest = await t.run((ctx) => ctx.db.get(adTestId))
  expect(adTest!.status).toBe('draft')
  expect(adTest!.source).toBe('starter')
  expect(adTest!.placements).toEqual(['feed_square', 'feed_vertical', 'story_reel'])

  const recAfter = await t.run((ctx) => ctx.db.get(starter._id))
  expect(recAfter!.consumedAt).toBeTypeOf('number')

  // Consumed rec no longer surfaces on Home.
  const surface = await t
    .withIdentity({ tokenIdentifier: USER })
    .query(api.adTests.getHomeAdTestSurface, {})
  expect(surface.recommendations.some((r) => r._id === starter._id)).toBe(false)
})

test('createRecommendedAdTest rejects a non-owner', async () => {
  const t = convexTest(schema, modules)
  const productId = await seedProduct(t)
  await analyze(t, productId)
  const starter = (await recsFor(t, productId)).find(
    (r) => r.concept.source === 'starter',
  )!

  await expect(
    t
      .withIdentity({ tokenIdentifier: OTHER })
      .mutation(api.adTests.createRecommendedAdTest, {
        recommendationId: starter._id,
      }),
  ).rejects.toThrow(/Recommendation not found/)
})

test('dismissRecommendation removes a rec from the Home surface', async () => {
  const t = convexTest(schema, modules)
  const productId = await seedProduct(t)
  await analyze(t, productId)
  const rec = (await recsFor(t, productId))[1]

  await t
    .withIdentity({ tokenIdentifier: USER })
    .mutation(api.adTests.dismissRecommendation, { recommendationId: rec._id })

  const surface = await t
    .withIdentity({ tokenIdentifier: USER })
    .query(api.adTests.getHomeAdTestSurface, {})
  expect(surface.recommendations.some((r) => r._id === rec._id)).toBe(false)
})
