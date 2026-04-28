import { v } from 'convex/values'
import { mutation, query, type MutationCtx } from './_generated/server'
import type { Doc } from './_generated/dataModel'

const ROLE_VALIDATOR = v.union(
  v.literal('ecom-store-owner'),
  v.literal('saas-founder'),
  v.literal('agency-freelancer'),
  v.literal('content-creator'),
  v.literal('local-service'),
  v.literal('nonprofit'),
  v.literal('something-else'),
)

export const getMyProfile = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null
    const userId = identity.tokenIdentifier

    const profile = await ctx.db
      .query('onboardingProfiles')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique()

    return profile
  },
})

async function getOrCreate(
  ctx: MutationCtx,
  userId: string,
): Promise<Doc<'onboardingProfiles'>> {
  const existing = await ctx.db
    .query('onboardingProfiles')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .unique()
  if (existing) return existing

  const id = await ctx.db.insert('onboardingProfiles', {
    userId,
    currentStep: 1,
    updatedAt: Date.now(),
  })
  const created = await ctx.db.get(id)
  if (!created) throw new Error('Failed to create onboarding profile')
  return created
}

export const setRole = mutation({
  args: { role: ROLE_VALIDATOR },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')
    const userId = identity.tokenIdentifier

    const profile = await getOrCreate(ctx, userId)
    await ctx.db.patch(profile._id, {
      role: args.role,
      currentStep: Math.max(profile.currentStep, 2),
      updatedAt: Date.now(),
    })
    return null
  },
})

export const advanceToPlanStep = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')
    const userId = identity.tokenIdentifier

    const profile = await getOrCreate(ctx, userId)
    await ctx.db.patch(profile._id, {
      currentStep: Math.max(profile.currentStep, 3),
      updatedAt: Date.now(),
    })
    return null
  },
})

export const completeOnboarding = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')
    const userId = identity.tokenIdentifier

    const profile = await getOrCreate(ctx, userId)
    if (profile.completedAt) return null
    await ctx.db.patch(profile._id, {
      currentStep: 4,
      completedAt: Date.now(),
      updatedAt: Date.now(),
    })
    return null
  },
})

// Used by the redirect guard. Treats a user as onboarded if EITHER:
//   - their profile has completedAt set, OR
//   - they're on a paid plan (covers the case where completeOnboarding
//     failed to fire post-checkout — Clerk has them paid, Convex should
//     not strand them in /onboarding), OR
//   - they have any pre-existing products (legacy users from before the
//     wizard existed).
export const getOnboardingStatus = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return { state: 'unauthenticated' as const }
    const userId = identity.tokenIdentifier

    const profile = await ctx.db
      .query('onboardingProfiles')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique()

    if (profile?.completedAt) {
      return { state: 'complete' as const, profile }
    }

    // Paid-plan rescue: if the user already has an active paid plan we
    // never want to keep them in onboarding — even if completeOnboarding
    // never fired (e.g. due to a prior client bug).
    const userPlan = await ctx.db
      .query('userPlans')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique()
    const planSlug = userPlan?.plan ?? ''
    const isPaidPlan = planSlug !== '' && planSlug !== 'free_user'
    if (isPaidPlan) {
      return { state: 'complete' as const, profile: profile ?? null }
    }

    // Backfill case: pre-existing user with products but no profile.
    const anyProduct = await ctx.db
      .query('products')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .first()

    if (anyProduct && !profile) {
      return { state: 'legacy' as const }
    }

    return {
      state: 'pending' as const,
      currentStep: profile?.currentStep ?? 1,
      role: profile?.role,
    }
  },
})
