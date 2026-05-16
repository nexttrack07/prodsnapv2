/// <reference types="vite/client" />
/**
 * Unit tests for billing helpers:
 *   requireCapability, requireProductLimit,
 *   countUsageSincePeriodStart, startOfMonthUtc
 */
import { convexTest } from 'convex-test'
import { expect, test, vi } from 'vitest'
import schema from '../../../schema'
import {
  requireCapability,
  requireProductLimit,
  countUsageThisMonth,
  countUsageSincePeriodStart,
  startOfMonthUtc,
  CAPABILITIES,
} from '../index'
import type { MutationCtx } from '../../../_generated/server'

// convex-test loads all convex modules via glob so internal mutations/queries
// are available for seeding.
const modules = import.meta.glob('../../../**/*.*s')

// ─── Auth helpers ─────────────────────────────────────────────────────────────

const USER_ID = 'tok|user_test_001'
const CLERK_USER_ID = 'user_test_001'

/** Seed a userPlans row so the billing provider can resolve a plan. */
async function seedPlan(
  t: Awaited<ReturnType<typeof makeT>>,
  plan: string,
  extra?: { periodStart?: number; periodEnd?: number; clerkUserId?: string },
) {
  const { internal } = await import('../../../_generated/api')
  await t.mutation(internal.billing.syncPlan.writePlan, {
    userId: USER_ID,
    clerkUserId: extra?.clerkUserId ?? CLERK_USER_ID,
    plan,
    periodStart: extra?.periodStart,
    periodEnd: extra?.periodEnd,
  })
}

async function makeT() {
  return convexTest(schema, modules)
}

// ─── requireCapability ────────────────────────────────────────────────────────

test('requireCapability: BILLING_ENABLED=false bypasses enforcement and returns context', async () => {
  const t = await makeT()
  await seedPlan(t, 'lite')

  await t.withIdentity({ tokenIdentifier: USER_ID }).run(async (ctx) => {
    vi.stubEnv('BILLING_ENABLED', 'false')
    const mutCtx = ctx as unknown as MutationCtx
    // Must not throw even with kill switch off.
    const billing = await requireCapability(mutCtx, CAPABILITIES.GENERATE_VARIATIONS, 'test:mutation')
    expect(billing.userId).toBe(USER_ID)
    vi.unstubAllEnvs()
  })
})

test('requireCapability: unauthenticated throws Not authenticated', async () => {
  const t = await makeT()

  await t.run(async (ctx) => {
    vi.stubEnv('BILLING_ENABLED', 'true')
    const mutCtx = ctx as unknown as MutationCtx
    await expect(
      requireCapability(mutCtx, CAPABILITIES.GENERATE_VARIATIONS, 'test:mutation'),
    ).rejects.toThrow('Not authenticated')
    vi.unstubAllEnvs()
  })
})

test('requireCapability: no plan throws subscription error and writes enforcement event', async () => {
  const t = await makeT()
  await seedPlan(t, '')

  await t.withIdentity({ tokenIdentifier: USER_ID }).run(async (ctx) => {
    vi.stubEnv('BILLING_ENABLED', 'true')
    vi.stubEnv('BILLING_TRUST_CACHE', 'false')
    const mutCtx = ctx as unknown as MutationCtx
    await expect(
      requireCapability(mutCtx, CAPABILITIES.GENERATE_VARIATIONS, 'test:mutation'),
    ).rejects.toThrow('No active subscription')

    // Verify enforcement event was written.
    const events = await ctx.db
      .query('billingEvents')
      .withIndex('by_userId', (q) => q.eq('userId', USER_ID))
      .collect()
    expect(events.length).toBeGreaterThan(0)
    const denial = events.find((e) => e.context === 'enforcement' && !e.allowed)
    expect(denial).toBeDefined()
    vi.unstubAllEnvs()
  })
})

test('requireCapability: plan has capability → returns billing context', async () => {
  const t = await makeT()
  await seedPlan(t, 'lite')

  await t.withIdentity({ tokenIdentifier: USER_ID }).run(async (ctx) => {
    vi.stubEnv('BILLING_ENABLED', 'true')
    const mutCtx = ctx as unknown as MutationCtx
    const billing = await requireCapability(
      mutCtx,
      CAPABILITIES.GENERATE_VARIATIONS,
      'test:mutation',
    )
    expect(billing.userId).toBe(USER_ID)
    expect(billing.plan).toBe('lite')
    vi.unstubAllEnvs()
  })
})

test('requireCapability: missing capability throws upgrade error and writes enforcement event', async () => {
  const t = await makeT()
  await seedPlan(t, 'lite')

  await t.withIdentity({ tokenIdentifier: USER_ID }).run(async (ctx) => {
    vi.stubEnv('BILLING_ENABLED', 'true')
    const mutCtx = ctx as unknown as MutationCtx
    // Use a fabricated capability slug not in the plan.
    await expect(
      requireCapability(mutCtx, 'nonexistent_cap' as never, 'test:mutation'),
    ).rejects.toThrow('Missing capability: nonexistent_cap')

    const events = await ctx.db
      .query('billingEvents')
      .withIndex('by_userId', (q) => q.eq('userId', USER_ID))
      .collect()
    const denial = events.find((e) => e.context === 'enforcement' && !e.allowed)
    expect(denial).toBeDefined()
    vi.unstubAllEnvs()
  })
})

// ─── requireProductLimit ──────────────────────────────────────────────────────

test('requireProductLimit: BILLING_ENABLED=false → always ok', async () => {
  const t = await makeT()
  await seedPlan(t, 'lite')

  await t.withIdentity({ tokenIdentifier: USER_ID }).run(async (ctx) => {
    vi.stubEnv('BILLING_ENABLED', 'false')
    const mutCtx = ctx as unknown as MutationCtx
    const billing = await requireProductLimit(mutCtx, 'test:mutation')
    expect(billing.userId).toBe(USER_ID)
    vi.unstubAllEnvs()
  })
})

test('requireProductLimit: under limit → ok', async () => {
  const t = await makeT()
  await seedPlan(t, 'lite') // limit = 5

  await t.withIdentity({ tokenIdentifier: USER_ID }).run(async (ctx) => {
    vi.stubEnv('BILLING_ENABLED', 'true')
    const mutCtx = ctx as unknown as MutationCtx
    // No products inserted → count = 0, under limit of 5.
    const billing = await requireProductLimit(mutCtx, 'test:mutation')
    expect(billing.userId).toBe(USER_ID)
    vi.unstubAllEnvs()
  })
})

test('requireProductLimit: at limit throws and writes enforcement event', async () => {
  const t = await makeT()
  await seedPlan(t, 'lite') // limit = 5

  await t.withIdentity({ tokenIdentifier: USER_ID }).run(async (ctx) => {
    vi.stubEnv('BILLING_ENABLED', 'true')
    // Insert 5 non-archived products for this user.
    for (let i = 0; i < 5; i++) {
      await ctx.db.insert('products', {
        name: `Product ${i}`,
        status: 'ready',
        userId: USER_ID,
      })
    }

    const mutCtx = ctx as unknown as MutationCtx
    await expect(requireProductLimit(mutCtx, 'test:mutation')).rejects.toThrow(
      'your plan allows 5',
    )

    const events = await ctx.db
      .query('billingEvents')
      .withIndex('by_userId', (q) => q.eq('userId', USER_ID))
      .collect()
    const denial = events.find((e) => e.context === 'enforcement' && !e.allowed)
    expect(denial).toBeDefined()
    vi.unstubAllEnvs()
  })
})

test('requireProductLimit: pro plan limit → ok under limit', async () => {
  const t = await makeT()
  await seedPlan(t, 'pro') // limit = 100

  await t.withIdentity({ tokenIdentifier: USER_ID }).run(async (ctx) => {
    vi.stubEnv('BILLING_ENABLED', 'true')
    // Insert products under pro limit (100).
    for (let i = 0; i < 15; i++) {
      await ctx.db.insert('products', {
        name: `Product ${i}`,
        status: 'ready',
        userId: USER_ID,
      })
    }
    const mutCtx = ctx as unknown as MutationCtx
    const billing = await requireProductLimit(mutCtx, 'test:mutation')
    expect(billing.plan).toBe('pro')
    vi.unstubAllEnvs()
  })
})

// ─── countUsageThisMonth ──────────────────────────────────────────────────────

test('countUsageThisMonth: sums only usage rows from this month', async () => {
  const t = await makeT()

  await t.run(async (ctx) => {
    const since = startOfMonthUtc()
    // 3 usage rows this month.
    for (let i = 0; i < 3; i++) {
      await ctx.db.insert('billingEvents', {
        userId: USER_ID,
        mutationName: 'test:gen',
        allowed: true,
        timestamp: since + i * 1000,
        units: 1,
        context: 'usage',
      })
    }
    // 1 usage row from last month — should be excluded.
    await ctx.db.insert('billingEvents', {
      userId: USER_ID,
      mutationName: 'test:gen',
      allowed: true,
      timestamp: since - 1000,
      units: 1,
      context: 'usage',
    })

    const count = await countUsageThisMonth(ctx, USER_ID)
    expect(count).toBe(3)
  })
})

test('countUsageThisMonth: ignores enforcement rows (context != usage)', async () => {
  const t = await makeT()

  await t.run(async (ctx) => {
    const since = startOfMonthUtc()
    // 2 usage rows.
    for (let i = 0; i < 2; i++) {
      await ctx.db.insert('billingEvents', {
        userId: USER_ID,
        mutationName: 'test:gen',
        allowed: true,
        timestamp: since + i * 1000,
        units: 1,
        context: 'usage',
      })
    }
    // 5 enforcement rows — must NOT be counted.
    for (let i = 0; i < 5; i++) {
      await ctx.db.insert('billingEvents', {
        userId: USER_ID,
        mutationName: 'test:gate',
        allowed: false,
        timestamp: since + 100 + i * 1000,
        context: 'enforcement',
      })
    }

    const count = await countUsageThisMonth(ctx, USER_ID)
    expect(count).toBe(2)
  })
})

test('countUsageThisMonth: returns 0 when no rows exist', async () => {
  const t = await makeT()
  await t.run(async (ctx) => {
    const count = await countUsageThisMonth(ctx, USER_ID)
    expect(count).toBe(0)
  })
})

// ─── countUsageSincePeriodStart (P1.1c) ──────────────────────────────────────

test('countUsageSincePeriodStart: uses periodStart when present', async () => {
  const t = await makeT()
  const periodStart = Date.now() - 10 * 24 * 60 * 60 * 1000 // 10 days ago

  await seedPlan(t, 'lite', { periodStart })

  await t.run(async (ctx) => {
    // 2 usage rows within period
    for (let i = 0; i < 2; i++) {
      await ctx.db.insert('billingEvents', {
        userId: USER_ID,
        mutationName: 'test:gen',
        allowed: true,
        timestamp: periodStart + (i + 1) * 1000,
        units: 1,
        context: 'usage',
      })
    }
    // 1 usage row before period — must be excluded
    await ctx.db.insert('billingEvents', {
      userId: USER_ID,
      mutationName: 'test:gen',
      allowed: true,
      timestamp: periodStart - 1000,
      units: 1,
      context: 'usage',
    })

    const count = await countUsageSincePeriodStart(ctx, USER_ID)
    expect(count).toBe(2)
  })
})

test('countUsageSincePeriodStart: falls back to calendar-month and writes period-fallback event when periodStart missing', async () => {
  const t = await makeT()
  // Seed plan with no periodStart
  await seedPlan(t, 'lite')

  await t.withIdentity({ tokenIdentifier: USER_ID }).run(async (ctx) => {
    const since = startOfMonthUtc()
    // Insert 1 usage row this month
    await ctx.db.insert('billingEvents', {
      userId: USER_ID,
      mutationName: 'test:gen',
      allowed: true,
      timestamp: since + 1000,
      units: 1,
      context: 'usage',
    })

    const mutCtx = ctx as unknown as MutationCtx
    const count = await countUsageSincePeriodStart(mutCtx, USER_ID)
    expect(count).toBe(1)

    // period-fallback event should have been written
    const events = await ctx.db
      .query('billingEvents')
      .withIndex('by_userId', (q) => q.eq('userId', USER_ID))
      .collect()
    const fallback = events.find((e) => e.context === 'period-fallback')
    expect(fallback).toBeDefined()
  })
})
