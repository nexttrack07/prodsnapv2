/// <reference types="vite/client" />
/**
 * Unit tests for credit helpers (US-009):
 *   creditsToMc, mcToCredits, chargeCredits, grantPlanCredits,
 *   upgradeAdjustCredits, getCreditBalance
 */
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'
import schema from '../../../schema'
import {
  creditsToMc,
  mcToCredits,
  chargeCredits,
  requireCredits,
  grantPlanCredits,
  upgradeAdjustCredits,
  getCreditBalance,
} from '../credits'
import type { MutationCtx } from '../../../_generated/server'

// convex-test loads all convex modules via glob so internal mutations/queries
// are available for seeding.
const modules = import.meta.glob('../../../**/*.*s')

const USER_ID = 'tok|user_credits_001'
const CLERK_USER_ID = 'user_credits_001'

async function makeT() {
  return convexTest(schema, modules)
}

/** Seed a userPlans row. */
async function seedPlan(t: Awaited<ReturnType<typeof makeT>>, plan: string) {
  const { internal } = await import('../../../_generated/api')
  await t.mutation(internal.billing.syncPlan.writePlan, {
    userId: USER_ID,
    clerkUserId: CLERK_USER_ID,
    plan,
  })
}

/** Seed creditPricing rows for all known models. */
async function seedPricing(t: Awaited<ReturnType<typeof makeT>>) {
  await t.run(async (ctx) => {
    const now = Date.now()
    const entries = [
      { modelKey: 'nano-banana-2', creditsMc: 10_000 },
      { modelKey: 'gpt-image-2', creditsMc: 10_000 },
      { modelKey: 'gpt-image-2-edit', creditsMc: 10_000 },
      { modelKey: 'bria-rmbg', creditsMc: 2_000 },
    ]
    for (const entry of entries) {
      await ctx.db.insert('creditPricing', { ...entry, active: true, updatedAt: now })
    }
  })
}

// ─── Conversion helpers ───────────────────────────────────────────────────────

test('creditsToMc / mcToCredits round-trip across 10000 iterations', () => {
  for (let n = 0; n < 10_000; n++) {
    expect(mcToCredits(creditsToMc(n))).toBe(n)
    expect(Number.isInteger(creditsToMc(n))).toBe(true)
  }
})

test('creditsToMc rounds fractional credits', () => {
  expect(creditsToMc(0.1)).toBe(100)
  expect(creditsToMc(1.5)).toBe(1500)
  expect(creditsToMc(0.0001)).toBe(0)
})

// ─── chargeCredits ────────────────────────────────────────────────────────────

test('chargeCredits — plan credits consumed first, then top-up', async () => {
  const t = await makeT()
  await seedPlan(t, 'pro')
  await seedPricing(t)

  // Seed balance: plan has 2000 mc left (10000 - 8000), topup has 50000
  await t.run(async (ctx) => {
    await ctx.db.insert('creditBalances', {
      userId: USER_ID,
      planAllowanceMc: 10_000,
      planUsedMc: 8_000,
      topupBalanceMc: 50_000,
      periodStart: Date.now() - 1000,
      periodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
      version: 1,
      updatedAt: Date.now(),
    })
  })

  await t.withIdentity({ tokenIdentifier: USER_ID }).run(async (ctx) => {
    const mutCtx = ctx as unknown as MutationCtx
    const result = await chargeCredits(mutCtx, { userId: USER_ID, modelKey: 'gpt-image-2' })

    // gpt-image-2 costs 10000 mc; 2000 from plan, 8000 from topup
    expect(result.planUsedDeltaMc).toBe(2_000)
    expect(result.topupDeltaMc).toBe(8_000)
    expect(result.remainingMc).toBe(42_000)

    // Verify persisted state
    const balance = await ctx.db
      .query('creditBalances')
      .withIndex('by_userId', (q) => q.eq('userId', USER_ID))
      .unique()
    expect(balance!.planUsedMc).toBe(10_000)
    expect(balance!.topupBalanceMc).toBe(42_000)
  })
})

test('chargeCredits — insufficient balance throws CREDITS_EXHAUSTED', async () => {
  // chargeCredits has its own overdraft guard so callers that skip the
  // requireCredits pre-flight still can't silently drive topupBalance negative.
  const t = await makeT()
  await seedPlan(t, 'lite')
  await seedPricing(t)

  // planAllowanceMc=2000, planUsedMc=1500, topupBalanceMc=0 → 500 mc available
  // nano-banana-2 costs 10000 mc → insufficient
  await t.run(async (ctx) => {
    await ctx.db.insert('creditBalances', {
      userId: USER_ID,
      planAllowanceMc: 2_000,
      planUsedMc: 1_500,
      topupBalanceMc: 0,
      periodStart: Date.now() - 1000,
      periodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
      version: 1,
      updatedAt: Date.now(),
    })
  })

  await t.withIdentity({ tokenIdentifier: USER_ID }).run(async (ctx) => {
    const mutCtx = ctx as unknown as MutationCtx
    await expect(
      chargeCredits(mutCtx, { userId: USER_ID, modelKey: 'nano-banana-2' }),
    ).rejects.toThrow(/CREDITS_EXHAUSTED|Insufficient/)
  })
})

test('chargeCredits — unknown modelKey throws UNKNOWN_MODEL', async () => {
  const t = await makeT()
  await seedPlan(t, 'pro')
  await seedPricing(t)

  await t.run(async (ctx) => {
    await ctx.db.insert('creditBalances', {
      userId: USER_ID,
      planAllowanceMc: 1_500_000,
      planUsedMc: 0,
      topupBalanceMc: 0,
      periodStart: Date.now() - 1000,
      periodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
      version: 1,
      updatedAt: Date.now(),
    })
  })

  await t.withIdentity({ tokenIdentifier: USER_ID }).run(async (ctx) => {
    const mutCtx = ctx as unknown as MutationCtx
    await expect(
      chargeCredits(mutCtx, { userId: USER_ID, modelKey: 'fake-model-xyz' }),
    ).rejects.toThrow(/UNKNOWN_MODEL|No pricing/)
  })
})

test('chargeCredits — version bumps on every charge', async () => {
  const t = await makeT()
  await seedPlan(t, 'pro')
  await seedPricing(t)

  await t.run(async (ctx) => {
    await ctx.db.insert('creditBalances', {
      userId: USER_ID,
      planAllowanceMc: 50_000,
      planUsedMc: 0,
      topupBalanceMc: 0,
      periodStart: Date.now() - 1000,
      periodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
      version: 1,
      updatedAt: Date.now(),
    })
  })

  await t.withIdentity({ tokenIdentifier: USER_ID }).run(async (ctx) => {
    const mutCtx = ctx as unknown as MutationCtx
    // bria-rmbg costs 2000 mc each
    await chargeCredits(mutCtx, { userId: USER_ID, modelKey: 'bria-rmbg' })
    await chargeCredits(mutCtx, { userId: USER_ID, modelKey: 'bria-rmbg' })
    await chargeCredits(mutCtx, { userId: USER_ID, modelKey: 'bria-rmbg' })

    const balance = await ctx.db
      .query('creditBalances')
      .withIndex('by_userId', (q) => q.eq('userId', USER_ID))
      .unique()
    // started at version 1, bumped 3 times → version 4
    expect(balance!.version).toBe(4)
    // 2000 × 3 = 6000 mc used
    expect(balance!.planUsedMc).toBe(6_000)
  })
})

// ─── grantPlanCredits ────────────────────────────────────────────────────────

test('grantPlanCredits — idempotent on (periodStart, planSlug) tuple', async () => {
  const t = await makeT()
  await seedPlan(t, 'pro')

  const periodStart = Date.now() - 1000
  const periodEnd = periodStart + 30 * 24 * 60 * 60 * 1000

  await t.withIdentity({ tokenIdentifier: USER_ID }).run(async (ctx) => {
    const mutCtx = ctx as unknown as MutationCtx

    // First grant
    const first = await grantPlanCredits(mutCtx, {
      userId: USER_ID,
      planSlug: 'pro',
      periodStart,
      periodEnd,
    })
    expect(first.granted).toBe(true)

    // Second grant with same args — should be idempotent
    const second = await grantPlanCredits(mutCtx, {
      userId: USER_ID,
      planSlug: 'pro',
      periodStart,
      periodEnd,
    })
    expect(second.granted).toBe(false)
    expect(second.reason).toBe('already-granted-this-period')

    // Verify row state: pro = 1500 credits = 1500000 mc
    const balance = await ctx.db
      .query('creditBalances')
      .withIndex('by_userId', (q) => q.eq('userId', USER_ID))
      .unique()
    expect(balance!.planAllowanceMc).toBe(creditsToMc(1500)) // 1500000
    expect(balance!.planUsedMc).toBe(0)
    expect(balance!.lastGrantedPeriodStart).toBe(periodStart)
    expect(balance!.lastGrantedPlanSlug).toBe('pro')
  })
})

test('grantPlanCredits — new period resets planUsed but preserves topup', async () => {
  const t = await makeT()
  await seedPlan(t, 'pro')

  const oldStart = Date.now() - 60 * 24 * 60 * 60 * 1000
  const oldEnd = oldStart + 30 * 24 * 60 * 60 * 1000
  const newStart = oldEnd
  const newEnd = newStart + 30 * 24 * 60 * 60 * 1000

  // Seed existing balance with usage and topup
  await t.run(async (ctx) => {
    await ctx.db.insert('creditBalances', {
      userId: USER_ID,
      planAllowanceMc: 1_500_000,
      planUsedMc: 100_000,
      topupBalanceMc: 50_000,
      periodStart: oldStart,
      periodEnd: oldEnd,
      version: 5,
      lastGrantedPeriodStart: oldStart,
      lastGrantedPlanSlug: 'pro',
      updatedAt: Date.now(),
    })
  })

  await t.withIdentity({ tokenIdentifier: USER_ID }).run(async (ctx) => {
    const mutCtx = ctx as unknown as MutationCtx
    const result = await grantPlanCredits(mutCtx, {
      userId: USER_ID,
      planSlug: 'pro',
      periodStart: newStart,
      periodEnd: newEnd,
    })
    expect(result.granted).toBe(true)

    const balance = await ctx.db
      .query('creditBalances')
      .withIndex('by_userId', (q) => q.eq('userId', USER_ID))
      .unique()
    // planUsedMc reset to 0
    expect(balance!.planAllowanceMc).toBe(1_500_000)
    expect(balance!.planUsedMc).toBe(0)
    // topup preserved
    expect(balance!.topupBalanceMc).toBe(50_000)
  })
})

// ─── upgradeAdjustCredits ─────────────────────────────────────────────────────

test('upgradeAdjustCredits — Lite → Pro adds the delta', async () => {
  const t = await makeT()
  await seedPlan(t, 'lite')

  const periodStart = Date.now() - 15 * 24 * 60 * 60 * 1000

  // Seed Lite balance with some usage
  await t.run(async (ctx) => {
    await ctx.db.insert('creditBalances', {
      userId: USER_ID,
      planAllowanceMc: 500_000, // Lite = 500 credits = 500000 mc
      planUsedMc: 20_000,
      topupBalanceMc: 0,
      periodStart,
      periodEnd: periodStart + 30 * 24 * 60 * 60 * 1000,
      version: 2,
      lastGrantedPeriodStart: periodStart,
      lastGrantedPlanSlug: 'lite',
      updatedAt: Date.now(),
    })
  })

  await t.withIdentity({ tokenIdentifier: USER_ID }).run(async (ctx) => {
    const mutCtx = ctx as unknown as MutationCtx
    const result = await upgradeAdjustCredits(mutCtx, {
      userId: USER_ID,
      oldPlanSlug: 'lite',
      newPlanSlug: 'pro',
      periodStart,
    })

    // Pro (1500000 mc) - Lite (500000 mc) = 1000000 mc delta
    expect(result.adjusted).toBe(true)
    expect(result.deltaMc).toBe(1_000_000)

    const balance = await ctx.db
      .query('creditBalances')
      .withIndex('by_userId', (q) => q.eq('userId', USER_ID))
      .unique()
    expect(balance!.planAllowanceMc).toBe(1_500_000)
    // planUsedMc preserved (not reset on upgrade)
    expect(balance!.planUsedMc).toBe(20_000)
    expect(balance!.lastGrantedPlanSlug).toBe('pro')
  })
})

test('upgradeAdjustCredits — Pro → Lite (downgrade) is a no-op', async () => {
  const t = await makeT()
  await seedPlan(t, 'pro')

  const periodStart = Date.now() - 15 * 24 * 60 * 60 * 1000

  await t.run(async (ctx) => {
    await ctx.db.insert('creditBalances', {
      userId: USER_ID,
      planAllowanceMc: 1_500_000,
      planUsedMc: 0,
      topupBalanceMc: 0,
      periodStart,
      periodEnd: periodStart + 30 * 24 * 60 * 60 * 1000,
      version: 1,
      lastGrantedPeriodStart: periodStart,
      lastGrantedPlanSlug: 'pro',
      updatedAt: Date.now(),
    })
  })

  await t.withIdentity({ tokenIdentifier: USER_ID }).run(async (ctx) => {
    const mutCtx = ctx as unknown as MutationCtx
    const result = await upgradeAdjustCredits(mutCtx, {
      userId: USER_ID,
      oldPlanSlug: 'pro',
      newPlanSlug: 'lite',
      periodStart,
    })

    expect(result.adjusted).toBe(false)
    expect(result.deltaMc).toBe(0)

    const balance = await ctx.db
      .query('creditBalances')
      .withIndex('by_userId', (q) => q.eq('userId', USER_ID))
      .unique()
    // Allowance unchanged
    expect(balance!.planAllowanceMc).toBe(1_500_000)
  })
})

// ─── getCreditBalance ─────────────────────────────────────────────────────────

test('getCreditBalance — returns null when no balance row exists', async () => {
  const t = await makeT()
  await seedPlan(t, 'pro')
  await seedPricing(t)

  await t.run(async (ctx) => {
    const result = await getCreditBalance(ctx, USER_ID)
    expect(result).toBeNull()
  })
})

test('getCreditBalance — returns whole-credit floor', async () => {
  const t = await makeT()
  await seedPlan(t, 'pro')

  const periodStart = Date.now() - 1000
  const periodEnd = periodStart + 30 * 24 * 60 * 60 * 1000

  // planAllowanceMc=1500000, planUsedMc=325000, topupBalanceMc=12300
  // planRemainingMc = 1500000 - 325000 = 1175000
  // available = 1175000 + 12300 = 1187300 mc = 1187.3 credits → floor 1187
  await t.run(async (ctx) => {
    await ctx.db.insert('creditBalances', {
      userId: USER_ID,
      planAllowanceMc: 1_500_000,
      planUsedMc: 325_000,
      topupBalanceMc: 12_300,
      periodStart,
      periodEnd,
      version: 1,
      updatedAt: Date.now(),
    })
  })

  await t.run(async (ctx) => {
    const result = await getCreditBalance(ctx, USER_ID)
    expect(result).not.toBeNull()
    expect(result!.creditsRemaining).toBe(1187)
    expect(result!.planRemainingMc).toBe(1_175_000)
    expect(result!.topupBalanceMc).toBe(12_300)
    expect(result!.planSlug).toBe('pro')
  })
})
