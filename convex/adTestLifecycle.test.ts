/// <reference types="vite/client" />
/**
 * Tests for the weekly Ad Test lifecycle trigger (issue #41):
 *   - getLifecycleCandidates selects exported, week-old, un-nudged ready tests
 *     whose owner is emailable (has a userPlans.clerkUserId)
 *   - it excludes recent exports, archived / non-ready / already-nudged tests,
 *     non-exported tests, and owners we can't reach
 *   - markLifecycleNudgeSent stamps lastLifecycleEmailSentAt
 */
import { convexTest, type TestConvex } from 'convex-test'
import { expect, test } from 'vitest'
import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'

const modules = import.meta.glob('./**/*.*s')

const USER = 'user|owner'
const CLERK_ID = 'user_clerk_123'
const WEEK = 7 * 24 * 60 * 60 * 1000

async function seedUserPlan(
  t: TestConvex<typeof schema>,
  userId = USER,
  clerkUserId: string | undefined = CLERK_ID,
): Promise<void> {
  await t.run((ctx) =>
    ctx.db.insert('userPlans', {
      userId,
      plan: 'pro',
      syncedAt: Date.now(),
      clerkUserId,
    }),
  )
}

async function seedProduct(t: TestConvex<typeof schema>): Promise<Id<'products'>> {
  return t.run((ctx) =>
    ctx.db.insert('products', { name: 'Hydration Mix', status: 'ready', userId: USER }),
  )
}

async function seedTest(
  t: TestConvex<typeof schema>,
  productId: Id<'products'>,
  fields: {
    exportedAt?: number
    status?: 'draft' | 'generating' | 'ready' | 'partially_failed' | 'failed'
    archivedAt?: number
    lastLifecycleEmailSentAt?: number
    userId?: string
    name?: string
  },
): Promise<Id<'adTests'>> {
  return t.run((ctx) => {
    const now = Date.now()
    return ctx.db.insert('adTests', {
      userId: fields.userId ?? USER,
      productId,
      name: fields.name ?? 'Benefit Test',
      status: fields.status ?? 'ready',
      source: 'custom',
      angles: [{ key: 'a', title: 'A' }],
      placements: ['feed_square'],
      aspectRatios: ['1:1'],
      plannedImageCount: 1,
      completedImageCount: 1,
      failedImageCount: 0,
      winnerCount: 0,
      exportedAt: fields.exportedAt,
      archivedAt: fields.archivedAt,
      lastLifecycleEmailSentAt: fields.lastLifecycleEmailSentAt,
      createdAt: now,
      updatedAt: now,
    })
  })
}

async function candidateIds(
  t: TestConvex<typeof schema>,
  now: number,
): Promise<string[]> {
  const cands = await t.query(internal.adTestLifecycle.getLifecycleCandidates, {
    now,
  })
  return cands.map((c) => c.adTestId as string)
}

test('selects an exported, week-old, un-nudged ready test for an emailable owner', async () => {
  const t = convexTest(schema, modules)
  const now = Date.now()
  await seedUserPlan(t)
  const productId = await seedProduct(t)
  const eligible = await seedTest(t, productId, {
    exportedAt: now - WEEK - 1000,
  })

  const cands = await t.query(internal.adTestLifecycle.getLifecycleCandidates, {
    now,
  })
  expect(cands).toHaveLength(1)
  expect(cands[0].adTestId).toBe(eligible)
  expect(cands[0].clerkUserId).toBe(CLERK_ID)
  expect(cands[0].productName).toBe('Hydration Mix')
  expect(cands[0].testName).toBe('Benefit Test')
})

test('excludes ineligible tests', async () => {
  const t = convexTest(schema, modules)
  const now = Date.now()
  await seedUserPlan(t)
  const productId = await seedProduct(t)
  const old = now - WEEK - 1000

  // Each of these must be excluded:
  await seedTest(t, productId, { exportedAt: now - 1000 }) // exported too recently
  await seedTest(t, productId, {}) // never exported (exportedAt undefined)
  await seedTest(t, productId, { exportedAt: old, archivedAt: now }) // archived
  await seedTest(t, productId, { exportedAt: old, status: 'generating' }) // not ready
  await seedTest(t, productId, { exportedAt: old, lastLifecycleEmailSentAt: now }) // already nudged

  expect(await candidateIds(t, now)).toEqual([])
})

test('excludes a test whose owner has no clerkUserId (unreachable)', async () => {
  const t = convexTest(schema, modules)
  const now = Date.now()
  // userPlans row present but WITHOUT a clerkUserId (can't email this owner).
  await t.run((ctx) =>
    ctx.db.insert('userPlans', { userId: USER, plan: 'pro', syncedAt: now }),
  )
  const productId = await seedProduct(t)
  await seedTest(t, productId, { exportedAt: now - WEEK - 1000 })

  expect(await candidateIds(t, now)).toEqual([])
})

test('excludes a test whose owner has no userPlans row', async () => {
  const t = convexTest(schema, modules)
  const now = Date.now()
  // No seedUserPlan.
  const productId = await seedProduct(t)
  await seedTest(t, productId, { exportedAt: now - WEEK - 1000 })

  expect(await candidateIds(t, now)).toEqual([])
})

test('a large backlog of already-nudged tests does not stall the sweep', async () => {
  const t = convexTest(schema, modules)
  const now = Date.now()
  await seedUserPlan(t)
  const productId = await seedProduct(t)
  const old = now - WEEK - 1000

  // 205 already-nudged exported tests (> the 200 per-sweep budget). With a naive
  // take-then-filter these would fill the window and hide the fresh test forever.
  await t.run(async (ctx) => {
    for (let i = 0; i < 205; i++) {
      await ctx.db.insert('adTests', {
        userId: USER,
        productId,
        name: `Nudged ${i}`,
        status: 'ready',
        source: 'custom',
        angles: [{ key: 'a', title: 'A' }],
        placements: ['feed_square'],
        aspectRatios: ['1:1'],
        plannedImageCount: 1,
        completedImageCount: 1,
        failedImageCount: 0,
        winnerCount: 0,
        exportedAt: old,
        lastLifecycleEmailSentAt: now - 1000,
        createdAt: now,
        updatedAt: now,
      })
    }
  })
  const fresh = await seedTest(t, productId, { exportedAt: old, name: 'Fresh' })

  const cands = await t.query(internal.adTestLifecycle.getLifecycleCandidates, {
    now,
  })
  expect(cands.map((c) => c.adTestId as string)).toEqual([fresh])
})

test('markLifecycleNudgeSent stamps lastLifecycleEmailSentAt', async () => {
  const t = convexTest(schema, modules)
  const productId = await seedProduct(t)
  const adTestId = await seedTest(t, productId, { exportedAt: Date.now() - WEEK })

  await t.mutation(internal.adTestLifecycle.markLifecycleNudgeSent, { adTestId })
  const row = await t.run((ctx) => ctx.db.get(adTestId))
  expect(row!.lastLifecycleEmailSentAt).toBeTypeOf('number')

  // Now excluded from a subsequent sweep.
  const now = Date.now()
  await seedUserPlan(t)
  expect(await candidateIds(t, now)).toEqual([])
})
