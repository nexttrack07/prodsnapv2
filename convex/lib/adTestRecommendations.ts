/**
 * Pure builder that turns a product's marketing angles into persisted
 * "what to test next" concepts (issue #39). Kept free of Convex ctx so the
 * concept shape + priority logic is unit-testable; the DB write lives in
 * `products.saveProductAnalysis`.
 *
 * These are PERSISTED concepts, not query-time LLM calls — Home reads the
 * stored `adTestRecommendations` rows directly. See
 * docs/specs/ad-test-ux-overhaul.md (Workstream 2).
 */
import type {
  AdPlacementValue,
  AdTestAngleValue,
  RecommendedConcept,
} from './adTestValidators'

/** Minimal shape we need off each `products.marketingAngles` entry. */
export type MarketingAngleInput = {
  title: string
  description: string
  hook: string
  suggestedAdStyle: string
}

// The fixed starter shape (one concept × three placements) the spec calls for:
// feed + vertical + story = a real first multi-placement test.
const STARTER_PLACEMENTS: AdPlacementValue[] = [
  'feed_square',
  'feed_vertical',
  'story_reel',
]
// Angle-derived concepts default to the two feed placements — a focused test
// the buyer can widen later.
const ANGLE_PLACEMENTS: AdPlacementValue[] = ['feed_square', 'feed_vertical']

// Cap angle-derived concepts so the shelf stays scannable; with the starter
// concept this yields 4–6 recommendations for a typical 3–5 angle analysis.
const MAX_ANGLE_CONCEPTS = 5

function angleFrom(a: MarketingAngleInput, index: number): AdTestAngleValue {
  return {
    key: `angle_${index}`,
    title: a.title,
    description: a.description,
    hook: a.hook,
    suggestedAdStyle: a.suggestedAdStyle,
    productAngleIndex: index,
  }
}

/**
 * Builds the persisted recommendation concepts for a freshly-analyzed product.
 * Concept[0] is always the starter (priority 0, lowest = shown first); the rest
 * are one-angle concepts ordered by the analysis's angle order. Returns [] when
 * there are no angles to derive from.
 */
export function buildRecommendedConcepts(
  marketingAngles: MarketingAngleInput[],
  now: number,
): RecommendedConcept[] {
  const concepts: RecommendedConcept[] = []
  const first = marketingAngles[0]
  if (!first) return concepts

  // Starter — the fastest path to a first multi-placement test.
  concepts.push({
    key: 'starter',
    title: 'Run your first Ad Test',
    description: `A quick starter set across feed and story placements using "${first.title}".`,
    source: 'starter',
    angles: [angleFrom(first, 0)],
    placements: STARTER_PLACEMENTS,
    copyHooks: first.hook ? [first.hook] : undefined,
    priority: 0,
    createdAt: now,
  })

  // One concept per marketing angle (bounded).
  marketingAngles.slice(0, MAX_ANGLE_CONCEPTS).forEach((a, i) => {
    concepts.push({
      key: `angle_${i}`,
      title: a.title,
      description: a.description,
      source: 'product_analysis',
      angles: [angleFrom(a, i)],
      placements: ANGLE_PLACEMENTS,
      copyHooks: a.hook ? [a.hook] : undefined,
      priority: i + 1,
      createdAt: now,
    })
  })

  return concepts
}
