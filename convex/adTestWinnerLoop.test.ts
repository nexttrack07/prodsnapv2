/// <reference types="vite/client" />
/**
 * Tests for the winner loop (issue #40):
 *   - createNextAdTestFromWinner seeds a winner_iteration draft from an angle
 *     winner (or a prompt winner), carrying source links + placements
 *   - rejects winners with nothing to iterate from, and non-owners
 *   - listPerformanceNotes is owner-scoped, newest-first
 */
import { convexTest, type TestConvex } from 'convex-test'
import { expect, test } from 'vitest'
import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'

const modules = import.meta.glob('./**/*.*s')

const USER = 'user|owner'
const OTHER = 'user|intruder'

async function seedProduct(
  t: TestConvex<typeof schema>,
  userId = USER,
): Promise<Id<'products'>> {
  return t.run((ctx) =>
    ctx.db.insert('products', { name: 'Hydration Mix', status: 'ready', userId }),
  )
}

async function seedWinner(
  t: TestConvex<typeof schema>,
  productId: Id<'products'>,
  fields: {
    userId?: string
    angleSeed?: { title: string; description: string; hook: string; suggestedAdStyle: string }
    angleKey?: string
    dynamicPrompt?: string
    adTestId?: Id<'adTests'>
  } = {},
): Promise<Id<'templateGenerations'>> {
  return t.run((ctx) =>
    ctx.db.insert('templateGenerations', {
      productId,
      userId: fields.userId ?? USER,
      productImageUrl: 'https://example.com/p.png',
      mode: 'angle',
      colorAdapt: false,
      variationIndex: 0,
      status: 'complete',
      outputUrl: 'https://cdn.example.com/w.png',
      isWinner: true,
      angleSeed: fields.angleSeed,
      angleKey: fields.angleKey,
      dynamicPrompt: fields.dynamicPrompt,
      adTestId: fields.adTestId,
    }),
  )
}

const ANGLE_SEED = {
  title: 'Core benefit',
  description: 'Lead with the main benefit',
  hook: 'Feel the difference',
  suggestedAdStyle: 'UGC',
}

// ─── createNextAdTestFromWinner ──────────────────────────────────────────────

test('seeds a winner_iteration draft from an angle winner', async () => {
  const t = convexTest(schema, modules)
  const productId = await seedProduct(t)
  const winner = await seedWinner(t, productId, {
    angleSeed: ANGLE_SEED,
    angleKey: 'benefit',
  })

  const adTestId = await t
    .withIdentity({ tokenIdentifier: USER })
    .mutation(api.adTests.createNextAdTestFromWinner, { generationId: winner })

  const adTest = await t.run((ctx) => ctx.db.get(adTestId))
  expect(adTest!.status).toBe('draft')
  expect(adTest!.source).toBe('winner_iteration')
  expect(adTest!.sourceGenerationId).toBe(winner)
  expect(adTest!.productId).toBe(productId)
  expect(adTest!.placements).toEqual([
    'feed_square',
    'feed_vertical',
    'story_reel',
  ])
  expect(adTest!.aspectRatios).toEqual(['1:1', '4:5', '9:16'])
  expect(adTest!.angles).toHaveLength(1)
  expect(adTest!.angles[0].key).toBe('benefit')
  expect(adTest!.angles[0].title).toBe('Core benefit')
  expect(adTest!.name).toBe('Next test: Core benefit')
})

test('seeds a prompt draft when the winner has no angle', async () => {
  const t = convexTest(schema, modules)
  const productId = await seedProduct(t)
  const winner = await seedWinner(t, productId, {
    dynamicPrompt: 'A sunlit flat-lay of the product',
  })

  const adTestId = await t
    .withIdentity({ tokenIdentifier: USER })
    .mutation(api.adTests.createNextAdTestFromWinner, {
      generationId: winner,
      name: '  Custom name  ',
    })

  const adTest = await t.run((ctx) => ctx.db.get(adTestId))
  expect(adTest!.angles).toEqual([])
  expect(adTest!.prompts).toEqual(['A sunlit flat-lay of the product'])
  expect(adTest!.name).toBe('Custom name') // trimmed
})

test('carries the source ad test id when the winner belongs to one', async () => {
  const t = convexTest(schema, modules)
  const productId = await seedProduct(t)
  const sourceTestId = await t.run((ctx) => {
    const now = Date.now()
    return ctx.db.insert('adTests', {
      userId: USER,
      productId,
      name: 'Original',
      status: 'ready',
      source: 'custom',
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
  })
  const winner = await seedWinner(t, productId, {
    angleSeed: ANGLE_SEED,
    angleKey: 'benefit',
    adTestId: sourceTestId,
  })

  const adTestId = await t
    .withIdentity({ tokenIdentifier: USER })
    .mutation(api.adTests.createNextAdTestFromWinner, { generationId: winner })
  const adTest = await t.run((ctx) => ctx.db.get(adTestId))
  expect(adTest!.sourceAdTestId).toBe(sourceTestId)
})

test('rejects a winner with no angle or prompt to iterate from', async () => {
  const t = convexTest(schema, modules)
  const productId = await seedProduct(t)
  const winner = await seedWinner(t, productId, {}) // no angleSeed, no prompt

  await expect(
    t
      .withIdentity({ tokenIdentifier: USER })
      .mutation(api.adTests.createNextAdTestFromWinner, { generationId: winner }),
  ).rejects.toThrow(/no angle or prompt/)
})

test('rejects a non-owner', async () => {
  const t = convexTest(schema, modules)
  const productId = await seedProduct(t)
  const winner = await seedWinner(t, productId, { angleSeed: ANGLE_SEED })

  await expect(
    t
      .withIdentity({ tokenIdentifier: OTHER })
      .mutation(api.adTests.createNextAdTestFromWinner, { generationId: winner }),
  ).rejects.toThrow(/Generation not found/)
})

// ─── listPerformanceNotes ────────────────────────────────────────────────────

test('listPerformanceNotes returns owned notes newest-first, [] for others', async () => {
  const t = convexTest(schema, modules)
  const productId = await seedProduct(t)
  const asUser = t.withIdentity({ tokenIdentifier: USER })
  const adTestId = await asUser.mutation(api.adTests.createDraft, {
    productId,
    name: 'Test',
    source: 'custom',
    angles: [{ key: 'a', title: 'A' }],
    placements: ['feed_square'],
  })

  await asUser.mutation(api.adTests.savePerformanceNote, {
    adTestId,
    platform: 'meta',
    metricName: 'ROAS',
    metricValue: '2.4',
  })
  await asUser.mutation(api.adTests.savePerformanceNote, {
    adTestId,
    note: 'Audience B did better',
  })

  const notes = await asUser.query(api.adTests.listPerformanceNotes, { adTestId })
  expect(notes).toHaveLength(2)
  // Newest-first: the free-form note was saved last.
  expect(notes[0].note).toBe('Audience B did better')

  const otherNotes = await t
    .withIdentity({ tokenIdentifier: OTHER })
    .query(api.adTests.listPerformanceNotes, { adTestId })
  expect(otherNotes).toEqual([])
})
