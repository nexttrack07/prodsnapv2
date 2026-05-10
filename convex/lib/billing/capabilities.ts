/**
 * Central capability registry — the ONLY file that declares capability slugs.
 *
 * Every paid capability in the app is represented here. Slugs MUST match
 * the Clerk dashboard's Feature slugs exactly (the enforcement layer reads
 * them from the JWT `fea` claim). Consistency is enforced at test time by
 * `tests/billing-gates.test.ts`.
 *
 * Adding a capability:
 *   1. Append a CAPABILITIES entry here.
 *   2. Add it to `PLAN_CONFIG` in `planConfig.ts` for each plan that includes it.
 *   3. Create a matching Feature in the Clerk dashboard with the identical slug.
 *   4. Wrap the paid code path with `requireCapability(ctx, CAPABILITIES.X)`.
 *
 * Never reference a capability slug as a raw string outside this file.
 */
// NOTE: Clerk forces underscores in plan + feature slugs (hyphens are
// rejected at dashboard save time and normalized to underscores). Our
// capability slugs therefore use underscores to match what Clerk returns
// from the Billing API. When creating features in the Clerk dashboard,
// enter the exact slugs below.
export const CAPABILITIES = {
  GENERATE_VARIATIONS: 'variations',
  REMOVE_BACKGROUND: 'background_removal',
  BATCH_GENERATION: 'batch_generation',
} as const

export type Capability = typeof CAPABILITIES[keyof typeof CAPABILITIES]

/** All declared capability slugs, for consistency checks in tests. */
export const ALL_CAPABILITY_SLUGS: readonly Capability[] = Object.values(CAPABILITIES)
