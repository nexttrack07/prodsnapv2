/**
 * Shared Ad Test validators.
 *
 * These are imported by both `convex/schema.ts` (table definitions) and
 * `convex/adTests.ts` (function argument validators) so the API contract can
 * never drift from the stored shape. See docs/specs/ad-test-ux-overhaul.md.
 */
import { v } from 'convex/values'

export const aspectRatio = v.union(
  v.literal('1:1'),
  v.literal('4:5'),
  v.literal('9:16'),
  v.literal('16:9'),
)

// `status` describes generation readiness ONLY. Exported/archived are derived
// from the `exportedAt` / `archivedAt` timestamps, never from `status`.
export const adTestStatus = v.union(
  v.literal('draft'),
  v.literal('generating'),
  v.literal('ready'),
  v.literal('partially_failed'),
  v.literal('failed'),
)

export const adTestSource = v.union(
  v.literal('starter'),
  v.literal('recommendation'),
  v.literal('winner_iteration'),
  v.literal('custom'),
)

// Placement → aspect ratio mapping:
//   feed_square   → 1:1
//   feed_vertical → 4:5
//   story_reel    → 9:16
//   landscape     → 16:9
export const adPlacement = v.union(
  v.literal('feed_square'),
  v.literal('feed_vertical'),
  v.literal('story_reel'),
  v.literal('landscape'),
)

/** Canonical placement → aspect ratio lookup used across generation + export. */
export const PLACEMENT_ASPECT_RATIO = {
  feed_square: '1:1',
  feed_vertical: '4:5',
  story_reel: '9:16',
  landscape: '16:9',
} as const

export const adTestAngle = v.object({
  key: v.string(),
  title: v.string(),
  description: v.optional(v.string()),
  hook: v.optional(v.string()),
  suggestedAdStyle: v.optional(v.string()),
  productAngleIndex: v.optional(v.number()),
  sourceGenerationId: v.optional(v.id('templateGenerations')),
})

export const copySuggestion = v.object({
  text: v.string(),
  angleKey: v.optional(v.string()),
  hook: v.optional(v.string()),
  variantIndex: v.number(),
})

export const copySetRequest = v.object({
  includeHeadlines: v.boolean(),
  headlineCount: v.number(),
  includePrimaryTexts: v.boolean(),
  primaryTextCount: v.number(),
  includeDescriptions: v.boolean(),
  descriptionCount: v.number(),
})

export const recommendedAdTestConcept = v.object({
  key: v.string(),
  title: v.string(),
  description: v.string(),
  source: v.union(
    v.literal('product_analysis'),
    v.literal('winner_iteration'),
    v.literal('starter'),
  ),
  angles: v.array(adTestAngle),
  prompts: v.optional(v.array(v.string())),
  placements: v.array(adPlacement),
  copyHooks: v.optional(v.array(v.string())),
  priority: v.number(),
  createdAt: v.number(),
})

export const performanceNotePlatform = v.union(
  v.literal('meta'),
  v.literal('tiktok'),
  v.literal('google'),
  v.literal('other'),
)
