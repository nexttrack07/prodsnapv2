/// <reference types="vite/client" />
/**
 * Tests for the URL-first starter on-ramp (landing hero → free test on YOUR product):
 *   - createStarterProductFromImport: creates a product from a finished import,
 *     bypassing the free-plan product limit, with one-time/fresh-user guards
 *   - activateStarterForProduct: grant + starter draft + generation on an owned,
 *     analyzed product; idempotent
 */
import { convexTest, type TestConvex } from 'convex-test'
import { expect, test, vi } from 'vitest'
import { api, internal } from './_generated/api'
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

// ─── createStarterProductFromImages ──────────────────────────────────────────

const IMG = ['https://cdn.example.com/p1.png', 'https://cdn.example.com/p2.png']

test('creates a product from the SELECTED import images, bypassing the product limit', async () => {
  const t = convexTest(schema, modules)
  // Free plan → product limit 0; the starter path must still create one.
  await t.run((ctx) =>
    ctx.db.insert('userPlans', { userId: USER, plan: 'free_user', syncedAt: Date.now() }),
  )
  const importId = await seedDoneImport(t)

  // User curated: only the 2nd image, as the hero. Metadata comes from the import.
  const productId = await t
    .withIdentity({ tokenIdentifier: USER })
    .mutation(internal.activation.createStarterProductFromImages, {
      importId,
      imageUrls: [IMG[1]],
    })

  const product = await t.run((ctx) => ctx.db.get(productId))
  expect(product!.name).toBe('Hydration Mix') // from import distilled name
  expect(product!.status).toBe('analyzing')
  expect(product!.imageUrl).toBe(IMG[1]) // chosen hero
  expect(product!.customerLanguage).toEqual(['tastes great'])

  const images = await t.run((ctx) =>
    ctx.db
      .query('productImages')
      .withIndex('by_product', (q) => q.eq('productId', productId))
      .collect(),
  )
  expect(images).toHaveLength(1) // only the selected one
})

test('manual-upload path: creates a product from a photo with no import', async () => {
  const t = convexTest(schema, modules)
  const productId = await t
    .withIdentity({ tokenIdentifier: USER })
    .mutation(internal.activation.createStarterProductFromImages, {
      imageUrls: ['https://cdn.example.com/my-upload.png'],
      name: '  My Tee  ',
    })
  const product = await t.run((ctx) => ctx.db.get(productId))
  expect(product!.name).toBe('My Tee') // trimmed
  expect(product!.imageUrl).toBe('https://cdn.example.com/my-upload.png')
})

test('rejects empty imageUrls', async () => {
  const t = convexTest(schema, modules)
  await expect(
    t
      .withIdentity({ tokenIdentifier: USER })
      .mutation(internal.activation.createStarterProductFromImages, { imageUrls: [] }),
  ).rejects.toThrow(/at least one product photo/)
})

test('rejects a non-owner import', async () => {
  const t = convexTest(schema, modules)
  const importId = await seedDoneImport(t)
  await expect(
    t
      .withIdentity({ tokenIdentifier: OTHER })
      .mutation(internal.activation.createStarterProductFromImages, { importId, imageUrls: IMG }),
  ).rejects.toThrow(/Import not found/)
})

test('is repeatable: creates another product even if one already exists', async () => {
  const t = convexTest(schema, modules)
  // Pre-existing product + prior starter grant — the flow is repeatable now.
  await t.run((ctx) =>
    ctx.db.insert('products', { name: 'Existing', status: 'ready', userId: USER }),
  )
  await t.run((ctx) =>
    ctx.db.insert('onboardingProfiles', {
      userId: USER,
      currentStep: 1,
      hasReceivedStarterGrant: true,
      updatedAt: Date.now(),
    }),
  )
  const productId = await t
    .withIdentity({ tokenIdentifier: USER })
    .mutation(internal.activation.createStarterProductFromImages, { imageUrls: IMG, name: 'Another' })
  const product = await t.run((ctx) => ctx.db.get(productId))
  expect(product!.name).toBe('Another')
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

test('activateStarterWithTemplates creates a product + one generation per template', async () => {
  const t = convexTest(schema, modules)
  const templateIds = await t.run(async (ctx) => {
    const ids: Id<'adTemplates'>[] = []
    for (let i = 0; i < 3; i++) {
      ids.push(
        await ctx.db.insert('adTemplates', {
          imageUrl: `https://cdn.example.com/t${i}.png`,
          thumbnailUrl: `https://cdn.example.com/t${i}-thumb.png`,
          aspectRatio: '4:5',
          width: 1024,
          height: 1280,
          status: 'published',
        }),
      )
    }
    return ids
  })

  const { productId } = await t
    .withIdentity({ tokenIdentifier: USER, email: 'real@example.com' })
    .action(api.activation.activateStarterWithTemplates, {
      imageUrls: ['https://cdn.example.com/p.png'],
      templateIds,
    })

  // Free credits granted once.
  const balance = await t.run((ctx) =>
    ctx.db
      .query('creditBalances')
      .withIndex('by_userId', (q) => q.eq('userId', USER))
      .unique(),
  )
  expect(balance!.planAllowanceMc).toBe(100_000)

  // One template-driven generation per chosen template.
  const gens = await t.run((ctx) =>
    ctx.db
      .query('templateGenerations')
      .withIndex('by_product', (q) =>
        q.eq('productId', productId as Id<'products'>),
      )
      .collect(),
  )
  expect(gens).toHaveLength(3)
  expect(
    gens.every(
      (g) => g.templateId && g.mode === 'exact' && g.status === 'queued' && g.aspectRatio === '4:5',
    ),
  ).toBe(true)

  // #1: a starter Ad Test is created and the creatives are attached to it, so
  // they surface in Studio (which renders ad tests, not loose generations).
  const tests = await t.run((ctx) =>
    ctx.db
      .query('adTests')
      .withIndex('by_productId', (q) => q.eq('productId', productId as Id<'products'>))
      .collect(),
  )
  expect(tests).toHaveLength(1)
  expect(tests[0].source).toBe('starter')
  expect(tests[0].plannedImageCount).toBe(3)
  expect(tests[0].status).toBe('generating')
  expect(gens.every((g) => g.adTestId === tests[0]._id)).toBe(true)
})

test('activateStarterWithTemplates re-run with too few credits creates no orphan product (#4)', async () => {
  const t = convexTest(schema, modules)
  const templateIds = await t.run(async (ctx) => {
    const ids: Id<'adTemplates'>[] = []
    for (let i = 0; i < 3; i++) {
      ids.push(
        await ctx.db.insert('adTemplates', {
          imageUrl: `https://cdn.example.com/t${i}.png`,
          thumbnailUrl: `https://cdn.example.com/t${i}-thumb.png`,
          aspectRatio: '4:5',
          width: 1024,
          height: 1280,
          status: 'published',
        }),
      )
    }
    return ids
  })

  // Already activated, but only 2 credits (20,000 mc) — not enough for 3 images
  // (30,000 mc). The preflight must reject BEFORE any product is created.
  await t.run(async (ctx) => {
    await ctx.db.insert('creditPricing', {
      modelKey: 'nano-banana-2',
      creditsMc: 10_000,
      active: true,
      updatedAt: Date.now(),
    })
    await ctx.db.insert('creditBalances', {
      userId: USER,
      planAllowanceMc: 20_000,
      planUsedMc: 0,
      topupBalanceMc: 0,
      periodStart: Date.now(),
      periodEnd: Date.now() + 86_400_000,
      version: 1,
      updatedAt: Date.now(),
    })
    await ctx.db.insert('onboardingProfiles', {
      userId: USER,
      currentStep: 1,
      hasReceivedStarterGrant: true,
      updatedAt: Date.now(),
    })
  })

  await expect(
    t
      .withIdentity({ tokenIdentifier: USER, email: 'real@example.com' })
      .action(api.activation.activateStarterWithTemplates, {
        imageUrls: ['https://cdn.example.com/p.png'],
        templateIds,
      }),
  ).rejects.toThrow(/credit/i)

  // No orphan product (or analysis) was left behind.
  const products = await t.run((ctx) =>
    ctx.db
      .query('products')
      .withIndex('by_userId', (q) => q.eq('userId', USER))
      .collect(),
  )
  expect(products).toHaveLength(0)
})

test('activateStarterWithTemplates rejects when no template is chosen', async () => {
  const t = convexTest(schema, modules)
  await expect(
    t
      .withIdentity({ tokenIdentifier: USER, email: 'real@example.com' })
      .action(api.activation.activateStarterWithTemplates, {
        imageUrls: ['https://cdn.example.com/p.png'],
        templateIds: [],
      }),
  ).rejects.toThrow(/at least one template/)
})

test('resetMyActivation is admin-gated, not publicly callable (#2)', async () => {
  const t = convexTest(schema, modules)
  vi.unstubAllEnvs()

  // A normal authenticated user cannot call it (the exploit: reset + re-grant).
  await expect(
    t
      .withIdentity({ tokenIdentifier: USER, subject: 'user_random' })
      .mutation(api.activation.resetMyActivation, {}),
  ).rejects.toThrow(/admin/i)

  // An admin (subject listed in CLERK_ADMIN_USER_IDS) may use it.
  vi.stubEnv('CLERK_ADMIN_USER_IDS', 'user_admin')
  const res = await t
    .withIdentity({ tokenIdentifier: USER, subject: 'user_admin' })
    .mutation(api.activation.resetMyActivation, {})
  expect(res.deletedProducts).toBe(0)
  vi.unstubAllEnvs()
})

test('activateStarterForProduct is repeatable and never re-grants credits', async () => {
  const t = convexTest(schema, modules)
  const productId = await seedReadyProduct(t)
  // Already activated: a prior balance + grant flag. The starter test must
  // still run (re-runnable) but must NOT grant a second time.
  await t.run(async (ctx) => {
    ctx.db.insert('creditPricing', {
      modelKey: 'nano-banana-2',
      creditsMc: 10_000,
      active: true,
      updatedAt: Date.now(),
    })
    await ctx.db.insert('creditBalances', {
      userId: USER,
      planAllowanceMc: 100_000,
      planUsedMc: 0,
      topupBalanceMc: 0,
      periodStart: Date.now(),
      periodEnd: Date.now() + 86_400_000,
      version: 1,
      updatedAt: Date.now(),
    })
    await ctx.db.insert('onboardingProfiles', {
      userId: USER,
      currentStep: 1,
      hasReceivedStarterGrant: true,
      updatedAt: Date.now(),
    })
  })

  const { adTestId } = await t
    .withIdentity({ tokenIdentifier: USER, email: 'real@example.com' })
    .action(api.activation.activateStarterForProduct, { productId })
  expect(adTestId).toBeTruthy()

  // Still exactly one balance row — no second grant.
  const balances = await t.run((ctx) =>
    ctx.db
      .query('creditBalances')
      .withIndex('by_userId', (q) => q.eq('userId', USER))
      .collect(),
  )
  expect(balances).toHaveLength(1)
  expect(balances[0].planAllowanceMc).toBe(100_000) // not re-granted/reset
})
