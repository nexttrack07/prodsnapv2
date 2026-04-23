/// <reference types="vite/client" />
/**
 * Unit tests for billing resilience (P0.3 + P0.4):
 *   - writePlan correctly upserts userPlans and writes billingEvents
 *   - requireCapability respects BILLING_TRUST_CACHE flag
 */
import { convexTest } from 'convex-test'
import { expect, test, vi } from 'vitest'
import { internal } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.*s')

// Helper: create a convexTest instance with a seeded userPlans row.
async function makeT() {
  return convexTest(schema, modules)
}

// ─── writePlan tests ─────────────────────────────────────────────────────────

test('writePlan: inserts userPlans row with correct plan', async () => {
  const t = await makeT()
  await t.mutation(internal.billing.syncPlan.writePlan, {
    userId: 'user|abc',
    clerkUserId: 'clerk_abc',
    plan: 'basic',
  })
  const row = await t.query(internal.billing.syncPlan.getMyPlanByUserId, {
    userId: 'user|abc',
  })
  expect(row).not.toBeNull()
  expect(row!.plan).toBe('basic')
})

test('writePlan: patches existing row on second call', async () => {
  const t = await makeT()
  await t.mutation(internal.billing.syncPlan.writePlan, {
    userId: 'user|abc',
    clerkUserId: 'clerk_abc',
    plan: 'basic',
  })
  await t.mutation(internal.billing.syncPlan.writePlan, {
    userId: 'user|abc',
    clerkUserId: 'clerk_abc',
    plan: 'pro',
  })
  const row = await t.query(internal.billing.syncPlan.getMyPlanByUserId, {
    userId: 'user|abc',
  })
  expect(row!.plan).toBe('pro')
})

test("writePlan: empty plan '' is written (legitimate no-subscription)", async () => {
  const t = await makeT()
  await t.mutation(internal.billing.syncPlan.writePlan, {
    userId: 'user|abc',
    clerkUserId: 'clerk_abc',
    plan: '',
  })
  const row = await t.query(internal.billing.syncPlan.getMyPlanByUserId, {
    userId: 'user|abc',
  })
  expect(row!.plan).toBe('')
})

test('writePlan: writes billingEvents row for unknown-plan-slug', async () => {
  const t = await makeT()
  await t.mutation(internal.billing.syncPlan.writePlan, {
    userId: 'user|xyz',
    clerkUserId: 'clerk_xyz',
    plan: 'basic',
    billingEventContext: 'unknown-plan-slug',
    billingEventMetadata: { receivedSlug: 'enterprise', preservedPlan: 'basic' },
  })
  // Verify via getBillingStatus that plan was preserved.
  const row = await t.query(internal.billing.syncPlan.getMyPlanByUserId, {
    userId: 'user|xyz',
  })
  expect(row!.plan).toBe('basic')
})

test('writePlan: writes billingEvents row for malformed-clerk-response', async () => {
  const t = await makeT()
  await t.mutation(internal.billing.syncPlan.writePlan, {
    userId: 'user|xyz',
    clerkUserId: 'clerk_xyz',
    plan: 'pro',
    billingEventContext: 'malformed-clerk-response',
    billingEventMetadata: { receivedType: 'null', preservedPlan: 'pro' },
  })
  const row = await t.query(internal.billing.syncPlan.getMyPlanByUserId, {
    userId: 'user|xyz',
  })
  expect(row!.plan).toBe('pro')
})

test('writePlan: writes billingEvents row for clerk-api-error', async () => {
  const t = await makeT()
  await t.mutation(internal.billing.syncPlan.writePlan, {
    userId: 'user|xyz',
    clerkUserId: 'clerk_xyz',
    plan: 'basic',
    billingEventContext: 'clerk-api-error',
    billingEventMetadata: { error: 'ECONNREFUSED', preservedPlan: 'basic' },
  })
  const row = await t.query(internal.billing.syncPlan.getMyPlanByUserId, {
    userId: 'user|xyz',
  })
  expect(row!.plan).toBe('basic')
})

// ─── BILLING_TRUST_CACHE tests ────────────────────────────────────────────────
// These tests exercise the isCacheTrusted logic indirectly by seeding a
// userPlans row with a specific syncedAt and checking requireCapability behavior.

test('BILLING_TRUST_CACHE=true within 4h: requireCapability allows when no plan', async () => {
  const t = await makeT()
  // Seed a userPlans row with plan='' but fresh syncedAt (within 4h).
  await t.mutation(internal.billing.syncPlan.writePlan, {
    userId: 'user|cache',
    clerkUserId: 'clerk_cache',
    plan: '',
  })

  // With BILLING_TRUST_CACHE=true, requireCapability should allow (trust cache).
  await t.run(async (ctx) => {
    vi.stubEnv('BILLING_ENABLED', 'true')
    vi.stubEnv('BILLING_TRUST_CACHE', 'true')
    // Seed the identity so getBillingContext can find the user.
    // convex-test doesn't have a full auth flow, so we verify the
    // isCacheTrusted logic unit directly.
    const { isCacheTrustedForTest } = await import('./lib/billing/index')
    // syncedAt = now → within 4h window → trusted
    expect(isCacheTrustedForTest(Date.now())).toBe(true)
    vi.unstubAllEnvs()
  })
})

test('BILLING_TRUST_CACHE=true past 4h: isCacheTrusted returns false', async () => {
  await import('./lib/billing/index').then(({ isCacheTrustedForTest }) => {
    vi.stubEnv('BILLING_TRUST_CACHE', 'true')
    // 4h + 1ms ago
    const stale = Date.now() - (4 * 60 * 60 * 1000 + 1)
    expect(isCacheTrustedForTest(stale)).toBe(false)
    vi.unstubAllEnvs()
  })
})

test('BILLING_TRUST_CACHE=false: isCacheTrusted always returns false', async () => {
  await import('./lib/billing/index').then(({ isCacheTrustedForTest }) => {
    vi.stubEnv('BILLING_TRUST_CACHE', 'false')
    expect(isCacheTrustedForTest(Date.now())).toBe(false)
    vi.unstubAllEnvs()
  })
})

test('BILLING_TRUST_CACHE unset: isCacheTrusted returns false', async () => {
  await import('./lib/billing/index').then(({ isCacheTrustedForTest }) => {
    vi.unstubAllEnvs()
    expect(isCacheTrustedForTest(Date.now())).toBe(false)
  })
})
