/// <reference types="vite/client" />
/**
 * Tests for the foundational Ad Test backend (issue #32):
 *   - createDraft: ownership, validation, derived aspect ratios, zeroed counters
 *   - listForProduct: ownership scoping, archived filtering, newest-first
 *   - getById: ownership, child ordering by adUnitIndex
 *   - markExported / archive: timestamp-derived lifecycle, status untouched
 *   - savePerformanceNote: ownership + generation-belongs-to-test check
 *   - updateCountersForGeneration / setStatusFromChildren: counter + status math
 */
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'

const modules = import.meta.glob('./**/*.*s')

const USER = 'user|owner'
const OTHER = 'user|intruder'

async function seedProduct(
  t: ReturnType<typeof convexTest>,
  userId = USER,
): Promise<Id<'products'>> {
  return t.run(async (ctx) =>
    ctx.db.insert('products', {
      name: 'Hydration Mix',
      status: 'ready',
      userId,
    }),
  )
}

async function seedGeneration(
  t: ReturnType<typeof convexTest>,
  fields: {
    adTestId?: Id<'adTests'>
    userId?: string
    status?: 'queued' | 'running' | 'uploading' | 'complete' | 'failed'
    adUnitIndex?: number
    isWinner?: boolean
    angleKey?: string
    placement?: 'feed_square' | 'feed_vertical' | 'story_reel' | 'landscape'
    outputUrl?: string
  },
): Promise<Id<'templateGenerations'>> {
  return t.run(async (ctx) =>
    ctx.db.insert('templateGenerations', {
      productImageUrl: 'https://example.com/p.png',
      mode: 'angle',
      colorAdapt: false,
      variationIndex: 0,
      status: fields.status ?? 'complete',
      userId: fields.userId ?? USER,
      adTestId: fields.adTestId,
      adUnitIndex: fields.adUnitIndex,
      isWinner: fields.isWinner,
      angleKey: fields.angleKey,
      placement: fields.placement,
      outputUrl: fields.outputUrl,
    }),
  )
}

type Placement = 'feed_square' | 'feed_vertical' | 'story_reel' | 'landscape'

const baseDraftArgs = (productId: Id<'products'>) => ({
  productId,
  name: 'Benefit Angles',
  source: 'custom' as const,
  angles: [{ key: 'benefit', title: 'Benefit' }],
  placements: ['feed_square', 'feed_vertical', 'story_reel'] as Placement[],
})

// ─── createDraft ──────────────────────────────────────────────────────────────

test('createDraft inserts a draft with derived aspect ratios and zero counters', async () => {
  const t = convexTest(schema, modules)
  const productId = await seedProduct(t)

  const asUser = t.withIdentity({ tokenIdentifier: USER })
  const adTestId = await asUser.mutation(
    api.adTests.createDraft,
    baseDraftArgs(productId),
  )

  const row = await t.run((ctx) => ctx.db.get(adTestId))
  expect(row).not.toBeNull()
  expect(row!.userId).toBe(USER)
  expect(row!.status).toBe('draft')
  expect(row!.source).toBe('custom')
  // 1:1, 4:5, 9:16 — distinct, order-preserving.
  expect(row!.aspectRatios).toEqual(['1:1', '4:5', '9:16'])
  expect(row!.plannedImageCount).toBe(0)
  expect(row!.completedImageCount).toBe(0)
  expect(row!.failedImageCount).toBe(0)
  expect(row!.winnerCount).toBe(0)
})

test('createDraft rejects a product owned by another user', async () => {
  const t = convexTest(schema, modules)
  const productId = await seedProduct(t, OTHER)
  const asUser = t.withIdentity({ tokenIdentifier: USER })
  await expect(
    asUser.mutation(api.adTests.createDraft, baseDraftArgs(productId)),
  ).rejects.toThrow(/Product not found/)
})

test('createDraft requires auth, a name, placements, and an angle or prompt', async () => {
  const t = convexTest(schema, modules)
  const productId = await seedProduct(t)
  const asUser = t.withIdentity({ tokenIdentifier: USER })

  await expect(
    t.mutation(api.adTests.createDraft, baseDraftArgs(productId)),
  ).rejects.toThrow(/Not authenticated/)

  await expect(
    asUser.mutation(api.adTests.createDraft, {
      ...baseDraftArgs(productId),
      name: '   ',
    }),
  ).rejects.toThrow(/name is required/)

  await expect(
    asUser.mutation(api.adTests.createDraft, {
      ...baseDraftArgs(productId),
      placements: [],
    }),
  ).rejects.toThrow(/placement/)

  await expect(
    asUser.mutation(api.adTests.createDraft, {
      ...baseDraftArgs(productId),
      angles: [],
    }),
  ).rejects.toThrow(/angle or prompt/)
})

// ─── listForProduct ────────────────────────────────────────────────────────────

test('listForProduct returns owned tests newest-first and filters archived', async () => {
  const t = convexTest(schema, modules)
  const productId = await seedProduct(t)
  const asUser = t.withIdentity({ tokenIdentifier: USER })

  const first = await asUser.mutation(api.adTests.createDraft, {
    ...baseDraftArgs(productId),
    name: 'First',
  })
  const second = await asUser.mutation(api.adTests.createDraft, {
    ...baseDraftArgs(productId),
    name: 'Second',
  })
  await asUser.mutation(api.adTests.archive, { adTestId: first })

  const active = await asUser.query(api.adTests.listForProduct, { productId })
  expect(active.map((r) => r._id)).toEqual([second])

  const all = await asUser.query(api.adTests.listForProduct, {
    productId,
    includeArchived: true,
  })
  // Newest-first: Second created after First.
  expect(all.map((r) => r._id)).toEqual([second, first])
})

test('listForProduct returns [] for a product owned by someone else', async () => {
  const t = convexTest(schema, modules)
  const productId = await seedProduct(t, OTHER)
  const asUser = t.withIdentity({ tokenIdentifier: USER })
  const rows = await asUser.query(api.adTests.listForProduct, { productId })
  expect(rows).toEqual([])
})

// ─── listMyAdTests (cross-product index for the sidebar page) ────────────────

test('listMyAdTests returns owned tests across products, newest-first, with product names, excluding archived', async () => {
  const t = convexTest(schema, modules)
  const asUser = t.withIdentity({ tokenIdentifier: USER })

  const productA = await t.run((ctx) =>
    ctx.db.insert('products', { name: 'Hydration Mix', status: 'ready', userId: USER }),
  )
  const productB = await t.run((ctx) =>
    ctx.db.insert('products', { name: 'Trail Tee', status: 'ready', userId: USER }),
  )

  const first = await asUser.mutation(api.adTests.createDraft, {
    ...baseDraftArgs(productA),
    name: 'A-first',
  })
  await asUser.mutation(api.adTests.createDraft, { ...baseDraftArgs(productB), name: 'B-second' })
  const third = await asUser.mutation(api.adTests.createDraft, {
    ...baseDraftArgs(productA),
    name: 'A-third',
  })
  // Archived tests drop out; another user's test is never visible.
  await asUser.mutation(api.adTests.archive, { adTestId: first })
  const otherProduct = await seedProduct(t, OTHER)
  await t
    .withIdentity({ tokenIdentifier: OTHER })
    .mutation(api.adTests.createDraft, { ...baseDraftArgs(otherProduct), name: 'intruder' })

  const rows = await asUser.query(api.adTests.listMyAdTests, {})

  // Newest-first across products, archived 'A-first' excluded.
  expect(rows.map((r) => r.name)).toEqual(['A-third', 'B-second'])
  expect(rows.find((r) => r._id === third)?.productName).toBe('Hydration Mix')
  expect(rows.find((r) => r.name === 'B-second')?.productName).toBe('Trail Tee')
  expect(rows.every((r) => r.name !== 'intruder')).toBe(true)
})

test('listMyAdTests returns [] when unauthenticated', async () => {
  const t = convexTest(schema, modules)
  const rows = await t.query(api.adTests.listMyAdTests, {})
  expect(rows).toEqual([])
})

// ─── getById ────────────────────────────────────────────────────────────────

test('getById returns the test with child generations ordered by adUnitIndex', async () => {
  const t = convexTest(schema, modules)
  const productId = await seedProduct(t)
  const asUser = t.withIdentity({ tokenIdentifier: USER })
  const adTestId = await asUser.mutation(
    api.adTests.createDraft,
    baseDraftArgs(productId),
  )

  await seedGeneration(t, { adTestId, adUnitIndex: 2 })
  await seedGeneration(t, { adTestId, adUnitIndex: 0 })
  await seedGeneration(t, { adTestId, adUnitIndex: 1 })

  const result = await asUser.query(api.adTests.getById, { adTestId })
  expect(result).not.toBeNull()
  expect(result!.adTest._id).toBe(adTestId)
  expect(result!.generations.map((g) => g.adUnitIndex)).toEqual([0, 1, 2])
})

test('getById returns null for a non-owner', async () => {
  const t = convexTest(schema, modules)
  const productId = await seedProduct(t)
  const adTestId = await t
    .withIdentity({ tokenIdentifier: USER })
    .mutation(api.adTests.createDraft, baseDraftArgs(productId))

  const result = await t
    .withIdentity({ tokenIdentifier: OTHER })
    .query(api.adTests.getById, { adTestId })
  expect(result).toBeNull()
})

// ─── markExported / archive ────────────────────────────────────────────────────

test('markExported stamps exportedAt without changing status and is idempotent', async () => {
  const t = convexTest(schema, modules)
  const productId = await seedProduct(t)
  const asUser = t.withIdentity({ tokenIdentifier: USER })
  const adTestId = await asUser.mutation(
    api.adTests.createDraft,
    baseDraftArgs(productId),
  )

  await asUser.mutation(api.adTests.markExported, { adTestId })
  const afterFirst = await t.run((ctx) => ctx.db.get(adTestId))
  expect(afterFirst!.exportedAt).toBeTypeOf('number')
  expect(afterFirst!.status).toBe('draft')

  await asUser.mutation(api.adTests.markExported, { adTestId })
  const afterSecond = await t.run((ctx) => ctx.db.get(adTestId))
  expect(afterSecond!.exportedAt).toBe(afterFirst!.exportedAt)
})

test('markExported rejects a non-owner', async () => {
  const t = convexTest(schema, modules)
  const productId = await seedProduct(t)
  const adTestId = await t
    .withIdentity({ tokenIdentifier: USER })
    .mutation(api.adTests.createDraft, baseDraftArgs(productId))
  await expect(
    t
      .withIdentity({ tokenIdentifier: OTHER })
      .mutation(api.adTests.markExported, { adTestId }),
  ).rejects.toThrow(/Ad Test not found/)
})

// ─── savePerformanceNote ───────────────────────────────────────────────────────

test('savePerformanceNote inserts a note for an owned test', async () => {
  const t = convexTest(schema, modules)
  const productId = await seedProduct(t)
  const asUser = t.withIdentity({ tokenIdentifier: USER })
  const adTestId = await asUser.mutation(
    api.adTests.createDraft,
    baseDraftArgs(productId),
  )

  const noteId = await asUser.mutation(api.adTests.savePerformanceNote, {
    adTestId,
    platform: 'meta',
    metricName: 'ROAS',
    metricValue: '2.4',
    note: 'Winner from week 1',
  })
  const note = await t.run((ctx) => ctx.db.get(noteId))
  expect(note!.adTestId).toBe(adTestId)
  expect(note!.userId).toBe(USER)
  expect(note!.metricName).toBe('ROAS')
})

test('savePerformanceNote rejects a generation from a different test', async () => {
  const t = convexTest(schema, modules)
  const productId = await seedProduct(t)
  const asUser = t.withIdentity({ tokenIdentifier: USER })
  const adTestId = await asUser.mutation(
    api.adTests.createDraft,
    baseDraftArgs(productId),
  )
  // Generation NOT linked to this test.
  const strayGen = await seedGeneration(t, {})

  await expect(
    asUser.mutation(api.adTests.savePerformanceNote, {
      adTestId,
      generationId: strayGen,
    }),
  ).rejects.toThrow(/does not belong/)
})

// ─── createDraft: source generation ownership ─────────────────────────────────

test('createDraft rejects a legacy sourceGenerationId whose product is owned by another user', async () => {
  const t = convexTest(schema, modules)
  const ownProductId = await seedProduct(t)
  const otherProductId = await seedProduct(t, OTHER)

  // Legacy generation (no userId) belonging to another user's product.
  const legacyGen = await t.run((ctx) =>
    ctx.db.insert('templateGenerations', {
      productImageUrl: 'https://example.com/p.png',
      mode: 'angle',
      colorAdapt: false,
      variationIndex: 0,
      status: 'complete',
      productId: otherProductId,
      // No userId — simulates a pre-auth legacy row.
    }),
  )

  await expect(
    t.withIdentity({ tokenIdentifier: USER }).mutation(api.adTests.createDraft, {
      ...baseDraftArgs(ownProductId),
      sourceGenerationId: legacyGen,
    }),
  ).rejects.toThrow(/Source generation not found/)
})

// ─── getExportManifest ─────────────────────────────────────────────────────────

test('getExportManifest includes only complete rows and derives the file extension', async () => {
  const t = convexTest(schema, modules)
  const productId = await seedProduct(t)
  const asUser = t.withIdentity({ tokenIdentifier: USER })
  const adTestId = await asUser.mutation(
    api.adTests.createDraft,
    baseDraftArgs(productId),
  )

  await seedGeneration(t, {
    adTestId,
    status: 'complete',
    adUnitIndex: 0,
    angleKey: 'benefit',
    placement: 'feed_vertical',
    outputUrl: 'https://cdn.example.com/out/abc.webp?sig=xyz',
  })
  // Excluded: not complete.
  await seedGeneration(t, { adTestId, status: 'failed', adUnitIndex: 1 })
  // Excluded: complete but no outputUrl.
  await seedGeneration(t, { adTestId, status: 'complete', adUnitIndex: 2 })

  const manifest = await asUser.query(api.adTests.getExportManifest, {
    adTestId,
  })
  expect(manifest.testName).toBe('Benefit Angles')
  expect(manifest.productName).toBe('Hydration Mix')
  expect(manifest.items).toHaveLength(1)
  expect(manifest.items[0].placement).toBe('feed_vertical')
  expect(manifest.items[0].filename).toBe(
    'hydration-mix_benefit-angles_benefit_feed-vertical_01.webp',
  )
})

test('getExportManifest rejects a non-owner', async () => {
  const t = convexTest(schema, modules)
  const productId = await seedProduct(t)
  const adTestId = await t
    .withIdentity({ tokenIdentifier: USER })
    .mutation(api.adTests.createDraft, baseDraftArgs(productId))
  await expect(
    t
      .withIdentity({ tokenIdentifier: OTHER })
      .query(api.adTests.getExportManifest, { adTestId }),
  ).rejects.toThrow(/Ad Test not found/)
})

// ─── counters + status derivation ──────────────────────────────────────────────

test('updateCountersForGeneration recomputes completed/failed/winner counts', async () => {
  const t = convexTest(schema, modules)
  const productId = await seedProduct(t)
  const adTestId = await t
    .withIdentity({ tokenIdentifier: USER })
    .mutation(api.adTests.createDraft, baseDraftArgs(productId))

  await seedGeneration(t, { adTestId, status: 'complete', isWinner: true })
  await seedGeneration(t, { adTestId, status: 'complete' })
  await seedGeneration(t, { adTestId, status: 'failed' })

  await t.mutation(internal.adTests.updateCountersForGeneration, { adTestId })
  const row = await t.run((ctx) => ctx.db.get(adTestId))
  expect(row!.completedImageCount).toBe(2)
  expect(row!.failedImageCount).toBe(1)
  expect(row!.winnerCount).toBe(1)
})

test('setStatusFromChildren derives status from child rows', async () => {
  const t = convexTest(schema, modules)
  const productId = await seedProduct(t)
  const asUser = t.withIdentity({ tokenIdentifier: USER })

  // generating: any in-flight row.
  const generating = await asUser.mutation(
    api.adTests.createDraft,
    baseDraftArgs(productId),
  )
  await seedGeneration(t, { adTestId: generating, status: 'running' })
  await seedGeneration(t, { adTestId: generating, status: 'complete' })
  await t.mutation(internal.adTests.setStatusFromChildren, {
    adTestId: generating,
  })
  expect((await t.run((ctx) => ctx.db.get(generating)))!.status).toBe(
    'generating',
  )

  // ready: all complete.
  const ready = await asUser.mutation(
    api.adTests.createDraft,
    baseDraftArgs(productId),
  )
  await seedGeneration(t, { adTestId: ready, status: 'complete' })
  await t.mutation(internal.adTests.setStatusFromChildren, { adTestId: ready })
  expect((await t.run((ctx) => ctx.db.get(ready)))!.status).toBe('ready')

  // partially_failed: mix of complete + failed, all terminal.
  const partial = await asUser.mutation(
    api.adTests.createDraft,
    baseDraftArgs(productId),
  )
  await seedGeneration(t, { adTestId: partial, status: 'complete' })
  await seedGeneration(t, { adTestId: partial, status: 'failed' })
  await t.mutation(internal.adTests.setStatusFromChildren, { adTestId: partial })
  expect((await t.run((ctx) => ctx.db.get(partial)))!.status).toBe(
    'partially_failed',
  )

  // failed: all failed.
  const failed = await asUser.mutation(
    api.adTests.createDraft,
    baseDraftArgs(productId),
  )
  await seedGeneration(t, { adTestId: failed, status: 'failed' })
  await t.mutation(internal.adTests.setStatusFromChildren, { adTestId: failed })
  expect((await t.run((ctx) => ctx.db.get(failed)))!.status).toBe('failed')
})

// ─── startGeneration ────────────────────────────────────────────────────────

/** Seed creditPricing + creditBalances so requireCredits passes in tests. */
async function seedBillingData(
  t: ReturnType<typeof convexTest>,
  userId = USER,
): Promise<void> {
  const now = Date.now()
  await t.run(async (ctx) => {
    await ctx.db.insert('creditPricing', {
      modelKey: 'nano-banana-2',
      creditsMc: 1000,
      active: true,
      updatedAt: now,
    })
    await ctx.db.insert('creditBalances', {
      userId,
      planAllowanceMc: 1_000_000,
      planUsedMc: 0,
      topupBalanceMc: 0,
      periodStart: now - 86_400_000,
      periodEnd: now + 86_400_000 * 30,
      version: 1,
      updatedAt: now,
    })
  })
}

/** Seed a product with a primary productImage and return their IDs. */
async function seedProductWithImage(
  t: ReturnType<typeof convexTest>,
  userId = USER,
): Promise<{ productId: Id<'products'>; imageId: Id<'productImages'> }> {
  return t.run(async (ctx) => {
    const productId = await ctx.db.insert('products', {
      name: 'Hydration Mix',
      status: 'ready',
      userId,
    })
    const imageId = await ctx.db.insert('productImages', {
      productId,
      userId,
      imageUrl: 'https://example.com/p.png',
      type: 'original',
      status: 'ready',
    })
    await ctx.db.patch(productId, { primaryImageId: imageId })
    return { productId, imageId }
  })
}

test('startGeneration fans out angle×placement rows with correct context', async () => {
  const t = convexTest(schema, modules)
  await seedBillingData(t)
  const { productId } = await seedProductWithImage(t)
  const asUser = t.withIdentity({ tokenIdentifier: USER })

  const adTestId = await asUser.mutation(api.adTests.createDraft, {
    productId,
    name: 'Benefit Test',
    source: 'custom',
    angles: [
      { key: 'benefit', title: 'Core Benefit', description: 'Main value prop', hook: 'Feel the diff' },
      { key: 'social', title: 'Social Proof', hook: 'Loved by thousands' },
    ],
    placements: ['feed_square', 'story_reel'] as Placement[],
  })

  const result = await asUser.mutation(api.adTests.startGeneration, { adTestId })
  expect(result).toEqual({ ok: true, plannedImageCount: 4 })

  // adTest should be generating with plannedImageCount stamped.
  const adTest = await t.run((ctx) => ctx.db.get(adTestId))
  expect(adTest!.status).toBe('generating')
  expect(adTest!.plannedImageCount).toBe(4)

  // Four templateGeneration rows linked to the test.
  const gens = await t.run((ctx) =>
    ctx.db
      .query('templateGenerations')
      .withIndex('by_adTestId', (q) => q.eq('adTestId', adTestId))
      .collect(),
  )
  expect(gens).toHaveLength(4)

  const sorted = [...gens].sort((a, b) => (a.adUnitIndex ?? 0) - (b.adUnitIndex ?? 0))

  // Row 0: benefit × feed_square
  expect(sorted[0].adUnitIndex).toBe(0)
  expect(sorted[0].angleKey).toBe('benefit')
  expect(sorted[0].placement).toBe('feed_square')
  expect(sorted[0].aspectRatio).toBe('1:1')
  expect(sorted[0].mode).toBe('angle')
  expect(sorted[0].angleSeed?.title).toBe('Core Benefit')
  expect(sorted[0].adTestId).toBe(adTestId)
  expect(sorted[0].userId).toBe(USER)
  expect(sorted[0].model).toBe('nano-banana-2')

  // Row 1: benefit × story_reel
  expect(sorted[1].adUnitIndex).toBe(1)
  expect(sorted[1].angleKey).toBe('benefit')
  expect(sorted[1].placement).toBe('story_reel')
  expect(sorted[1].aspectRatio).toBe('9:16')

  // Row 2: social × feed_square
  expect(sorted[2].adUnitIndex).toBe(2)
  expect(sorted[2].angleKey).toBe('social')
  expect(sorted[2].placement).toBe('feed_square')
  expect(sorted[2].angleSeed?.title).toBe('Social Proof')

  // Row 3: social × story_reel
  expect(sorted[3].adUnitIndex).toBe(3)
  expect(sorted[3].angleKey).toBe('social')
  expect(sorted[3].placement).toBe('story_reel')
})

test('startGeneration fans out prompt×placement rows with correct context', async () => {
  const t = convexTest(schema, modules)
  await seedBillingData(t)
  const { productId } = await seedProductWithImage(t)
  const asUser = t.withIdentity({ tokenIdentifier: USER })

  const adTestId = await asUser.mutation(api.adTests.createDraft, {
    productId,
    name: 'Prompt Test',
    source: 'custom',
    angles: [{ key: 'a', title: 'A' }],
    prompts: ['Try this skincare routine tonight'],
    placements: ['feed_square'] as Placement[],
  })

  await asUser.mutation(api.adTests.startGeneration, { adTestId })

  const gens = await t.run((ctx) =>
    ctx.db
      .query('templateGenerations')
      .withIndex('by_adTestId', (q) => q.eq('adTestId', adTestId))
      .collect(),
  )
  // 1 angle × 1 placement + 1 prompt × 1 placement = 2 rows.
  expect(gens).toHaveLength(2)

  const promptRow = gens.find((g) => g.mode === 'prompt')
  expect(promptRow).toBeDefined()
  expect(promptRow!.dynamicPrompt).toBe('Try this skincare routine tonight')
  expect(promptRow!.placement).toBe('feed_square')
  expect(promptRow!.adTestId).toBe(adTestId)
  expect(promptRow!.angleKey).toBeUndefined()
})

test('startGeneration rejects non-draft ad tests', async () => {
  const t = convexTest(schema, modules)
  await seedBillingData(t)
  const { productId } = await seedProductWithImage(t)
  const asUser = t.withIdentity({ tokenIdentifier: USER })

  const adTestId = await asUser.mutation(api.adTests.createDraft, {
    ...baseDraftArgs(productId),
    name: 'Already Started',
  })

  // Manually flip to generating via the internal status mutation.
  await t.run((ctx) => ctx.db.patch(adTestId, { status: 'generating' }))

  await expect(
    asUser.mutation(api.adTests.startGeneration, { adTestId }),
  ).rejects.toThrow(/cannot be started/)
})

test('startGeneration rejects a non-owner', async () => {
  const t = convexTest(schema, modules)
  await seedBillingData(t)
  const { productId } = await seedProductWithImage(t)

  const adTestId = await t
    .withIdentity({ tokenIdentifier: USER })
    .mutation(api.adTests.createDraft, baseDraftArgs(productId))

  await expect(
    t
      .withIdentity({ tokenIdentifier: OTHER })
      .mutation(api.adTests.startGeneration, { adTestId }),
  ).rejects.toThrow(/Ad Test not found/)
})

test('startGeneration uses landscape (16:9) aspect ratio for landscape placement', async () => {
  const t = convexTest(schema, modules)
  await seedBillingData(t)
  const { productId } = await seedProductWithImage(t)
  const asUser = t.withIdentity({ tokenIdentifier: USER })

  const adTestId = await asUser.mutation(api.adTests.createDraft, {
    productId,
    name: 'Landscape Test',
    source: 'custom',
    angles: [{ key: 'a', title: 'A' }],
    placements: ['landscape'] as Placement[],
  })

  await asUser.mutation(api.adTests.startGeneration, { adTestId })

  const gens = await t.run((ctx) =>
    ctx.db
      .query('templateGenerations')
      .withIndex('by_adTestId', (q) => q.eq('adTestId', adTestId))
      .collect(),
  )
  expect(gens).toHaveLength(1)
  expect(gens[0].aspectRatio).toBe('16:9')
  expect(gens[0].placement).toBe('landscape')
})

test('setStatusFromChildren leaves a childless draft unchanged', async () => {
  const t = convexTest(schema, modules)
  const productId = await seedProduct(t)
  const adTestId = await t
    .withIdentity({ tokenIdentifier: USER })
    .mutation(api.adTests.createDraft, baseDraftArgs(productId))

  await t.mutation(internal.adTests.setStatusFromChildren, { adTestId })
  expect((await t.run((ctx) => ctx.db.get(adTestId)))!.status).toBe('draft')
})
