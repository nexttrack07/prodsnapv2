/**
 * DEPRECATED — kept for future expansion.
 *
 * Originally this file was going to extract billing claims (`pla`, `fea`)
 * from the JWT. Clerk reserves those claim names and disallows them in
 * custom JWT templates (which Convex uses). We pivoted to reading plan
 * state from the `userPlans` Convex table (populated via Clerk's Backend
 * API through the `billing/syncPlan:syncUserPlan` action).
 *
 * If Clerk ever exposes billing state in JWTs for custom templates, or
 * we switch to a different identity provider that DOES, resurrect this
 * module to handle the claim extraction.
 *
 * See `provider.clerk.ts` for the current active plan-resolution path.
 */
export type BillingClaims = {
  plan: string
  capabilities: string[]
}
