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
import { query, type MutationCtx, type QueryCtx } from '../../_generated/server'
import { v } from 'convex/values'
import type { Capability } from './capabilities'
import { PLAN_CONFIG } from './planConfig'
import { ClerkBillingProvider } from './provider.clerk'
import type { BillingContext, BillingProvider } from './provider'

// ─── Provider instance (swap here to change providers) ────────────────────
export const billingProvider: BillingProvider = new ClerkBillingProvider()

// ─── Kill switch ──────────────────────────────────────────────────────────
function isBillingEnabled(): boolean {
  return process.env.BILLING_ENABLED === 'true'
}

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
    await recordDenial(ctx, billing, mutationName, capability, billing.plan)
    throw new Error('No active subscription — choose a plan at /pricing')
  }

  if (!billing.hasCapability(capability)) {
    await recordDenial(ctx, billing, mutationName, capability, billing.plan)
    throw new Error(
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
    await recordDenial(ctx, billing, mutationName, 'product-limit', billing.plan)
    throw new Error('No active subscription — choose a plan at /pricing')
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
    throw new Error(
      `You have ${existing.length} products but your plan allows ${limit}. ` +
        `Archive products or upgrade.`,
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

/**
 * Assert the user has at least `count` monthly credits remaining (default 1).
 * Throws on exhaustion with the reset-on-1st message. Does NOT consume
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
    await recordDenial(ctx, billing, mutationName, 'monthly-credits', billing.plan)
    throw new Error('No active subscription — choose a plan at /pricing')
  }

  const plan = PLAN_CONFIG[billing.plan]
  const used = await countUsageThisMonth(ctx, billing.userId)
  const remaining = plan.monthlyCredits - used

  if (remaining < count) {
    await recordDenial(ctx, billing, mutationName, 'monthly-credits', billing.plan)
    if (remaining <= 0) {
      throw new Error(
        `You have used all ${plan.monthlyCredits} credits for this month. ` +
          `Credits reset on the 1st.`,
      )
    }
    throw new Error(
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

async function countUsageThisMonth(
  ctx: QueryCtx | MutationCtx,
  userId: string,
): Promise<number> {
  const since = startOfMonthUtc()
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

// ─── Status query for UI ──────────────────────────────────────────────────

/**
 * Snapshot of the current user's billing state for UI rendering.
 * Used by the studio credits indicator and the post-checkout interstitial.
 */
export const getBillingStatus = query({
  args: {},
  handler: async (ctx) => {
    const billing = await billingProvider.getContext(ctx)
    if (!billing) {
      return {
        signedIn: false,
        plan: null,
        productCount: 0,
        productLimit: 0,
        creditsUsed: 0,
        creditsTotal: 0,
        resetsOn: null,
      }
    }

    const plan = billing.hasKnownPlan ? PLAN_CONFIG[billing.plan] : null
    const productLimit = plan?.productLimit ?? 0
    const creditsTotal = plan?.monthlyCredits ?? 0

    const products = await ctx.db
      .query('products')
      .withIndex('by_userId_archived', (q) =>
        q.eq('userId', billing.userId).eq('archivedAt', undefined),
      )
      .collect()

    const creditsUsed = await countUsageThisMonth(ctx, billing.userId)

    // Next-month anchor = first of following UTC month.
    const now = new Date()
    const nextReset = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)

    return {
      signedIn: true,
      plan: billing.plan || null,
      productCount: products.length,
      productLimit: productLimit === Infinity ? null : productLimit,
      creditsUsed,
      creditsTotal,
      resetsOn: nextReset,
    }
  },
})

// Re-export commonly used types for convenience.
export { CAPABILITIES, type Capability } from './capabilities'
export { PLAN_CONFIG, type PlanConfig } from './planConfig'
export type { BillingContext } from './provider'
