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

// ─── Copy Bank helpers ────────────────────────────────────────────────────────

// Meta `call_to_action_type` values used for DTC ads. The Copy Bank recommends
// ONE of these as a platform button — CTA is a button selection, never
// free-form prose, so it is stored/exported separately from headlines/body.
// Kept as a plain string on the row (recommendedCtaButton) so the platform
// list can grow without a schema migration; this array is the validation set.
export const META_CTA_BUTTONS = [
  'SHOP_NOW',
  'LEARN_MORE',
  'SIGN_UP',
  'SUBSCRIBE',
  'GET_OFFER',
  'ORDER_NOW',
  'DOWNLOAD',
  'GET_QUOTE',
  'CONTACT_US',
  'APPLY_NOW',
  'BOOK_TRAVEL',
  'BUY_TICKETS',
  'SEE_MENU',
  'WATCH_MORE',
] as const

export type MetaCtaButton = (typeof META_CTA_BUTTONS)[number]

/** Upper bound on suggestions requested per field in one Copy Bank request. */
export const MAX_COPY_COUNT_PER_FIELD = 20

/** Structural shape of a `copySetRequest`, usable without importing schema. */
export type CopySetRequestInput = {
  includeHeadlines: boolean
  headlineCount: number
  includePrimaryTexts: boolean
  primaryTextCount: number
  includeDescriptions: boolean
  descriptionCount: number
}

export type NormalizedCopyCounts = {
  headlineCount: number
  primaryTextCount: number
  descriptionCount: number
}

/** Validates one field's count; a non-included field always resolves to 0. */
function resolveFieldCount(
  include: boolean,
  count: number,
  label: string,
): number {
  if (!include) return 0
  if (!Number.isInteger(count)) {
    throw new Error(`${label} count must be a whole number`)
  }
  if (count < 0) throw new Error(`${label} count cannot be negative`)
  if (count > MAX_COPY_COUNT_PER_FIELD) {
    throw new Error(`${label} count cannot exceed ${MAX_COPY_COUNT_PER_FIELD}`)
  }
  return count
}

/**
 * Validates a copySetRequest and returns the effective per-field counts (a
 * field that isn't included resolves to 0 regardless of its count). Throws if
 * no field is included or the request asks for zero total suggestions, so a
 * Copy Bank row is never created empty.
 */
export function normalizeCopySetRequest(
  request: CopySetRequestInput,
): NormalizedCopyCounts {
  const headlineCount = resolveFieldCount(
    request.includeHeadlines,
    request.headlineCount,
    'Headline',
  )
  const primaryTextCount = resolveFieldCount(
    request.includePrimaryTexts,
    request.primaryTextCount,
    'Primary text',
  )
  const descriptionCount = resolveFieldCount(
    request.includeDescriptions,
    request.descriptionCount,
    'Description',
  )

  if (
    !request.includeHeadlines &&
    !request.includePrimaryTexts &&
    !request.includeDescriptions
  ) {
    throw new Error('Select at least one copy field to generate')
  }
  if (headlineCount + primaryTextCount + descriptionCount === 0) {
    throw new Error('Request at least one suggestion to generate')
  }

  return { headlineCount, primaryTextCount, descriptionCount }
}

/**
 * Throws if a generated copy result has fewer suggestions than requested in any
 * field. Both the request contract and the LLM prompt promise EXACT counts, so
 * a short result is a generation failure the caller should surface/retry — not
 * silently persist a Copy Bank that's smaller than what the buyer asked for.
 */
export function assertCopyCountsMet(
  got: {
    headlines: readonly unknown[]
    primaryTexts: readonly unknown[]
    descriptions: readonly unknown[]
  },
  want: NormalizedCopyCounts,
): void {
  const shortfalls: string[] = []
  if (got.headlines.length < want.headlineCount) {
    shortfalls.push(`headlines (${got.headlines.length}/${want.headlineCount})`)
  }
  if (got.primaryTexts.length < want.primaryTextCount) {
    shortfalls.push(
      `primary texts (${got.primaryTexts.length}/${want.primaryTextCount})`,
    )
  }
  if (got.descriptions.length < want.descriptionCount) {
    shortfalls.push(
      `descriptions (${got.descriptions.length}/${want.descriptionCount})`,
    )
  }
  if (shortfalls.length > 0) {
    throw new Error(
      `Copy generation returned fewer suggestions than requested: ${shortfalls.join(
        ', ',
      )}. Please try again.`,
    )
  }
}

/**
 * Coerces a free-form CTA string into a supported Meta button value, or
 * undefined if it doesn't map to one. Normalizes spacing/casing/hyphens so
 * "shop now" and "Shop-Now" both resolve to SHOP_NOW.
 */
export function normalizeCtaButton(
  raw: string | undefined | null,
): MetaCtaButton | undefined {
  if (!raw) return undefined
  const normalized = raw.trim().toUpperCase().replace(/[\s-]+/g, '_')
  return (META_CTA_BUTTONS as readonly string[]).includes(normalized)
    ? (normalized as MetaCtaButton)
    : undefined
}
