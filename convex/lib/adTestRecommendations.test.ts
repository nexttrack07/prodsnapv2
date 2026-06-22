/// <reference types="vite/client" />
/**
 * Tests for the pure recommendation builder (issue #39):
 *   - empty angles → no concepts
 *   - starter concept is always first, priority 0, three placements
 *   - one concept per angle, bounded, priority-ordered, angle index stamped
 */
import { expect, test } from 'vitest'
import {
  buildRecommendedConcepts,
  type MarketingAngleInput,
} from './adTestRecommendations'

const angle = (n: number): MarketingAngleInput => ({
  title: `Angle ${n}`,
  description: `Why angle ${n} works`,
  hook: `Hook ${n}`,
  suggestedAdStyle: 'lifestyle UGC',
})

test('returns no concepts when there are no marketing angles', () => {
  expect(buildRecommendedConcepts([], 1000)).toEqual([])
})

test('builds a starter concept plus one concept per angle', () => {
  const concepts = buildRecommendedConcepts([angle(1), angle(2), angle(3)], 1000)
  expect(concepts).toHaveLength(4) // starter + 3 angles

  const starter = concepts[0]
  expect(starter.key).toBe('starter')
  expect(starter.source).toBe('starter')
  expect(starter.priority).toBe(0)
  expect(starter.placements).toEqual([
    'feed_square',
    'feed_vertical',
    'story_reel',
  ])
  expect(starter.angles[0].productAngleIndex).toBe(0)
  expect(starter.copyHooks).toEqual(['Hook 1'])

  // Angle concepts: source product_analysis, priority 1..n, two placements.
  expect(concepts.slice(1).map((c) => c.priority)).toEqual([1, 2, 3])
  expect(concepts[1].source).toBe('product_analysis')
  expect(concepts[1].key).toBe('angle_0')
  expect(concepts[1].placements).toEqual(['feed_square', 'feed_vertical'])
  expect(concepts[1].angles[0].title).toBe('Angle 1')
  expect(concepts[3].angles[0].productAngleIndex).toBe(2)
})

test('caps angle-derived concepts at five (six total with starter)', () => {
  const many = Array.from({ length: 8 }, (_, i) => angle(i))
  const concepts = buildRecommendedConcepts(many, 1000)
  expect(concepts).toHaveLength(6) // starter + 5
  expect(concepts.every((c) => c.createdAt === 1000)).toBe(true)
})
