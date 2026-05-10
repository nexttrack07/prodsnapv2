/**
 * Public billing API — the only billing module that mutations import.
 *
 * Contract:
 *   - `getBillingContext` for read access to plan/capability state.
 *   - `requireCapability` for boolean gates (TypeScript-checked against Capability).
 *   - `requireProductLimit` for scalar product-count enforcement.
 *   - `requireCredit` + `recordCreditUse` for monthly credit quota enforcement.
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
import type { Capability } from './capabilities'
import { PLAN_CONFIG } from './planConfig'
import { ClerkBillingProvider } from './provider.clerk'
import type { BillingContext, BillingProvider } from './provider'
import { internal } from '../../_generated/api'
import { billingError } from './errors'

// ─── Provider instance (swap here to change providers) ────────────────────
export const billingProvider: BillingProvider = new ClerkBillingProvider()

// ─── Kill switch ──────────────────────────────────────────────────────────
function isBillingEnabled(): boolean {
  return process.env.BILLING_ENABLED === 'true'
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
  if (limit === Infinity) return billing

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
  if (limit === Infinity) return

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

/**
 * Assert the user has at least `count` monthly credits remaining (default 1).
 * Throws on exhaustion with the billing-period reset date. Does NOT consume
 * credits — call `recordCreditUse` for each consumption after success.
 *
 * Counting rule: every generation attempt consumes one credit regardless of
 * success/failure. The caller is expected to call `recordCreditUse` before
 * scheduling downstream API work so retries/failures still count.
 *
 * For batched generation (e.g., 3 templates × 4 variations = 12 credits),
 * call `requireCredit(ctx, name, 12)` once upfront to fail fast, then call
 * `recordCreditUse` 12 times as the rows are inserted.
 */
export async function requireCredit(
  ctx: MutationCtx,
  mutationName: string,
  count = 1,
): Promise<BillingContext> {
  const billing = await getBillingContext(ctx)
  if (!billing) throw new Error('Not authenticated')

  if (!isBillingEnabled()) return billing

  if (!billing.hasKnownPlan) {
    // BILLING_TRUST_CACHE: allow access when cache is fresh enough during outage.
    if (isCacheTrusted(billing.syncedAt)) return billing
    await recordDenial(ctx, billing, mutationName, 'monthly-credits', billing.plan)
    throw billingError(
      'NO_SUBSCRIPTION',
      'No active subscription — choose a plan at /pricing',
    )
  }

  // Layer 3: stale-period fallback — fire-and-forget sync if period has expired.
  const row = await ctx.db
    .query('userPlans')
    .withIndex('by_userId', (q) => q.eq('userId', billing.userId))
    .unique()
  const now = Date.now()
  const periodExpired = row?.periodEnd && row.periodEnd < now
  const debounceOk = !row?.syncedAt || row.syncedAt + 30_000 < now
  if (periodExpired && debounceOk && row?.clerkUserId) {
    await ctx.db.insert('billingEvents', {
      userId: billing.userId,
      mutationName,
      capability: 'monthly-credits',
      allowed: true,
      timestamp: now,
      context: 'stale-period-fallback',
    })
    await ctx.scheduler.runAfter(
      0,
      internal.billing.syncPlan.syncUserPlanInternal,
      { userId: billing.userId, clerkUserId: row.clerkUserId },
    )
  }

  const plan = PLAN_CONFIG[billing.plan]
  const used = await countUsageSincePeriodStart(ctx, billing.userId)
  const remaining = plan.monthlyCredits - used

  if (remaining < count) {
    await recordDenial(ctx, billing, mutationName, 'monthly-credits', billing.plan)
    // Build reset date from periodEnd or start of next month as fallback.
    const resetMs = row?.periodEnd ?? startOfMonthUtc(now + 32 * 24 * 60 * 60 * 1000)
    const resetDate = new Date(resetMs).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    })
    // Append retry hint when period just rolled (within last 2 minutes).
    const justRenewed =
      row?.periodEnd && row.periodEnd > now - 2 * 60 * 1000 && row.periodEnd <= now
    const retrySuffix = justRenewed
      ? ' If you just renewed, please retry in a few seconds.'
      : ''
    if (remaining <= 0) {
      throw billingError(
        'CREDITS_EXHAUSTED',
        `You've used all ${plan.monthlyCredits} credits for this billing period. ` +
          `Credits reset on ${resetDate}.${retrySuffix}`,
      )
    }
    throw billingError(
      'CREDITS_INSUFFICIENT',
      `Not enough credits. This request needs ${count} but you have ${remaining} remaining. ` +
        `Upgrade or reduce the request size.`,
    )
  }

  return billing
}

/**
 * Append a usage row to `billingEvents`, consuming one credit of the user's
 * monthly quota. Call immediately after `requireCredit` returns, before
 * scheduling the downstream workflow/action.
 */
export async function recordCreditUse(
  ctx: MutationCtx,
  billing: BillingContext,
  mutationName: string,
  capability: Capability,
): Promise<void> {
  await ctx.db.insert('billingEvents', {
    userId: billing.userId,
    mutationName,
    capability,
    allowed: true,
    claimedPlan: billing.plan || undefined,
    timestamp: Date.now(),
    units: 1,
    context: 'usage',
  })
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
