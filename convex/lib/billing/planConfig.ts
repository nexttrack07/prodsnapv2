/**
 * Declarative plan configuration — the app's view of pricing tiers.
 *
 * Sync constraint: plan slugs here MUST match Clerk dashboard plan slugs.
 * Clerk is source of truth for *which* capability a user has (via JWT).
 * This config is source of truth for *scalar limits* (productLimit,
 * monthlyCredits) which Clerk cannot express as boolean features today.
 *
 * Adding a plan tier:
 *   1. Append an entry below with slug, productLimit, monthlyCredits, capabilities.
 *   2. Create a matching Plan in the Clerk dashboard with the identical slug.
 *   3. Assign the same capabilities to the plan in Clerk.
 *
 * Changing a scalar limit (e.g., raising Basic from 5 → 10 products): edit
 * this file only. Clerk dashboard unchanged.
 */
import { CAPABILITIES, type Capability } from './capabilities'

export type PlanConfig = {
  slug: string
  productLimit: number
  monthlyCredits: number
  capabilities: readonly Capability[]
}

const ALL_CAPABILITIES: readonly Capability[] = [
  CAPABILITIES.GENERATE_VARIATIONS,
  CAPABILITIES.REMOVE_BACKGROUND,
  CAPABILITIES.HD_OUTPUT,
  CAPABILITIES.ADVANCED_TEMPLATES,
  CAPABILITIES.BATCH_GENERATION,
]

export const PLAN_CONFIG: Record<string, PlanConfig> = {
  // Default Clerk slug for users who haven't subscribed to a paid plan.
  // Zero limits + zero capabilities — the trial gate forces paid signup
  // before any feature is usable.
  free_user: {
    slug: 'free_user',
    productLimit: 0,
    monthlyCredits: 0,
    capabilities: [],
  },
  basic: {
    slug: 'basic',
    productLimit: 5,
    monthlyCredits: 100,
    capabilities: ALL_CAPABILITIES,
  },
  pro: {
    slug: 'pro',
    productLimit: 20,
    monthlyCredits: 500,
    capabilities: ALL_CAPABILITIES,
  },
}

export const ALL_PLAN_SLUGS: readonly string[] = Object.keys(PLAN_CONFIG)

/** True if the slug corresponds to a known plan. */
export function isKnownPlan(slug: string): boolean {
  return slug in PLAN_CONFIG
}
