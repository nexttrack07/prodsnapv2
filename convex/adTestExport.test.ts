/// <reference types="vite/client" />
/**
 * Tests for the export prepare query (issue #38) — the entitlement gate and
 * copy-pairing resolution that the server-side zip action depends on:
 *   - paid users get resolved items (complete creatives + paired copy) + copy sets
 *   - free / unsubscribed users are denied before any export work
 *   - non-owners are denied (ownership checked before entitlement)
 *
 * The zip build itself (fetch + fflate + R2 upload) lives in the `exportTestSet`
 * action and isn't unit-tested here; the CSV builders have their own suite.
 */
import { convexTest } from 'convex-test'
import { beforeAll, expect, test, vi } from 'vitest'
import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'

const modules = import.meta.glob('./**/*.*s')

const USER = 'user|owner'
const OTHER = 'user|intruder'

beforeAll(() => {
  // Make the paid-plan gate deterministic regardless of ambient env.
  vi.stubEnv('BILLING_ENABLED', 'true')
})

/** Grants `userId` a paid (pro) plan so the export gate allows them. */
async function seedPaidPlan(
  t: ReturnType<typeof convexTest>,
  userId = USER,
  plan = 'pro',
): Promise<void> {
  await t.run((ctx) =>
    ctx.db.insert('userPlans', { userId, plan, syncedAt: Date.now() }),
  )
}

type Placement = 'feed_square' | 'feed_vertical' | 'story_reel' | 'landscape'

async function seedExportable(
  t: ReturnType<typeof convexTest>,
): Promise<{ adTestId: Id<'adTests'>; productId: Id<'products'> }> {
  return t.run(async (ctx) => {
    const now = Date.now()
    const productId = await ctx.db.insert('products', {
      name: 'Hydration Mix',
      status: 'ready',
      userId: USER,
    })
    const adTestId = await ctx.db.insert('adTests', {
      userId: USER,
      productId,
      name: 'Benefit Angles',
      status: 'ready',
      source: 'custom',
      angles: [{ key: 'benefit', title: 'Benefit' }],
      placements: ['feed_vertical'] as Placement[],
      aspectRatios: ['4:5'],
      plannedImageCount: 2,
      completedImageCount: 1,
      failedImageCount: 0,
      winnerCount: 0,
      createdAt: now,
      updatedAt: now,
    })
    const copySetId = await ctx.db.insert('adTestCopySets', {
      userId: USER,
      adTestId,
      productId,
      request: {
        includeHeadlines: true,
        headlineCount: 2,
        includePrimaryTexts: true,
        primaryTextCount: 1,
        includeDescriptions: false,
        descriptionCount: 0,
      },
      headlines: [
        { text: 'Feel the difference', variantIndex: 0 },
        { text: 'Hydration, upgraded', variantIndex: 1 },
      ],
      primaryTexts: [{ text: 'Hydrate faster, recover sooner.', variantIndex: 0 }],
      descriptions: [],
      recommendedCtaButton: 'SHOP_NOW',
      createdAt: now,
      updatedAt: now,
    })
    // Complete creative paired with copy set (headline 1, primary 0).
    await ctx.db.insert('templateGenerations', {
      productId,
      userId: USER,
      productImageUrl: 'https://example.com/p.png',
      mode: 'angle',
      colorAdapt: false,
      variationIndex: 0,
      status: 'complete',
      outputUrl: 'https://cdn.example.com/out/a.png',
      adTestId,
      adUnitIndex: 0,
      angleKey: 'benefit',
      placement: 'feed_vertical',
      aspectRatio: '4:5',
      selectedCopySetId: copySetId,
      selectedHeadlineIndex: 1,
      selectedPrimaryTextIndex: 0,
    })
    // Failed creative — excluded from the export items.
    await ctx.db.insert('templateGenerations', {
      productId,
      userId: USER,
      productImageUrl: 'https://example.com/p.png',
      mode: 'angle',
      colorAdapt: false,
      variationIndex: 0,
      status: 'failed',
      adTestId,
      adUnitIndex: 1,
      angleKey: 'benefit',
      placement: 'feed_vertical',
    })
    return { adTestId, productId }
  })
}

test('prepareExportInternal resolves items + copy for a paid owner', async () => {
  const t = convexTest(schema, modules)
  await seedPaidPlan(t)
  const { adTestId } = await seedExportable(t)

  const pkg = await t
    .withIdentity({ tokenIdentifier: USER })
    .query(internal.adTests.prepareExportInternal, { adTestId })

  expect(pkg.testName).toBe('Benefit Angles')
  expect(pkg.productName).toBe('Hydration Mix')
  expect(pkg.productSlug).toBe('hydration-mix')

  // Only the complete creative is exported; failed row excluded.
  expect(pkg.items).toHaveLength(1)
  const item = pkg.items[0]
  expect(item.filename).toBe(
    'hydration-mix_benefit-angles_benefit_feed-vertical_01.png',
  )
  // Paired copy resolved to text (headline index 1, primary index 0).
  expect(item.headline).toBe('Hydration, upgraded')
  expect(item.primaryText).toBe('Hydrate faster, recover sooner.')
  expect(item.description).toBeNull()
  expect(item.ctaButton).toBe('SHOP_NOW')

  // Full copy bank is exported for copy_bank.csv.
  expect(pkg.copySets).toHaveLength(1)
  expect(pkg.copySets[0].headlines).toHaveLength(2)
})

test('prepareExportInternal denies a free / unsubscribed user', async () => {
  const t = convexTest(schema, modules)
  const { adTestId } = await seedExportable(t) // no userPlans row → free

  await expect(
    t
      .withIdentity({ tokenIdentifier: USER })
      .query(internal.adTests.prepareExportInternal, { adTestId }),
  ).rejects.toThrow(/Upgrade to a paid plan/)
})

test('prepareExportInternal denies an explicit free_user plan', async () => {
  const t = convexTest(schema, modules)
  await seedPaidPlan(t, USER, 'free_user')
  const { adTestId } = await seedExportable(t)

  await expect(
    t
      .withIdentity({ tokenIdentifier: USER })
      .query(internal.adTests.prepareExportInternal, { adTestId }),
  ).rejects.toThrow(/Upgrade to a paid plan/)
})

test('prepareExportInternal denies a non-owner before entitlement', async () => {
  const t = convexTest(schema, modules)
  await seedPaidPlan(t, OTHER) // intruder is even paid — still denied
  const { adTestId } = await seedExportable(t)

  await expect(
    t
      .withIdentity({ tokenIdentifier: OTHER })
      .query(internal.adTests.prepareExportInternal, { adTestId }),
  ).rejects.toThrow(/Ad Test not found/)
})
