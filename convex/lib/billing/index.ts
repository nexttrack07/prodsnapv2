/**
 * Public billing API — the only billing module that mutations import.
 *
 * Contract:
 *   - `getBillingContext` for read access to plan/capability state.
 *   - `requireCapability` for boolean gates (TypeScript-checked against Capability).
 *   - `requireProductLimit` for scalar product-count enforcement.
 *
 * Kill switch: when `BILLING_ENABLED !== 'true'`, all enforcement helpers
 * short-circuit to allow. This is the server-side rollback mechanism —
 * flip the Convex env var for instant effect, no rebuild.
 *
 * Audit: every gate denial appends a row to `billingEvents` (context:
 * 'enforcement'). Every credit consumption appends a row (context: 'usage').
 * The same table doubles as the monthly-credit ledger.
 */
import type { MutationCtx, QueryCtx } from '../../_generated/server'
import { CAPABILITIES, type Capability } from './capabilities'
import { PLAN_CONFIG } from './planConfig'
import { ClerkBillingProvider } from './provider.clerk'
import type { BillingContext, BillingProvider } from './provider'
import { billingError } from './errors'

// ─── Provider instance (swap here to change providers) ────────────────────
export const billingProvider: BillingProvider = new ClerkBillingProvider()

// ─── Kill switch ──────────────────────────────────────────────────────────
// Fail-CLOSED default: billing enforcement is ON unless `BILLING_ENABLED` is
// explicitly set to `'false'`. Prior behavior was fail-open (enforcement
// required opt-in via `'true'`), which meant a missing env var in prod
// silently let every user have the full app for free. Reversed here so a
// forgotten env var fails safely. Dev devs who need to bypass enforcement
// must add `BILLING_ENABLED=false` to .env.local explicitly.
function isBillingEnabled(): boolean {
  return process.env.BILLING_ENABLED !== 'false'
}

// ─── Cache-trust flag ─────────────────────────────────────────────────────
// BILLING_TRUST_CACHE=true: operator kill switch for confirmed Clerk outages.
// When set, cached plans are trusted for up to 4h past syncedAt even if
// billingStatus is 'clerk-unreachable'. After 4h the cache is considered stale
// and enforcement falls back to denying as "no plan".
const TRUST_CACHE_TTL_MS = 4 * 60 * 60 * 1000 // 4 hours

function isCacheTrusted(syncedAt: number | undefined): boolean {
  if (process.env.BILLING_TRUST_CACHE !== 'true') return false
  if (syncedAt === undefined) return false
  return Date.now() - syncedAt < TRUST_CACHE_TTL_MS
}

// Exported for unit tests only — not part of the public billing API.
export { isCacheTrusted as isCacheTrustedForTest }

// ─── Context ──────────────────────────────────────────────────────────────

/** Open to a resolved billing context, or null if unauthenticated. */
export async function getBillingContext(
  ctx: QueryCtx | MutationCtx,
): Promise<BillingContext | null> {
  return billingProvider.getContext(ctx)
}

// ─── Capability enforcement ───────────────────────────────────────────────

/**
 * Assert the current user has `capability`. Throws on denial and records an
 * enforcement event to `billingEvents`. Short-circuits to allow when the
 * BILLING_ENABLED kill switch is off.
 *
 * Returns the user's billing context on success.
 */
export async function requireCapability(
  ctx: MutationCtx,
  capability: Capability,
  mutationName: string,
): Promise<BillingContext> {
  if (!isBillingEnabled()) {
    const bypass = await getBillingContext(ctx)
    if (!bypass) throw new Error('Not authenticated')
    return bypass
  }

  const billing = await getBillingContext(ctx)
  if (!billing) throw new Error('Not authenticated')

  if (!billing.hasKnownPlan) {
    // BILLING_TRUST_CACHE: allow access when cache is fresh enough during outage.
    if (isCacheTrusted(billing.syncedAt)) return billing
    await recordDenial(ctx, billing, mutationName, capability, billing.plan)
    throw billingError(
      'NO_SUBSCRIPTION',
      'No active subscription — choose a plan at /pricing',
    )
  }

  if (!billing.hasCapability(capability)) {
    await recordDenial(ctx, billing, mutationName, capability, billing.plan)
    throw billingError(
      'MISSING_CAPABILITY',
      `This feature requires an upgrade. Missing capability: ${capability}`,
    )
  }

  return billing
}

// ─── Product count limit ──────────────────────────────────────────────────

/**
 * Assert the user is under their plan's product limit. Throws on over-limit
 * with the downgrade-aware message. Bypassed by the kill switch.
 */
export async function requireProductLimit(
  ctx: MutationCtx,
  mutationName: string,
): Promise<BillingContext> {
  const billing = await getBillingContext(ctx)
  if (!billing) throw new Error('Not authenticated')

  if (!isBillingEnabled()) return billing

  if (!billing.hasKnownPlan) {
    // BILLING_TRUST_CACHE: allow access when cache is fresh enough during outage.
    if (isCacheTrusted(billing.syncedAt)) return billing
    await recordDenial(ctx, billing, mutationName, 'product-limit', billing.plan)
    throw billingError(
      'NO_SUBSCRIPTION',
      'No active subscription — choose a plan at /pricing',
    )
  }

  const plan = PLAN_CONFIG[billing.plan]
  const limit = plan.productLimit
  if (limit === -1) return billing

  // Count the user's non-archived products.
  const existing = await ctx.db
    .query('products')
    .withIndex('by_userId_archived', (q) =>
      q.eq('userId', billing.userId).eq('archivedAt', undefined),
    )
    .collect()

  if (existing.length >= limit) {
    await recordDenial(ctx, billing, mutationName, 'product-limit', billing.plan)
    throw billingError(
      'PRODUCT_LIMIT',
      `You have ${existing.length} products but your plan allows ${limit}. ` +
        `Archive products or upgrade.`,
    )
  }

  return billing
}

/**
 * Like `requireProductLimit` but accepts an explicit `userId` instead of
 * reading from `ctx.auth`. Use this from internal mutations that run without
 * an auth context (e.g. `createProductFromImport`).
 */
export async function requireProductLimitForUser(
  ctx: MutationCtx,
  userId: string,
  mutationName: string,
): Promise<void> {
  if (!isBillingEnabled()) return

  const row = await ctx.db
    .query('userPlans')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .unique()

  if (!row || !row.plan) {
    // No plan row → treat as unknown plan and deny.
    await ctx.db.insert('billingEvents', {
      userId,
      mutationName,
      capability: 'product-limit',
      allowed: false,
      timestamp: Date.now(),
      context: 'enforcement',
    })
    throw billingError(
      'NO_SUBSCRIPTION',
      'No active subscription — choose a plan at /pricing',
    )
  }

  const plan = PLAN_CONFIG[row.plan]
  if (!plan) {
    console.warn(
      '[requireProductLimitForUser] no plan found for user',
      userId,
      'slug=',
      row.plan,
    )
    throw billingError('NO_PLAN', 'No active subscription')
  }
  const limit = plan.productLimit
  if (limit === -1) return

  const existing = await ctx.db
    .query('products')
    .withIndex('by_userId_archived', (q) =>
      q.eq('userId', userId).eq('archivedAt', undefined),
    )
    .collect()

  if (existing.length >= limit) {
    await ctx.db.insert('billingEvents', {
      userId,
      mutationName,
      capability: 'product-limit',
      allowed: false,
      claimedPlan: row.plan,
      timestamp: Date.now(),
      context: 'enforcement',
    })
    throw billingError(
      'PRODUCT_LIMIT',
      `You have ${existing.length} products but your plan allows ${limit}. ` +
        `Archive products or upgrade.`,
    )
  }
}

// ─── Brand-kit limit ──────────────────────────────────────────────────────

/**
 * Assert the user is under their plan's brand-kit limit. Persistent count
 * (not period-anchored). Bypassed by the kill switch.
 */
export async function requireBrandKitLimit(
  ctx: MutationCtx,
  mutationName: string,
): Promise<BillingContext> {
  const billing = await getBillingContext(ctx)
  if (!billing) throw new Error('Not authenticated')
  if (!isBillingEnabled()) return billing

  if (!billing.hasKnownPlan) {
    if (isCacheTrusted(billing.syncedAt)) return billing
    await recordDenial(ctx, billing, mutationName, 'brand-kit-limit', billing.plan)
    throw billingError(
      'NO_SUBSCRIPTION',
      'No active subscription — choose a plan at /pricing',
    )
  }

  const plan = PLAN_CONFIG[billing.plan]
  const limit = plan.brandKitLimit
  if (limit === -1) return billing

  const existing = await ctx.db
    .query('brandKits')
    .withIndex('by_userId', (q) => q.eq('userId', billing.userId))
    .collect()

  if (existing.length >= limit) {
    await recordDenial(ctx, billing, mutationName, 'brand-kit-limit', billing.plan)
    throw billingError(
      'BRAND_KIT_LIMIT',
      `You have ${existing.length} brand kits but your plan allows ${limit}. ` +
        `Delete one or upgrade.`,
    )
  }

  return billing
}

// ─── Saved-template (swipe-file) limit ────────────────────────────────────

/**
 * Assert the user is under their plan's saved-template (swipe-file) limit.
 * Counts `productInspirations` rows owned by the user across all products.
 * Persistent count. Bypassed by the kill switch.
 */
export async function requireSavedTemplateLimit(
  ctx: MutationCtx,
  mutationName: string,
): Promise<BillingContext> {
  const billing = await getBillingContext(ctx)
  if (!billing) throw new Error('Not authenticated')
  if (!isBillingEnabled()) return billing

  if (!billing.hasKnownPlan) {
    if (isCacheTrusted(billing.syncedAt)) return billing
    await recordDenial(ctx, billing, mutationName, 'saved-template-limit', billing.plan)
    throw billingError(
      'NO_SUBSCRIPTION',
      'No active subscription — choose a plan at /pricing',
    )
  }

  const plan = PLAN_CONFIG[billing.plan]
  const limit = plan.savedTemplateLimit
  if (limit === -1) return billing

  const existing = await ctx.db
    .query('productInspirations')
    .withIndex('by_userId', (q) => q.eq('userId', billing.userId))
    .collect()

  if (existing.length >= limit) {
    await recordDenial(ctx, billing, mutationName, 'saved-template-limit', billing.plan)
    throw billingError(
      'SAVED_TEMPLATE_LIMIT',
      `Your swipe file holds ${existing.length} items but your plan allows ${limit}. ` +
        `Remove some or upgrade.`,
    )
  }

  return billing
}

// ─── Monthly credit quota ─────────────────────────────────────────────────

/**
 * First of the current UTC month as a Unix ms timestamp.
 * V1 uses calendar-month anchors for every user; subscription-anchor
 * billing periods are a post-webhook follow-up.
 */
export function startOfMonthUtc(now = Date.now()): number {
  const d = new Date(now)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0)
}

export async function countUsageSincePeriodStart(
  ctx: QueryCtx | MutationCtx,
  userId: string,
): Promise<number> {
  const row = await ctx.db
    .query('userPlans')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .unique()

  let since: number
  if (row?.periodStart !== undefined) {
    since = row.periodStart
  } else {
    since = startOfMonthUtc()
    // Only write the fallback event when called from a mutation context (has scheduler).
    if ('scheduler' in ctx) {
      await (ctx as MutationCtx).db.insert('billingEvents', {
        userId,
        mutationName: 'billing/index:countUsageSincePeriodStart',
        allowed: true,
        timestamp: Date.now(),
        context: 'period-fallback',
      })
      console.warn(
        `[billing] countUsageSincePeriodStart: no periodStart for user ${userId}, ` +
          'falling back to calendar-month anchor. Sync userPlans to fix.',
      )
    }
  }

  const rows = await ctx.db
    .query('billingEvents')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .filter((q) => q.gte(q.field('timestamp'), since))
    .collect()
  let sum = 0
  for (const r of rows) {
    if (r.context === 'usage' && r.allowed) {
      sum += r.units ?? 1
    }
  }
  return sum
}

/** @deprecated Use countUsageSincePeriodStart instead. */
export async function countUsageThisMonth(
  ctx: QueryCtx | MutationCtx,
  userId: string,
): Promise<number> {
  return countUsageSincePeriodStart(ctx, userId)
}

// ─── Audit helper ─────────────────────────────────────────────────────────

async function recordDenial(
  ctx: MutationCtx,
  billing: BillingContext,
  mutationName: string,
  capability: string,
  claimedPlan: string,
): Promise<void> {
  await ctx.db.insert('billingEvents', {
    userId: billing.userId,
    mutationName,
    capability,
    allowed: false,
    claimedPlan: claimedPlan || undefined,
    timestamp: Date.now(),
    context: 'enforcement',
  })
}

// Re-export commonly used types for convenience.
export { CAPABILITIES, type Capability } from './capabilities'
export { PLAN_CONFIG, type PlanConfig } from './planConfig'
export type { BillingContext } from './provider'
