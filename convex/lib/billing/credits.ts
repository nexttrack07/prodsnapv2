/**
 * Credit helpers — pure helper functions (no mutation()/query() wrappers).
 *
 * Units: all storage is integer milliCredits (mc). 1 credit = 1000 mc.
 * Floats only appear at the display boundary via mcToCredits().
 */
import type { MutationCtx, QueryCtx } from '../../_generated/server'
import { PLAN_CONFIG } from './planConfig'
import { billingError } from './errors'
import { getBillingContext } from './index'

// ─── Constants ────────────────────────────────────────────────────────────────

export const MC_PER_CREDIT = 1000

// ─── Conversions ─────────────────────────────────────────────────────────────

/** Convert whole credits to milliCredits. Only boundary float↔int allowed. */
export function creditsToMc(credits: number): number {
  return Math.round(credits * MC_PER_CREDIT)
}

/** Convert milliCredits to whole credits for display only. */
export function mcToCredits(mc: number): number {
  return mc / MC_PER_CREDIT
}

// ─── Pre-flight check ────────────────────────────────────────────────────────

/**
 * Assert the authenticated user has enough credits for `units` charges of
 * modelKey (units defaults to 1; pass the batch size for multi-generation
 * submits so the whole batch is gated up front). Throws CREDITS_EXHAUSTED if
 * insufficient. Does NOT consume credits — call chargeCredits after each
 * operation succeeds.
 */
export async function requireCredits(
  ctx: MutationCtx,
  modelKey: string,
  units = 1,
): Promise<{ userId: string; requiredMc: number }> {
  const billing = await getBillingContext(ctx)
  if (!billing) throw new Error('Not authenticated')
  const { userId } = billing

  const pricing = await ctx.db
    .query('creditPricing')
    .withIndex('by_modelKey', (q) => q.eq('modelKey', modelKey))
    .unique()

  if (!pricing || !pricing.active) {
    throw billingError('UNKNOWN_MODEL', `No pricing for model: ${modelKey}`)
  }

  const balance = await ctx.db
    .query('creditBalances')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .unique()

  if (!balance) {
    throw billingError(
      'CREDITS_EXHAUSTED',
      'No credit balance — plan not yet provisioned',
    )
  }

  const availableMc =
    balance.planAllowanceMc - balance.planUsedMc + balance.topupBalanceMc

  const requiredMc = pricing.creditsMc * Math.max(1, units)
  if (availableMc < requiredMc) {
    throw billingError(
      'CREDITS_EXHAUSTED',
      `Insufficient credits for ${modelKey}`,
    )
  }

  return { userId, requiredMc }
}

// ─── Post-success decrement ───────────────────────────────────────────────────

/**
 * Deduct credits for a completed AI operation. Plan allowance is consumed
 * first; top-up balance covers the remainder.
 */
export async function chargeCredits(
  ctx: MutationCtx,
  args: {
    userId: string
    modelKey: string
    metadata?: Record<string, unknown>
  },
): Promise<{
  creditsCharged: number
  planUsedDeltaMc: number
  topupDeltaMc: number
  remainingMc: number
}> {
  const pricing = await ctx.db
    .query('creditPricing')
    .withIndex('by_modelKey', (q) => q.eq('modelKey', args.modelKey))
    .unique()

  if (!pricing || !pricing.active) {
    throw billingError('UNKNOWN_MODEL', `No pricing for model: ${args.modelKey}`)
  }

  const balance = await ctx.db
    .query('creditBalances')
    .withIndex('by_userId', (q) => q.eq('userId', args.userId))
    .unique()

  if (!balance) {
    throw billingError(
      'CREDITS_EXHAUSTED',
      'No credit balance — plan not yet provisioned',
    )
  }

  const { creditsMc } = pricing
  const planHeadroom = Math.max(0, balance.planAllowanceMc - balance.planUsedMc)
  const availableMc = planHeadroom + balance.topupBalanceMc

  // Guard against overdraft. Frontend disables the button when low; this is
  // the backend backstop for concurrent-action races where two parallel
  // generations both clear the frontend check but only one fits in budget.
  if (availableMc < creditsMc) {
    throw billingError(
      'CREDITS_EXHAUSTED',
      `Insufficient credits for ${args.modelKey}`,
    )
  }

  const planUsedDeltaMc = Math.min(creditsMc, planHeadroom)
  const topupDeltaMc = creditsMc - planUsedDeltaMc

  const now = Date.now()

  await ctx.db.patch(balance._id, {
    planUsedMc: balance.planUsedMc + planUsedDeltaMc,
    topupBalanceMc: balance.topupBalanceMc - topupDeltaMc,
    version: balance.version + 1,
    updatedAt: now,
  })

  // Look up plan slug for the billing event.
  const userPlan = await ctx.db
    .query('userPlans')
    .withIndex('by_userId', (q) => q.eq('userId', args.userId))
    .unique()

  const noteValue =
    typeof args.metadata?.note === 'string' ? args.metadata.note : undefined

  await ctx.db.insert('billingEvents', {
    userId: args.userId,
    mutationName: 'chargeCredits',
    allowed: true,
    claimedPlan: userPlan?.plan || undefined,
    timestamp: now,
    units: 1,
    context: 'credit-charge',
    metadata: {
      kind: 'credit' as const,
      modelKey: args.modelKey,
      creditsMc,
      planUsedDeltaMc,
      topupDeltaMc,
      ...(noteValue !== undefined ? { note: noteValue } : {}),
    },
  })

  const remainingMc =
    balance.planAllowanceMc -
    (balance.planUsedMc + planUsedDeltaMc) +
    (balance.topupBalanceMc - topupDeltaMc)

  return {
    creditsCharged: mcToCredits(creditsMc),
    planUsedDeltaMc,
    topupDeltaMc,
    remainingMc,
  }
}

// ─── Frontend read API ────────────────────────────────────────────────────────

/**
 * Return the user's current credit balance for display. Returns null when
 * no balance row exists yet (pre-grant state).
 */
export async function getCreditBalance(
  ctx: QueryCtx,
  userId: string,
): Promise<{
  creditsRemaining: number
  planRemainingMc: number
  topupBalanceMc: number
  periodEnd: number
  planSlug: string
} | null> {
  const balance = await ctx.db
    .query('creditBalances')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .unique()

  if (!balance) return null

  const userPlan = await ctx.db
    .query('userPlans')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .unique()

  const planRemainingMc = Math.max(
    0,
    balance.planAllowanceMc - balance.planUsedMc,
  )
  const availableMc = planRemainingMc + balance.topupBalanceMc

  return {
    creditsRemaining: Math.floor(mcToCredits(availableMc)),
    planRemainingMc,
    topupBalanceMc: balance.topupBalanceMc,
    periodEnd: balance.periodEnd,
    planSlug: userPlan?.plan ?? '',
  }
}

// ─── Period grant ─────────────────────────────────────────────────────────────

/**
 * Grant the plan's credit allowance for a new billing period.
 * Idempotent: if the same (periodStart, planSlug) has already been granted,
 * returns { granted: false, reason: 'already-granted-this-period' }.
 */
export async function grantPlanCredits(
  ctx: MutationCtx,
  args: {
    userId: string
    planSlug: 'free' | 'lite' | 'pro' | 'max'
    periodStart: number
    periodEnd: number
  },
): Promise<{ granted: boolean; reason?: 'already-granted-this-period' }> {
  // Map 'free' → 'free_user' for the plan config lookup.
  const configSlug = args.planSlug === 'free' ? 'free_user' : args.planSlug
  const planConfig = PLAN_CONFIG[configSlug]
  const allowanceMc = creditsToMc(planConfig?.imageCredits ?? 0)

  const existing = await ctx.db
    .query('creditBalances')
    .withIndex('by_userId', (q) => q.eq('userId', args.userId))
    .unique()

  // Defense-in-depth: never overwrite a starter grant with a free-tier
  // (zero-credit) grant. Starter users have no Clerk subscription so no
  // webhook should fire for them, but guard here as a backstop.
  if (existing?.lastGrantedPlanSlug === 'starter' && args.planSlug === 'free') {
    return { granted: false, reason: 'already-granted-this-period' }
  }

  // Idempotency check.
  if (
    existing &&
    existing.lastGrantedPeriodStart === args.periodStart &&
    existing.lastGrantedPlanSlug === args.planSlug
  ) {
    return { granted: false, reason: 'already-granted-this-period' }
  }

  const now = Date.now()

  if (!existing) {
    await ctx.db.insert('creditBalances', {
      userId: args.userId,
      planAllowanceMc: allowanceMc,
      planUsedMc: 0,
      topupBalanceMc: 0,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      version: 1,
      lastGrantedPeriodStart: args.periodStart,
      lastGrantedPlanSlug: args.planSlug,
      updatedAt: now,
    })
  } else {
    await ctx.db.patch(existing._id, {
      planAllowanceMc: allowanceMc,
      planUsedMc: 0,
      topupBalanceMc: existing.topupBalanceMc,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      version: existing.version + 1,
      lastGrantedPeriodStart: args.periodStart,
      lastGrantedPlanSlug: args.planSlug,
      updatedAt: now,
    })
  }

  await ctx.db.insert('billingEvents', {
    userId: args.userId,
    mutationName: 'grantPlanCredits',
    allowed: true,
    claimedPlan: args.planSlug,
    timestamp: now,
    context: 'credit-grant',
    metadata: {
      kind: 'credit-grant' as const,
      planSlug: args.planSlug,
      allowanceMc,
      ...(existing?.lastGrantedPlanSlug &&
      existing.lastGrantedPlanSlug !== args.planSlug
        ? { previousPlanSlug: existing.lastGrantedPlanSlug }
        : {}),
    },
  })

  return { granted: true }
}

// ─── Mid-period plan upgrade adjustment ──────────────────────────────────────

/**
 * Add the delta allowance when a user upgrades mid-period.
 * No-op on downgrade (deltaMc ≤ 0) or when no balance row exists yet.
 */
export async function upgradeAdjustCredits(
  ctx: MutationCtx,
  args: {
    userId: string
    oldPlanSlug: 'free' | 'lite' | 'pro' | 'max'
    newPlanSlug: 'free' | 'lite' | 'pro' | 'max'
    periodStart: number
  },
): Promise<{ adjusted: boolean; deltaMc: number }> {
  const toConfigSlug = (slug: string) =>
    slug === 'free' ? 'free_user' : slug

  const oldAllowanceMc = creditsToMc(
    PLAN_CONFIG[toConfigSlug(args.oldPlanSlug)]?.imageCredits ?? 0,
  )
  const newAllowanceMc = creditsToMc(
    PLAN_CONFIG[toConfigSlug(args.newPlanSlug)]?.imageCredits ?? 0,
  )
  const deltaMc = newAllowanceMc - oldAllowanceMc

  if (deltaMc <= 0) {
    await ctx.db.insert('adminAuditEvents', {
      adminUserId: args.userId,
      targetUserId: args.userId,
      action: 'mid-period-downgrade-noop',
      details: {
        oldPlanSlug: args.oldPlanSlug,
        newPlanSlug: args.newPlanSlug,
        deltaMc,
        reason: 'mid-period plan downgrade — preserves current period allowance',
      },
      at: Date.now(),
    })
    return { adjusted: false, deltaMc: 0 }
  }

  const existing = await ctx.db
    .query('creditBalances')
    .withIndex('by_userId', (q) => q.eq('userId', args.userId))
    .unique()

  if (!existing) {
    // No row yet — grant will provision at the new allowance.
    return { adjusted: false, deltaMc: 0 }
  }

  const now = Date.now()

  await ctx.db.patch(existing._id, {
    planAllowanceMc: existing.planAllowanceMc + deltaMc,
    lastGrantedPlanSlug: args.newPlanSlug,
    version: existing.version + 1,
    updatedAt: now,
  })

  await ctx.db.insert('adminAuditEvents', {
    adminUserId: args.userId,
    action: 'mid-period-upgrade',
    targetUserId: args.userId,
    details: {
      before: { planAllowanceMc: existing.planAllowanceMc, planSlug: args.oldPlanSlug },
      after: { planAllowanceMc: existing.planAllowanceMc + deltaMc, planSlug: args.newPlanSlug },
      reason: 'mid-period plan change',
    },
    at: now,
  })

  return { adjusted: true, deltaMc }
}
