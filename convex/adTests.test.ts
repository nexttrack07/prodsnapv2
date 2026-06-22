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

test('setStatusFromChildren leaves a childless draft unchanged', async () => {
  const t = convexTest(schema, modules)
  const productId = await seedProduct(t)
  const adTestId = await t
    .withIdentity({ tokenIdentifier: USER })
    .mutation(api.adTests.createDraft, baseDraftArgs(productId))

  await t.mutation(internal.adTests.setStatusFromChildren, { adTestId })
  expect((await t.run((ctx) => ctx.db.get(adTestId)))!.status).toBe('draft')
})
