/**
 * Declarative plan configuration — the app's view of pricing tiers.
 *
 * Sync constraint: plan slugs here MUST match Clerk dashboard plan slugs.
 * Clerk is source of truth for *which* capability a user has (via JWT).
 * This config is source of truth for *scalar limits* (productLimit,
 * monthlyCredits, brandKitLimit, etc.) which Clerk cannot express as
 * boolean features today.
 *
 * Convention: `-1` means unlimited.
 *
 * Adding a plan tier:
 *   1. Append an entry below with all required fields.
 *   2. Create a matching Plan in the Clerk dashboard with the identical slug.
 *   3. Assign the same capabilities to the plan in Clerk.
 *
 * Changing a scalar limit (e.g., raising Lite from 5 → 10 products): edit
 * this file only. Clerk dashboard unchanged.
 */
import { CAPABILITIES, type Capability } from './capabilities'

export type PlanConfig = {
  slug: string
  /** Max products (catalogue size). -1 = unlimited. */
  productLimit: number
  /** Image generations per billing period. -1 = unlimited. */
  monthlyCredits: number
  /** Ad copy generations per billing period. -1 = unlimited. */
  monthlyAdCopyLimit: number
  /** Distinct brand kits the user can create. -1 = unlimited. */
  brandKitLimit: number
  /** Saved-template (swipe-file) entries across all products. -1 = unlimited. */
  savedTemplateLimit: number
  /** Whether the user can upload custom templates (feature not yet built). */
  customTemplateUpload: boolean
  /** Whether the user gets priority support. */
  prioritySupport: boolean
  capabilities: readonly Capability[]
}

const ALL_CAPABILITIES: readonly Capability[] = [
  CAPABILITIES.GENERATE_VARIATIONS,
  CAPABILITIES.REMOVE_BACKGROUND,
  CAPABILITIES.BATCH_GENERATION,
  CAPABILITIES.AD_COPY,
]

export const PLAN_CONFIG: Record<string, PlanConfig> = {
  // Default Clerk slug for users who haven't subscribed to a paid plan.
  // Zero limits + zero capabilities — the trial gate forces paid signup
  // before any feature is usable.
  free_user: {
    slug: 'free_user',
    productLimit: 0,
    monthlyCredits: 0,
    monthlyAdCopyLimit: 0,
    brandKitLimit: 0,
    savedTemplateLimit: 0,
    customTemplateUpload: false,
    prioritySupport: false,
    capabilities: [],
  },
  lite: {
    slug: 'lite',
    productLimit: 5,
    monthlyCredits: 50,
    monthlyAdCopyLimit: 1000,
    brandKitLimit: 2,
    savedTemplateLimit: 50,
    customTemplateUpload: false,
    prioritySupport: false,
    capabilities: ALL_CAPABILITIES,
  },
  pro: {
    slug: 'pro',
    productLimit: 100,
    monthlyCredits: 150,
    monthlyAdCopyLimit: -1,
    brandKitLimit: 10,
    savedTemplateLimit: 250,
    customTemplateUpload: true,
    prioritySupport: false,
    capabilities: ALL_CAPABILITIES,
  },
  max: {
    slug: 'max',
    productLimit: -1,
    monthlyCredits: 400,
    monthlyAdCopyLimit: -1,
    brandKitLimit: -1,
    savedTemplateLimit: -1,
    customTemplateUpload: true,
    prioritySupport: true,
    capabilities: ALL_CAPABILITIES,
  },
}

export const ALL_PLAN_SLUGS: readonly string[] = Object.keys(PLAN_CONFIG)

/** True if the slug corresponds to a known plan. */
export function isKnownPlan(slug: string): boolean {
  return slug in PLAN_CONFIG
}

/** Helper: true when the limit field is "unlimited" (-1). */
export function isUnlimited(limit: number): boolean {
  return limit === -1
}
