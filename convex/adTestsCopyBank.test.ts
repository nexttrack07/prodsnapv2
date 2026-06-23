/// <reference types="vite/client" />
/**
 * Tests for the test-level Copy Bank (issue #37):
 *   - generateCopySet: request validation, count fan-out, ownership, CTA, angle stamping
 *   - listCopySets: ownership scoping, newest-first
 *   - updateCopySuggestion: edit-in-place by variantIndex, empty/owner guards
 *   - setCopySetCta: set / validate / clear
 *   - deleteCopySet: removal + pairing cleanup
 *   - pairCopyWithGeneration: pair, index validation, same-test check, unpair
 *
 * The Copy Bank generator is an action that calls the LLM, so these run with
 * CONVEX_TEST_MODE=true — ai.generateCopyBankText returns deterministic,
 * count-sized mock copy instead of hitting fal.
 */
import { convexTest } from 'convex-test'
import { beforeAll, expect, test, vi } from 'vitest'
import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'
import { assertCopyCountsMet } from './lib/adTestValidators'

const modules = import.meta.glob('./**/*.*s')

const USER = 'user|owner'
const OTHER = 'user|intruder'

beforeAll(() => {
  vi.stubEnv('CONVEX_TEST_MODE', 'true')
})

type Placement = 'feed_square' | 'feed_vertical' | 'story_reel' | 'landscape'

async function seedProduct(
  t: ReturnType<typeof convexTest>,
  userId = USER,
): Promise<Id<'products'>> {
  return t.run((ctx) =>
    ctx.db.insert('products', {
      name: 'Hydration Mix',
      status: 'ready',
      userId,
      productDescription: 'An electrolyte drink mix',
      targetAudience: 'athletes',
      valueProposition: 'Hydrate faster',
    }),
  )
}

const baseDraftArgs = (productId: Id<'products'>) => ({
  productId,
  name: 'Benefit Angles',
  source: 'custom' as const,
  angles: [
    { key: 'benefit', title: 'Benefit', description: 'Core benefit', hook: 'Hydrate fast' },
  ],
  placements: ['feed_square'] as Placement[],
})

const blankRequest = {
  includeHeadlines: false,
  headlineCount: 0,
  includePrimaryTexts: false,
  primaryTextCount: 0,
  includeDescriptions: false,
  descriptionCount: 0,
}

async function seedTest(
  t: ReturnType<typeof convexTest>,
): Promise<{ productId: Id<'products'>; adTestId: Id<'adTests'> }> {
  const productId = await seedProduct(t)
  const adTestId = await t
    .withIdentity({ tokenIdentifier: USER })
    .mutation(api.adTests.createDraft, baseDraftArgs(productId))
  return { productId, adTestId }
}

// ─── assertCopyCountsMet ───────────────────────────────────────────────────────

test('assertCopyCountsMet throws on under-delivery and passes when met', () => {
  // Short on headlines (1 of 3) → throws, naming the shortfall.
  expect(() =>
    assertCopyCountsMet(
      { headlines: ['a'], primaryTexts: ['x', 'y'], descriptions: [] },
      { headlineCount: 3, primaryTextCount: 2, descriptionCount: 0 },
    ),
  ).toThrow(/headlines \(1\/3\)/)

  // Exact and over-delivery both satisfy the floor.
  expect(() =>
    assertCopyCountsMet(
      { headlines: ['a', 'b', 'c', 'd'], primaryTexts: ['x', 'y'], descriptions: [] },
      { headlineCount: 3, primaryTextCount: 2, descriptionCount: 0 },
    ),
  ).not.toThrow()
})

// ─── generateCopySet ─────────────────────────────────────────────────────────

test('generateCopySet creates a set with the requested per-field counts', async () => {
  const t = convexTest(schema, modules)
  const { adTestId } = await seedTest(t)
  const asUser = t.withIdentity({ tokenIdentifier: USER })

  const copySetId = await asUser.action(api.adTests.generateCopySet, {
    adTestId,
    angleKey: 'benefit',
    request: {
      ...blankRequest,
      includeHeadlines: true,
      headlineCount: 5,
      includePrimaryTexts: true,
      primaryTextCount: 2,
      // descriptions intentionally off
    },
  })

  const row = await t.run((ctx) => ctx.db.get(copySetId))
  expect(row).not.toBeNull()
  expect(row!.userId).toBe(USER)
  expect(row!.adTestId).toBe(adTestId)
  expect(row!.headlines).toHaveLength(5)
  expect(row!.primaryTexts).toHaveLength(2)
  expect(row!.descriptions).toHaveLength(0)
  // variantIndex is contiguous and the angle is stamped on each suggestion.
  expect(row!.headlines.map((h) => h.variantIndex)).toEqual([0, 1, 2, 3, 4])
  expect(row!.headlines[0].angleKey).toBe('benefit')
  // CTA is a normalized Meta button value, not prose.
  expect(row!.recommendedCtaButton).toBe('SHOP_NOW')
})

test('generateCopySet rejects an empty or out-of-range request', async () => {
  const t = convexTest(schema, modules)
  const { adTestId } = await seedTest(t)
  const asUser = t.withIdentity({ tokenIdentifier: USER })

  // No field included.
  await expect(
    asUser.action(api.adTests.generateCopySet, {
      adTestId,
      request: { ...blankRequest },
    }),
  ).rejects.toThrow(/at least one copy field/)

  // Field included but zero suggestions requested across the board.
  await expect(
    asUser.action(api.adTests.generateCopySet, {
      adTestId,
      request: { ...blankRequest, includeHeadlines: true, headlineCount: 0 },
    }),
  ).rejects.toThrow(/at least one suggestion/)

  // Over the per-field cap.
  await expect(
    asUser.action(api.adTests.generateCopySet, {
      adTestId,
      request: { ...blankRequest, includeHeadlines: true, headlineCount: 21 },
    }),
  ).rejects.toThrow(/cannot exceed/)
})

test('generateCopySet rejects auth and non-owners', async () => {
  const t = convexTest(schema, modules)
  const { adTestId } = await seedTest(t)

  await expect(
    t.action(api.adTests.generateCopySet, {
      adTestId,
      request: { ...blankRequest, includeHeadlines: true, headlineCount: 1 },
    }),
  ).rejects.toThrow(/Not authenticated/)

  await expect(
    t.withIdentity({ tokenIdentifier: OTHER }).action(api.adTests.generateCopySet, {
      adTestId,
      request: { ...blankRequest, includeHeadlines: true, headlineCount: 1 },
    }),
  ).rejects.toThrow(/Ad Test not found/)
})

// ─── listCopySets ────────────────────────────────────────────────────────────

test('listCopySets returns owned sets newest-first and [] for non-owners', async () => {
  const t = convexTest(schema, modules)
  const { adTestId } = await seedTest(t)
  const asUser = t.withIdentity({ tokenIdentifier: USER })

  const first = await asUser.action(api.adTests.generateCopySet, {
    adTestId,
    request: { ...blankRequest, includeHeadlines: true, headlineCount: 1 },
  })
  const second = await asUser.action(api.adTests.generateCopySet, {
    adTestId,
    request: { ...blankRequest, includeDescriptions: true, descriptionCount: 3 },
  })

  const sets = await asUser.query(api.adTests.listCopySets, { adTestId })
  expect(sets.map((s) => s._id)).toEqual([second, first])

  const asOther = t.withIdentity({ tokenIdentifier: OTHER })
  expect(await asOther.query(api.adTests.listCopySets, { adTestId })).toEqual([])
})

// ─── updateCopySuggestion ──────────────────────────────────────────────────────

test('updateCopySuggestion edits by variantIndex and guards empty/owner', async () => {
  const t = convexTest(schema, modules)
  const { adTestId } = await seedTest(t)
  const asUser = t.withIdentity({ tokenIdentifier: USER })

  const copySetId = await asUser.action(api.adTests.generateCopySet, {
    adTestId,
    request: { ...blankRequest, includeHeadlines: true, headlineCount: 3 },
  })

  await asUser.mutation(api.adTests.updateCopySuggestion, {
    copySetId,
    field: 'headlines',
    variantIndex: 1,
    text: '  Edited headline  ',
  })
  const row = await t.run((ctx) => ctx.db.get(copySetId))
  expect(row!.headlines[1].text).toBe('Edited headline')
  expect(row!.headlines[0].text).not.toBe('Edited headline')

  await expect(
    asUser.mutation(api.adTests.updateCopySuggestion, {
      copySetId,
      field: 'headlines',
      variantIndex: 0,
      text: '   ',
    }),
  ).rejects.toThrow(/cannot be empty/)

  await expect(
    t.withIdentity({ tokenIdentifier: OTHER }).mutation(api.adTests.updateCopySuggestion, {
      copySetId,
      field: 'headlines',
      variantIndex: 0,
      text: 'hijack',
    }),
  ).rejects.toThrow(/Copy set not found/)
})

// ─── setCopySetCta ─────────────────────────────────────────────────────────────

test('setCopySetCta normalizes, rejects invalid values, and clears', async () => {
  const t = convexTest(schema, modules)
  const { adTestId } = await seedTest(t)
  const asUser = t.withIdentity({ tokenIdentifier: USER })

  const copySetId = await asUser.action(api.adTests.generateCopySet, {
    adTestId,
    request: { ...blankRequest, includeHeadlines: true, headlineCount: 1 },
  })

  await asUser.mutation(api.adTests.setCopySetCta, {
    copySetId,
    recommendedCtaButton: 'learn more',
  })
  expect((await t.run((ctx) => ctx.db.get(copySetId)))!.recommendedCtaButton).toBe(
    'LEARN_MORE',
  )

  await expect(
    asUser.mutation(api.adTests.setCopySetCta, {
      copySetId,
      recommendedCtaButton: 'CLICK_THE_THING',
    }),
  ).rejects.toThrow(/Unsupported CTA/)

  await asUser.mutation(api.adTests.setCopySetCta, { copySetId })
  expect(
    (await t.run((ctx) => ctx.db.get(copySetId)))!.recommendedCtaButton,
  ).toBeUndefined()
})

// ─── pairCopyWithGeneration + deleteCopySet ────────────────────────────────────

async function seedGenForTest(
  t: ReturnType<typeof convexTest>,
  adTestId: Id<'adTests'>,
  productId: Id<'products'>,
): Promise<Id<'templateGenerations'>> {
  return t.run((ctx) =>
    ctx.db.insert('templateGenerations', {
      productId,
      userId: USER,
      productImageUrl: 'https://example.com/p.png',
      mode: 'angle',
      colorAdapt: false,
      variationIndex: 0,
      status: 'complete',
      adTestId,
      adUnitIndex: 0,
      angleKey: 'benefit',
      placement: 'feed_square',
      outputUrl: 'https://cdn.example.com/out/a.png',
    }),
  )
}

test('pairCopyWithGeneration pairs, validates indices, and unpairs', async () => {
  const t = convexTest(schema, modules)
  const { productId, adTestId } = await seedTest(t)
  const asUser = t.withIdentity({ tokenIdentifier: USER })

  const copySetId = await asUser.action(api.adTests.generateCopySet, {
    adTestId,
    request: {
      ...blankRequest,
      includeHeadlines: true,
      headlineCount: 3,
      includePrimaryTexts: true,
      primaryTextCount: 2,
    },
  })
  const genId = await seedGenForTest(t, adTestId, productId)

  await asUser.mutation(api.adTests.pairCopyWithGeneration, {
    generationId: genId,
    copySetId,
    headlineIndex: 2,
    primaryTextIndex: 0,
  })
  let gen = await t.run((ctx) => ctx.db.get(genId))
  expect(gen!.selectedCopySetId).toBe(copySetId)
  expect(gen!.selectedHeadlineIndex).toBe(2)
  expect(gen!.selectedPrimaryTextIndex).toBe(0)
  expect(gen!.selectedDescriptionIndex).toBeUndefined()

  // Out-of-range index is rejected.
  await expect(
    asUser.mutation(api.adTests.pairCopyWithGeneration, {
      generationId: genId,
      copySetId,
      headlineIndex: 9,
    }),
  ).rejects.toThrow(/headline is not in this copy set/)

  // Unpair clears all selections.
  await asUser.mutation(api.adTests.pairCopyWithGeneration, { generationId: genId })
  gen = await t.run((ctx) => ctx.db.get(genId))
  expect(gen!.selectedCopySetId).toBeUndefined()
  expect(gen!.selectedHeadlineIndex).toBeUndefined()
})

test('pairCopyWithGeneration rejects a generation not in an Ad Test', async () => {
  const t = convexTest(schema, modules)
  const { productId, adTestId } = await seedTest(t)
  const asUser = t.withIdentity({ tokenIdentifier: USER })

  const copySetId = await asUser.action(api.adTests.generateCopySet, {
    adTestId,
    request: { ...blankRequest, includeHeadlines: true, headlineCount: 1 },
  })
  // Loose generation, no adTestId.
  const looseGen = await t.run((ctx) =>
    ctx.db.insert('templateGenerations', {
      productId,
      userId: USER,
      productImageUrl: 'https://example.com/p.png',
      mode: 'angle',
      colorAdapt: false,
      variationIndex: 0,
      status: 'complete',
    }),
  )

  await expect(
    asUser.mutation(api.adTests.pairCopyWithGeneration, {
      generationId: looseGen,
      copySetId,
    }),
  ).rejects.toThrow(/not part of an Ad Test/)
})

test('pairCopyWithGeneration rejects a copy set from a different test', async () => {
  const t = convexTest(schema, modules)
  const { productId, adTestId } = await seedTest(t)
  const asUser = t.withIdentity({ tokenIdentifier: USER })

  // A second test owned by the same user, with its own copy set.
  const otherTestId = await asUser.mutation(api.adTests.createDraft, {
    ...baseDraftArgs(productId),
    name: 'Other Test',
  })
  const otherCopySet = await asUser.action(api.adTests.generateCopySet, {
    adTestId: otherTestId,
    request: { ...blankRequest, includeHeadlines: true, headlineCount: 1 },
  })
  const genId = await seedGenForTest(t, adTestId, productId)

  await expect(
    asUser.mutation(api.adTests.pairCopyWithGeneration, {
      generationId: genId,
      copySetId: otherCopySet,
    }),
  ).rejects.toThrow(/does not belong to this Ad Test/)
})

test('deleteCopySuggestion removes one item, keeps indices, and clears its pairing', async () => {
  const t = convexTest(schema, modules)
  const { productId, adTestId } = await seedTest(t)
  const asUser = t.withIdentity({ tokenIdentifier: USER })

  const copySetId = await asUser.action(api.adTests.generateCopySet, {
    adTestId,
    request: { ...blankRequest, includeHeadlines: true, headlineCount: 3 },
  })
  const genId = await seedGenForTest(t, adTestId, productId)
  // Pair the creative to headline index 1, then delete that headline.
  await asUser.mutation(api.adTests.pairCopyWithGeneration, {
    generationId: genId,
    copySetId,
    headlineIndex: 1,
  })

  await asUser.mutation(api.adTests.deleteCopySuggestion, {
    copySetId,
    field: 'headlines',
    variantIndex: 1,
  })

  const set = await t.run((ctx) => ctx.db.get(copySetId))
  // The deleted one is gone; survivors keep their original variantIndex (no reindex).
  expect(set!.headlines.map((h) => h.variantIndex).sort()).toEqual([0, 2])
  // The dangling pairing to the deleted headline was cleared (set itself stays paired).
  const gen = await t.run((ctx) => ctx.db.get(genId))
  expect(gen!.selectedHeadlineIndex).toBeUndefined()
  expect(gen!.selectedCopySetId).toBe(copySetId)

  // Deleting a missing index throws; non-owners are rejected.
  await expect(
    asUser.mutation(api.adTests.deleteCopySuggestion, {
      copySetId,
      field: 'headlines',
      variantIndex: 1,
    }),
  ).rejects.toThrow(/not found/i)
  await expect(
    t.withIdentity({ tokenIdentifier: OTHER }).mutation(api.adTests.deleteCopySuggestion, {
      copySetId,
      field: 'headlines',
      variantIndex: 0,
    }),
  ).rejects.toThrow(/not found/i)
})

test('deleteCopySet removes the set and clears its pairings', async () => {
  const t = convexTest(schema, modules)
  const { productId, adTestId } = await seedTest(t)
  const asUser = t.withIdentity({ tokenIdentifier: USER })

  const copySetId = await asUser.action(api.adTests.generateCopySet, {
    adTestId,
    request: { ...blankRequest, includeHeadlines: true, headlineCount: 2 },
  })
  const genId = await seedGenForTest(t, adTestId, productId)
  await asUser.mutation(api.adTests.pairCopyWithGeneration, {
    generationId: genId,
    copySetId,
    headlineIndex: 0,
  })

  await asUser.mutation(api.adTests.deleteCopySet, { copySetId })

  expect(await t.run((ctx) => ctx.db.get(copySetId))).toBeNull()
  const gen = await t.run((ctx) => ctx.db.get(genId))
  expect(gen!.selectedCopySetId).toBeUndefined()
  expect(gen!.selectedHeadlineIndex).toBeUndefined()
})
