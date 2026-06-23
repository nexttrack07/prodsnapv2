/**
 * Ad Test backend API (foundation).
 *
 * An Ad Test is a named set of complete ad units created to answer one
 * performance question. Generated creatives live in `templateGenerations`,
 * linked by `adTestId`; this module owns the Ad Test rows, their summary
 * counters, derived status, performance notes, and the export manifest.
 *
 * Source of truth: docs/specs/ad-test-ux-overhaul.md.
 *
 * Authorization rule: every public function derives the user id from
 * `ctx.auth.getUserIdentity().tokenIdentifier`. We never accept a userId from
 * the client. Ownership is checked against `adTests.userId` (and the parent
 * `products.userId`) before any read or write.
 *
 * Scope note (issue #32): this is the foundational data model + CRUD. Functions
 * that fan out generation rows (`startGeneration`, `createAndStartRecommended`),
 * the Copy Bank generator (`generateCopySet`), and the server-side export
 * (`getExportManifest` consumers) are wired up in later issues (#33, #37, #38).
 */
import { v } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import {
  type MutationCtx,
  type QueryCtx,
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server'
import { internal } from './_generated/api'
import { workflow } from './studio'
import { enforceGenerationRateLimit, recordGenerationUsage } from './products'
import { requireCredits } from './lib/billing/credits'
import { hasPaidPlanAccess } from './lib/billing'
import { billingError } from './lib/billing/errors'
import type { ExportCopySet } from './lib/adTestExportCsv'
import {
  PLACEMENT_ASPECT_RATIO,
  adPlacement,
  adTestAngle,
  adTestSource,
  copySetRequest,
  copySuggestion,
  normalizeCopySetRequest,
  normalizeCtaButton,
  performanceNotePlatform,
} from './lib/adTestValidators'

// Bounded read for a single Ad Test's generated rows. A test set is small
// (angles × placements × variations); this cap exists only to keep the query
// from ever scanning an unbounded number of rows.
const MAX_AD_UNITS_PER_TEST = 1000

// ─── Auth helpers ──────────────────────────────────────────────────────────

/** Returns the authenticated user's stable id (Clerk JWT). Throws if absent. */
async function requireAuth(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error('Not authenticated')
  return identity.tokenIdentifier
}

/** Returns the authenticated user's id, or null if not authenticated. */
async function getAuthUserId(
  ctx: QueryCtx | MutationCtx,
): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity()
  return identity?.tokenIdentifier ?? null
}

/**
 * Loads an Ad Test and verifies the caller owns it. Throws on missing or
 * non-owned tests with the same message, so existence isn't leaked to
 * non-owners.
 */
async function requireOwnedAdTest(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  adTestId: Id<'adTests'>,
): Promise<Doc<'adTests'>> {
  const adTest = await ctx.db.get(adTestId)
  if (!adTest || adTest.userId !== userId) throw new Error('Ad Test not found')
  return adTest
}

/**
 * Loads a product and verifies the caller owns it. Legacy products without a
 * userId are treated as unowned and rejected for Ad Test creation.
 */
async function requireOwnedProduct(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  productId: Id<'products'>,
): Promise<Doc<'products'>> {
  const product = await ctx.db.get(productId)
  if (!product || product.userId !== userId) {
    throw new Error('Product not found')
  }
  return product
}

/** Distinct aspect ratios implied by a set of placements, order-preserving. */
function aspectRatiosForPlacements(
  placements: Array<keyof typeof PLACEMENT_ASPECT_RATIO>,
): Array<(typeof PLACEMENT_ASPECT_RATIO)[keyof typeof PLACEMENT_ASPECT_RATIO]> {
  const seen = new Set<string>()
  const out: Array<
    (typeof PLACEMENT_ASPECT_RATIO)[keyof typeof PLACEMENT_ASPECT_RATIO]
  > = []
  for (const placement of placements) {
    const ar = PLACEMENT_ASPECT_RATIO[placement]
    if (!seen.has(ar)) {
      seen.add(ar)
      out.push(ar)
    }
  }
  return out
}

/**
 * Image file extension derived from a generation's output URL, defaulting to
 * `png`. Strips any query string and lowercases. Used for export filenames so
 * we don't assume every output is a PNG.
 */
function extensionFromUrl(url: string | undefined): string {
  if (!url) return 'png'
  const path = url.split('?')[0].split('#')[0]
  const last = path.split('/').pop() ?? ''
  const dot = last.lastIndexOf('.')
  if (dot <= 0 || dot === last.length - 1) return 'png'
  const ext = last.slice(dot + 1).toLowerCase()
  return /^[a-z0-9]{2,5}$/.test(ext) ? ext : 'png'
}

/** Lowercase, hyphenated slug for deterministic export filenames. */
function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'untitled'
  )
}

// ─── Queries ─────────────────────────────────────────────────────────────────

/**
 * Lists the authenticated user's Ad Tests for a product, newest first.
 * Excludes archived tests unless `includeArchived` is set. Verifies product
 * ownership; returns an empty array for unauthenticated callers.
 */
export const listForProduct = query({
  args: {
    productId: v.id('products'),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, { productId, includeArchived }) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return []

    const product = await ctx.db.get(productId)
    if (!product || product.userId !== userId) return []

    // Non-archived is the common path: query the archive index directly so a
    // user with many archived tests still gets a full window of active ones
    // (an in-memory archivedAt filter would dilute the .take() slice).
    const tests = includeArchived
      ? await ctx.db
          .query('adTests')
          .withIndex('by_productId_createdAt', (q) =>
            q.eq('productId', productId),
          )
          .order('desc')
          .take(200)
      : await ctx.db
          .query('adTests')
          .withIndex('by_productId_archivedAt', (q) =>
            q.eq('productId', productId).eq('archivedAt', undefined),
          )
          .order('desc')
          .take(200)

    // Defense in depth: the product is owned, but filter by userId anyway so a
    // shared productId can never surface another user's test.
    return tests.filter((t) => t.userId === userId)
  },
})

/**
 * Returns an Ad Test plus its generated `templateGenerations` rows, ordered by
 * `adUnitIndex` (falling back to creation time). Verifies ownership through
 * `adTests.userId`. Returns null if missing or not owned.
 */
export const getById = query({
  args: { adTestId: v.id('adTests') },
  handler: async (ctx, { adTestId }) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return null

    const adTest = await ctx.db.get(adTestId)
    if (!adTest || adTest.userId !== userId) return null

    const generations = await ctx.db
      .query('templateGenerations')
      .withIndex('by_adTestId', (q) => q.eq('adTestId', adTestId))
      .take(MAX_AD_UNITS_PER_TEST)

    generations.sort((a, b) => {
      const ai = a.adUnitIndex ?? Number.MAX_SAFE_INTEGER
      const bi = b.adUnitIndex ?? Number.MAX_SAFE_INTEGER
      if (ai !== bi) return ai - bi
      return a._creationTime - b._creationTime
    })

    return { adTest, generations }
  },
})

/**
 * Export metadata for an Ad Test: test/product names, the completed image rows,
 * their placement/aspect ratio/copy pairing, deterministic filenames, and the
 * test-level Copy Bank sets. This query only assembles metadata — it never
 * downloads assets. Entitlement gating and the actual zip build live in the
 * server-side export action (issue #38).
 */
export const getExportManifest = query({
  args: { adTestId: v.id('adTests') },
  handler: async (ctx, { adTestId }) => {
    const userId = await requireAuth(ctx)
    const adTest = await requireOwnedAdTest(ctx, userId, adTestId)
    const product = await ctx.db.get(adTest.productId)

    const generations = await ctx.db
      .query('templateGenerations')
      .withIndex('by_adTestId', (q) => q.eq('adTestId', adTestId))
      .take(MAX_AD_UNITS_PER_TEST)

    const copySets = await ctx.db
      .query('adTestCopySets')
      .withIndex('by_adTestId', (q) => q.eq('adTestId', adTestId))
      .take(200)

    const productSlug = slugify(product?.name ?? 'product')
    const testSlug = slugify(adTest.name)

    // Only complete rows with an output URL are exportable image units.
    const items = generations
      .filter((g) => g.status === 'complete' && !!g.outputUrl)
      .sort((a, b) => (a.adUnitIndex ?? 0) - (b.adUnitIndex ?? 0))
      .map((g, i) => {
        const angleSlug = slugify(g.angleKey ?? 'angle')
        const placement = g.placement ?? 'feed_square'
        const index = String((g.adUnitIndex ?? i) + 1).padStart(2, '0')
        const ext = extensionFromUrl(g.outputUrl)
        return {
          generationId: g._id,
          angle: g.angleKey ?? null,
          placement: g.placement ?? null,
          aspectRatio: g.aspectRatio ?? null,
          outputUrl: g.outputUrl ?? null,
          selectedCopySetId: g.selectedCopySetId ?? null,
          selectedHeadlineIndex: g.selectedHeadlineIndex ?? null,
          selectedPrimaryTextIndex: g.selectedPrimaryTextIndex ?? null,
          selectedDescriptionIndex: g.selectedDescriptionIndex ?? null,
          filename: `${productSlug}_${testSlug}_${angleSlug}_${slugify(
            placement,
          )}_${index}.${ext}`,
        }
      })

    return {
      testName: adTest.name,
      productName: product?.name ?? null,
      status: adTest.status,
      exportedAt: adTest.exportedAt ?? null,
      items,
      copySets,
    }
  },
})

/**
 * Server-side export package for the zip builder (issue #38). Unlike the public
 * `getExportManifest` (preview metadata), this:
 *   1. ENFORCES entitlement — only paid plans may export; free users are denied
 *      with an upgrade error before any zip work begins.
 *   2. RESOLVES each creative's paired copy (headline/primary/description text +
 *      CTA button) into flat strings, so the CSV builder needs no cross-lookup.
 *
 * Internal: called via `ctx.runQuery` from the authenticated `exportTestSet`
 * action, so `ctx.auth` carries the caller's identity. Throws `NO_SUBSCRIPTION`
 * for free/unsubscribed users and `Ad Test not found` for non-owners.
 */
export const prepareExportInternal = internalQuery({
  args: { adTestId: v.id('adTests') },
  handler: async (ctx, { adTestId }) => {
    const userId = await requireAuth(ctx)
    const adTest = await requireOwnedAdTest(ctx, userId, adTestId)

    // Entitlement gate — central, before any asset/zip work (the action does
    // the expensive fetch+zip only after this passes).
    const { allowed } = await hasPaidPlanAccess(ctx)
    if (!allowed) {
      throw billingError(
        'NO_SUBSCRIPTION',
        'Upgrade to a paid plan to export your test set.',
      )
    }

    const product = await ctx.db.get(adTest.productId)

    const generations = await ctx.db
      .query('templateGenerations')
      .withIndex('by_adTestId', (q) => q.eq('adTestId', adTestId))
      .take(MAX_AD_UNITS_PER_TEST)

    const copySetDocs = await ctx.db
      .query('adTestCopySets')
      .withIndex('by_adTestId', (q) => q.eq('adTestId', adTestId))
      .take(200)
    const copySetsById = new Map(copySetDocs.map((c) => [c._id, c]))

    const productSlug = slugify(product?.name ?? 'product')
    const testSlug = slugify(adTest.name)

    /** Text of the suggestion with the given variantIndex, or null. */
    const variantText = (
      suggestions: Array<{ variantIndex: number; text: string }>,
      index: number | undefined,
    ): string | null => {
      if (index === undefined || index === null) return null
      return suggestions.find((s) => s.variantIndex === index)?.text ?? null
    }

    // Items carry `outputUrl` (the action fetches it) on top of the ExportItem
    // shape the CSV builder consumes — a structural superset.
    const items = generations
      .filter((g) => g.status === 'complete' && !!g.outputUrl)
      .sort((a, b) => (a.adUnitIndex ?? 0) - (b.adUnitIndex ?? 0))
      .map((g, i) => {
        const angleSlug = slugify(g.angleKey ?? 'angle')
        const placement = g.placement ?? 'feed_square'
        const index = String((g.adUnitIndex ?? i) + 1).padStart(2, '0')
        const ext = extensionFromUrl(g.outputUrl)

        // Resolve paired copy, if the creative has any.
        const set = g.selectedCopySetId
          ? copySetsById.get(g.selectedCopySetId)
          : undefined

        return {
          generationId: g._id,
          angle: g.angleKey ?? null,
          placement: g.placement ?? null,
          aspectRatio: g.aspectRatio ?? null,
          outputUrl: g.outputUrl as string,
          filename: `${productSlug}_${testSlug}_${angleSlug}_${slugify(
            placement,
          )}_${index}.${ext}`,
          headline: set
            ? variantText(set.headlines, g.selectedHeadlineIndex)
            : null,
          primaryText: set
            ? variantText(set.primaryTexts, g.selectedPrimaryTextIndex)
            : null,
          description: set
            ? variantText(set.descriptions, g.selectedDescriptionIndex)
            : null,
          ctaButton: set?.recommendedCtaButton ?? null,
        }
      })

    const copySets: ExportCopySet[] = copySetDocs.map((c) => ({
      copySetId: c._id,
      angleKey: c.angleKey ?? null,
      recommendedCtaButton: c.recommendedCtaButton ?? null,
      headlines: c.headlines.map((s) => ({ variantIndex: s.variantIndex, text: s.text })),
      primaryTexts: c.primaryTexts.map((s) => ({ variantIndex: s.variantIndex, text: s.text })),
      descriptions: c.descriptions.map((s) => ({ variantIndex: s.variantIndex, text: s.text })),
    }))

    return {
      testName: adTest.name,
      productName: product?.name ?? null,
      productSlug,
      testSlug,
      items,
      copySets,
    }
  },
})

// ─── Home recommendation surface (issue #39) ─────────────────────────────────

/**
 * Read-only Home surface: the focus product, its persisted "what to test next"
 * recommendations (priority order), recent ready tests, and recent winners.
 * Recommendations are read from `adTestRecommendations` — NO LLM work happens
 * in this query; concepts are generated once during product analysis.
 *
 * Winners are returned so Home can prioritize "create next test from winner"
 * when present. Returns empty arrays (never throws) for signed-out users or
 * users with no product, so the Home empty state renders cleanly.
 */
export const getHomeAdTestSurface = query({
  args: {},
  handler: async (ctx) => {
    const empty = {
      focusProductId: null,
      productName: null,
      recommendations: [],
      recentWinners: [],
      recentTests: [],
    }

    const userId = await getAuthUserId(ctx)
    if (!userId) return empty

    // Focus product = most recent non-archived (matches products.getFocusProduct).
    const products = await ctx.db
      .query('products')
      .withIndex('by_userId_archived', (q) =>
        q.eq('userId', userId).eq('archivedAt', undefined),
      )
      .order('desc')
      .take(1)
    const focusProduct = products[0]
    if (!focusProduct) return empty

    // Persisted, unconsumed, undismissed recommendations, priority asc.
    // Filter dismissed rows at the DB level (before take) so a backlog of
    // dismissed rows — which keep consumedAt undefined — can never fill the
    // window and hide fresh pending recommendations.
    const recRows = await ctx.db
      .query('adTestRecommendations')
      .withIndex('by_productId_consumedAt', (q) =>
        q.eq('productId', focusProduct._id).eq('consumedAt', undefined),
      )
      .filter((q) => q.eq(q.field('dismissedAt'), undefined))
      .take(50)
    const recommendations = recRows
      .filter((r) => r.userId === userId)
      .sort((a, b) => a.concept.priority - b.concept.priority)
      .slice(0, 6)
      .map((r) => ({
        _id: r._id,
        key: r.concept.key,
        title: r.concept.title,
        description: r.concept.description,
        source: r.concept.source,
        priority: r.concept.priority,
        placements: r.concept.placements,
        angleCount: r.concept.angles.length,
      }))

    // Recent non-archived tests for the focus product.
    const testRows = await ctx.db
      .query('adTests')
      .withIndex('by_productId_archivedAt', (q) =>
        q.eq('productId', focusProduct._id).eq('archivedAt', undefined),
      )
      .order('desc')
      .take(6)
    const recentTests = testRows
      .filter((t) => t.userId === userId)
      .map((t) => ({
        _id: t._id,
        name: t.name,
        status: t.status,
        completedImageCount: t.completedImageCount,
        winnerCount: t.winnerCount,
        updatedAt: t.updatedAt,
      }))

    // Recent winners (starred creatives) across the focus product.
    const gens = await ctx.db
      .query('templateGenerations')
      .withIndex('by_product', (q) => q.eq('productId', focusProduct._id))
      .order('desc')
      .take(200)
    const winnerGens = gens
      .filter((g) => g.isWinner && g.status === 'complete' && !!g.outputUrl)
      .slice(0, 6)

    const testNameById = new Map(testRows.map((t) => [t._id, t.name]))
    const recentWinners = []
    for (const g of winnerGens) {
      let adTestName: string | null = null
      if (g.adTestId) {
        adTestName = testNameById.get(g.adTestId) ?? null
        if (adTestName === null) {
          // Winner's test isn't in the recent slice — resolve its name directly.
          const t = await ctx.db.get(g.adTestId)
          if (t && t.userId === userId) adTestName = t.name
        }
      }
      recentWinners.push({
        generationId: g._id,
        outputUrl: g.outputUrl as string,
        aspectRatio: g.aspectRatio ?? '1:1',
        adTestId: g.adTestId ?? null,
        adTestName,
      })
    }

    return {
      focusProductId: focusProduct._id,
      productName: focusProduct.name,
      recommendations,
      recentWinners,
      recentTests,
    }
  },
})

/**
 * All of the user's active (non-archived) Ad Tests across every product, newest
 * first, joined with the product name so the /ad-tests page can list them and
 * deep-link each to /studio/$productId?adTestId=. Capped at 100 — this is a
 * recent-work surface, not a paginated archive.
 */
export const listMyAdTests = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return []

    const tests = await ctx.db
      .query('adTests')
      .withIndex('by_userId_archivedAt', (q) =>
        q.eq('userId', userId).eq('archivedAt', undefined),
      )
      .order('desc')
      .take(100)

    // Resolve product names in one pass (dedupe ids first).
    const productIds = [...new Set(tests.map((t) => t.productId))]
    const products = await Promise.all(productIds.map((id) => ctx.db.get(id)))
    const productNameById = new Map(
      products.flatMap((p) => (p ? [[p._id, p.name] as const] : [])),
    )

    return tests.map((t) => ({
      _id: t._id,
      name: t.name,
      status: t.status,
      source: t.source,
      productId: t.productId,
      productName: productNameById.get(t.productId) ?? 'Product',
      plannedImageCount: t.plannedImageCount,
      completedImageCount: t.completedImageCount,
      failedImageCount: t.failedImageCount,
      winnerCount: t.winnerCount,
      exportedAt: t.exportedAt ?? null,
      updatedAt: t.updatedAt,
    }))
  },
})

/**
 * Creates a draft Ad Test from a persisted recommendation and marks the
 * recommendation consumed. Returns the draft's id so the UI can open its review
 * screen — generation isn't started here, so the user confirms before spending
 * credits (spec: prefer a confirm state before generating).
 */
export const createRecommendedAdTest = mutation({
  args: { recommendationId: v.id('adTestRecommendations') },
  handler: async (ctx, { recommendationId }): Promise<Id<'adTests'>> => {
    const userId = await requireAuth(ctx)
    const rec = await ctx.db.get(recommendationId)
    if (!rec || rec.userId !== userId) {
      throw new Error('Recommendation not found')
    }
    // Reject already-acted-on rows so a retry or stale client can't spawn a
    // second draft from the same recommendation.
    if (rec.consumedAt !== undefined) {
      throw new Error('Recommendation has already been used')
    }
    if (rec.dismissedAt !== undefined) {
      throw new Error('Recommendation is no longer available')
    }
    await requireOwnedProduct(ctx, userId, rec.productId)

    const concept = rec.concept
    if (concept.placements.length === 0) {
      throw new Error('Recommendation has no placements')
    }

    // Map the concept's provenance to the Ad Test source enum.
    const source =
      concept.source === 'starter'
        ? 'starter'
        : concept.source === 'winner_iteration'
          ? 'winner_iteration'
          : 'recommendation'

    const now = Date.now()
    const adTestId = await ctx.db.insert('adTests', {
      userId,
      productId: rec.productId,
      name: concept.title,
      status: 'draft',
      source,
      angles: concept.angles,
      prompts: concept.prompts,
      placements: concept.placements,
      aspectRatios: aspectRatiosForPlacements(concept.placements),
      plannedImageCount: 0,
      completedImageCount: 0,
      failedImageCount: 0,
      winnerCount: 0,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.patch(recommendationId, { consumedAt: now, updatedAt: now })
    return adTestId
  },
})

/** Dismisses a recommendation so it stops appearing on Home. */
export const dismissRecommendation = mutation({
  args: { recommendationId: v.id('adTestRecommendations') },
  handler: async (ctx, { recommendationId }) => {
    const userId = await requireAuth(ctx)
    const rec = await ctx.db.get(recommendationId)
    if (!rec || rec.userId !== userId) {
      throw new Error('Recommendation not found')
    }
    const now = Date.now()
    await ctx.db.patch(recommendationId, { dismissedAt: now, updatedAt: now })
    return null
  },
})

// ─── Mutations ───────────────────────────────────────────────────────────────

/**
 * Creates a `draft` Ad Test for a product. Verifies product ownership and, when
 * provided, ownership of the source generation/test. `aspectRatios` is derived
 * from the chosen placements. Counters start at zero; generation rows are
 * created later by `startGeneration` (issue #33).
 */
export const createDraft = mutation({
  args: {
    productId: v.id('products'),
    name: v.string(),
    source: adTestSource,
    angles: v.array(adTestAngle),
    prompts: v.optional(v.array(v.string())),
    placements: v.array(adPlacement),
    defaultCopyRequest: v.optional(copySetRequest),
    sourceGenerationId: v.optional(v.id('templateGenerations')),
    sourceAdTestId: v.optional(v.id('adTests')),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx)

    const name = args.name.trim()
    if (!name) throw new Error('Ad Test name is required')
    if (args.placements.length === 0) {
      throw new Error('At least one placement is required')
    }
    // Angles/prompts are only required for the angle-based fan-out path
    // (startGeneration). A template-based test gets its creatives from the
    // generate wizard (generateFromProduct with adTestId), so an empty
    // angles+prompts test is valid.

    await requireOwnedProduct(ctx, userId, args.productId)

    if (args.sourceGenerationId) {
      const src = await ctx.db.get(args.sourceGenerationId)
      if (!src) throw new Error('Source generation not found')
      if (src.userId) {
        // Modern row: userId is authoritative.
        if (src.userId !== userId) throw new Error('Source generation not found')
      } else if (src.productId) {
        // Legacy row (no userId): verify ownership through the parent product.
        const srcProduct = await ctx.db.get(src.productId)
        if (!srcProduct || srcProduct.userId !== userId) {
          throw new Error('Source generation not found')
        }
      }
      // Rows with neither userId nor productId are pre-auth legacy data;
      // allow attaching them as non-sensitive source context.
    }
    if (args.sourceAdTestId) {
      await requireOwnedAdTest(ctx, userId, args.sourceAdTestId)
    }

    const now = Date.now()
    const adTestId = await ctx.db.insert('adTests', {
      userId,
      productId: args.productId,
      name,
      status: 'draft',
      source: args.source,
      angles: args.angles,
      prompts: args.prompts,
      placements: args.placements,
      aspectRatios: aspectRatiosForPlacements(args.placements),
      defaultCopyRequest: args.defaultCopyRequest,
      sourceGenerationId: args.sourceGenerationId,
      sourceAdTestId: args.sourceAdTestId,
      plannedImageCount: 0,
      completedImageCount: 0,
      failedImageCount: 0,
      winnerCount: 0,
      createdAt: now,
      updatedAt: now,
    })

    return adTestId
  },
})

/**
 * Renames an Ad Test. Trimmed, non-empty, length-capped. Ownership enforced.
 */
export const renameAdTest = mutation({
  args: { adTestId: v.id('adTests'), name: v.string() },
  handler: async (ctx, { adTestId, name }) => {
    const userId = await requireAuth(ctx)
    await requireOwnedAdTest(ctx, userId, adTestId)
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Ad Test name is required')
    if (trimmed.length > 100) throw new Error('Ad Test name is too long')
    await ctx.db.patch(adTestId, { name: trimmed, updatedAt: Date.now() })
    return null
  },
})

/**
 * Fans out `templateGenerations` rows for an Ad Test and starts their workflows.
 * One row per (angle × placement) plus one per (prompt × placement). All rows
 * are linked via adTestId, placement, angleKey, adUnitIndex, aspectRatio, and
 * angleSeed so the UI can group and review them as a structured test set.
 *
 * Credit preflight is done once here using plannedImageCount — no per-row
 * billing check. No model picker: always nano-banana-2.
 * Only callable on a 'draft' Ad Test.
 */
export const startGeneration = mutation({
  args: {
    adTestId: v.id('adTests'),
    /** Override which product image to use. Defaults to the product's primary image. */
    productImageId: v.optional(v.id('productImages')),
    /** Apply brand theme (colors/font/tagline/offer). Defaults to true. */
    applyBrand: v.optional(v.boolean()),
    /** Apply customer voice (brand voice + customer phrases). Defaults to true. */
    applyVoice: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx)
    const adTest = await requireOwnedAdTest(ctx, userId, args.adTestId)

    if (adTest.status !== 'draft') {
      throw new Error(`Ad Test cannot be started (status=${adTest.status})`)
    }

    const product = await requireOwnedProduct(ctx, userId, adTest.productId)
    if (product.status !== 'ready') {
      throw new Error('Product analysis is not ready yet')
    }

    // Resolve the product image (caller-supplied wins; fall back to primary).
    let productImageUrl: string
    let resolvedImageId: Id<'productImages'> | undefined

    if (args.productImageId) {
      const picked = await ctx.db.get(args.productImageId)
      if (!picked) throw new Error('Source image not found')
      if (picked.productId !== adTest.productId) {
        throw new Error('Source image does not belong to this product')
      }
      if (picked.status !== 'ready') throw new Error('Source image not ready')
      resolvedImageId = picked._id
      productImageUrl = picked.imageUrl
    } else {
      if (!product.primaryImageId) throw new Error('Product has no primary image set')
      const primaryImage = await ctx.db.get(product.primaryImageId)
      if (!primaryImage) throw new Error('Primary image not found')
      resolvedImageId = product.primaryImageId
      productImageUrl = primaryImage.imageUrl
    }

    // Fan-out plan: angle × placement rows + prompt × placement rows.
    const plannedImageCount =
      adTest.angles.length * adTest.placements.length +
      (adTest.prompts?.length ?? 0) * adTest.placements.length

    if (plannedImageCount === 0) {
      throw new Error('Ad Test has no angles or prompts to generate from')
    }

    await enforceGenerationRateLimit(ctx, userId, 'startAdTestGeneration')

    // Single preflight credit check for the whole batch.
    await requireCredits(ctx, 'nano-banana-2', plannedImageCount)
    await recordGenerationUsage(ctx, userId, 'startAdTestGeneration', plannedImageCount)

    const now = Date.now()
    await ctx.db.patch(args.adTestId, {
      plannedImageCount,
      status: 'generating',
      updatedAt: now,
    })

    let adUnitIndex = 0

    // Angle-driven rows (mode = 'angle').
    for (const angle of adTest.angles) {
      for (const placement of adTest.placements) {
        const aspectRatio = PLACEMENT_ASPECT_RATIO[placement]
        const generationId = await ctx.db.insert('templateGenerations', {
          productId: adTest.productId,
          productImageId: resolvedImageId,
          userId,
          productImageUrl,
          aspectRatio,
          mode: 'angle',
          colorAdapt: false,
          applyBrand: args.applyBrand ?? true,
          applyVoice: args.applyVoice ?? true,
          variationIndex: 0,
          angleSeed: {
            title: angle.title,
            description: angle.description ?? '',
            hook: angle.hook ?? '',
            suggestedAdStyle: angle.suggestedAdStyle ?? '',
          },
          adTestId: args.adTestId,
          placement,
          angleKey: angle.key,
          adUnitIndex: adUnitIndex++,
          status: 'queued',
          model: 'nano-banana-2',
        })
        await ctx.scheduler.runAfter(
          0,
          internal.adTests._kickoffGenerationWorkflow,
          { generationId, mode: 'angle' as const },
        )
      }
    }

    // Prompt-driven rows (mode = 'prompt').
    for (const prompt of adTest.prompts ?? []) {
      for (const placement of adTest.placements) {
        const aspectRatio = PLACEMENT_ASPECT_RATIO[placement]
        const generationId = await ctx.db.insert('templateGenerations', {
          productId: adTest.productId,
          productImageId: resolvedImageId,
          userId,
          productImageUrl,
          aspectRatio,
          mode: 'prompt',
          colorAdapt: false,
          applyBrand: args.applyBrand ?? true,
          applyVoice: args.applyVoice ?? true,
          variationIndex: 0,
          dynamicPrompt: prompt,
          adTestId: args.adTestId,
          placement,
          adUnitIndex: adUnitIndex++,
          status: 'queued',
          model: 'nano-banana-2',
        })
        await ctx.scheduler.runAfter(
          0,
          internal.adTests._kickoffGenerationWorkflow,
          { generationId, mode: 'prompt' as const },
        )
      }
    }

    return { ok: true, plannedImageCount }
  },
})

/**
 * Marks an Ad Test exported by stamping `exportedAt`. Does NOT change `status`
 * — exported is lifecycle metadata derived from the timestamp. Idempotent:
 * preserves the first export time on repeat calls.
 */
export const markExported = mutation({
  args: { adTestId: v.id('adTests') },
  handler: async (ctx, { adTestId }) => {
    const userId = await requireAuth(ctx)
    const adTest = await requireOwnedAdTest(ctx, userId, adTestId)
    const now = Date.now()
    await ctx.db.patch(adTestId, {
      exportedAt: adTest.exportedAt ?? now,
      updatedAt: now,
    })
    return null
  },
})

/**
 * Soft-archives an Ad Test by stamping `archivedAt`. Does NOT change `status`
 * and does NOT delete generated rows.
 */
export const archive = mutation({
  args: { adTestId: v.id('adTests') },
  handler: async (ctx, { adTestId }) => {
    const userId = await requireAuth(ctx)
    await requireOwnedAdTest(ctx, userId, adTestId)
    const now = Date.now()
    await ctx.db.patch(adTestId, { archivedAt: now, updatedAt: now })
    return null
  },
})

/**
 * Records a lightweight performance note (CPA/CTR/ROAS/free-form) against an
 * Ad Test, optionally tied to a specific generated row. Verifies the Ad Test is
 * owned by the caller and that the generation belongs to the test when given.
 */
export const savePerformanceNote = mutation({
  args: {
    adTestId: v.id('adTests'),
    generationId: v.optional(v.id('templateGenerations')),
    platform: v.optional(performanceNotePlatform),
    metricName: v.optional(v.string()),
    metricValue: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx)
    await requireOwnedAdTest(ctx, userId, args.adTestId)

    if (args.generationId) {
      const gen = await ctx.db.get(args.generationId)
      if (!gen || gen.adTestId !== args.adTestId) {
        throw new Error('Generation does not belong to this Ad Test')
      }
    }

    const now = Date.now()
    const noteId = await ctx.db.insert('adTestPerformanceNotes', {
      userId,
      adTestId: args.adTestId,
      generationId: args.generationId,
      platform: args.platform,
      metricName: args.metricName,
      metricValue: args.metricValue,
      note: args.note,
      createdAt: now,
      updatedAt: now,
    })
    return noteId
  },
})

/**
 * Lists an Ad Test's performance notes, newest first. Read-only, owner-scoped;
 * returns [] for unauthenticated or non-owning callers so the notes panel can
 * render without throwing.
 */
export const listPerformanceNotes = query({
  args: { adTestId: v.id('adTests') },
  handler: async (ctx, { adTestId }) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return []

    const adTest = await ctx.db.get(adTestId)
    if (!adTest || adTest.userId !== userId) return []

    const notes = await ctx.db
      .query('adTestPerformanceNotes')
      .withIndex('by_adTestId', (q) => q.eq('adTestId', adTestId))
      .order('desc')
      .take(100)
    return notes.filter((n) => n.userId === userId)
  },
})

/**
 * Seeds the next Ad Test from a winning creative (the winner loop). Creates a
 * `winner_iteration` draft that re-runs the winning angle (or prompt) across the
 * standard placement set, linked back via `sourceGenerationId`/`sourceAdTestId`.
 * Generation isn't started here — the user confirms in the review screen before
 * spending credits. Returns the new draft's id.
 */
export const createNextAdTestFromWinner = mutation({
  args: {
    generationId: v.id('templateGenerations'),
    name: v.optional(v.string()),
  },
  handler: async (ctx, { generationId, name }): Promise<Id<'adTests'>> => {
    const userId = await requireAuth(ctx)
    const gen = await ctx.db.get(generationId)
    if (!gen) throw new Error('Generation not found')

    // Ownership: modern rows via userId; legacy rows via the parent product.
    if (gen.userId) {
      if (gen.userId !== userId) throw new Error('Generation not found')
    } else if (gen.productId) {
      const owner = await ctx.db.get(gen.productId)
      if (!owner || owner.userId !== userId) throw new Error('Generation not found')
    } else {
      throw new Error('Generation not found')
    }

    if (!gen.productId) {
      throw new Error('Winner has no product to iterate from')
    }
    const product = await requireOwnedProduct(ctx, userId, gen.productId)

    // Reconstruct the winning concept: prefer the seeded angle, else the prompt.
    const angles: Array<{
      key: string
      title: string
      description?: string
      hook?: string
      suggestedAdStyle?: string
    }> = []
    let prompts: string[] | undefined
    if (gen.angleSeed) {
      angles.push({
        key: gen.angleKey ?? 'winner',
        title: gen.angleSeed.title,
        description: gen.angleSeed.description || undefined,
        hook: gen.angleSeed.hook || undefined,
        suggestedAdStyle: gen.angleSeed.suggestedAdStyle || undefined,
      })
    } else if (gen.dynamicPrompt) {
      prompts = [gen.dynamicPrompt]
    } else {
      throw new Error('Winner has no angle or prompt to iterate from')
    }

    // Re-test the winning concept across the standard starter placements.
    const placements = ['feed_square', 'feed_vertical', 'story_reel'] as const

    const fallbackName = gen.angleSeed?.title
      ? `Next test: ${gen.angleSeed.title}`
      : `Next test from ${product.name}`
    const testName = (name?.trim() || fallbackName).slice(0, 120)

    const now = Date.now()
    const adTestId = await ctx.db.insert('adTests', {
      userId,
      productId: gen.productId,
      name: testName,
      status: 'draft',
      source: 'winner_iteration',
      angles,
      prompts,
      placements: [...placements],
      aspectRatios: aspectRatiosForPlacements([...placements]),
      sourceGenerationId: generationId,
      sourceAdTestId: gen.adTestId,
      plannedImageCount: 0,
      completedImageCount: 0,
      failedImageCount: 0,
      winnerCount: 0,
      createdAt: now,
      updatedAt: now,
    })
    return adTestId
  },
})

// ─── Copy Bank (test-level suggested copy; user-triggered, unmetered) ────────

/**
 * Lists the Copy Bank sets generated for an Ad Test, newest first. Each set is
 * one requested field mix (headlines/primaryTexts/descriptions + a recommended
 * CTA button). Returns [] for unauthenticated or non-owning callers.
 */
export const listCopySets = query({
  args: { adTestId: v.id('adTests') },
  handler: async (ctx, { adTestId }) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return []

    const adTest = await ctx.db.get(adTestId)
    if (!adTest || adTest.userId !== userId) return []

    const sets = await ctx.db
      .query('adTestCopySets')
      .withIndex('by_adTestId', (q) => q.eq('adTestId', adTestId))
      .order('desc')
      .take(100)

    // Defense in depth: only ever return rows owned by the caller.
    return sets.filter((s) => s.userId === userId)
  },
})

/**
 * Read-side context for Copy Bank generation: product marketing fields, the
 * product's brand kit (voice/tagline/offer/customer phrases), and the selected
 * angle if `angleKey` matches one on the test. Runs as an internal query so the
 * `generateCopySet` action can gather everything in one owned read before
 * calling the LLM. Returns null when the test isn't owned by `userId`.
 */
export const getCopyContextInternal = internalQuery({
  args: {
    userId: v.string(),
    adTestId: v.id('adTests'),
    angleKey: v.optional(v.string()),
  },
  handler: async (ctx, { userId, adTestId, angleKey }) => {
    const adTest = await ctx.db.get(adTestId)
    if (!adTest || adTest.userId !== userId) return null

    const product = await ctx.db.get(adTest.productId)
    if (!product) return null

    // Per-product brand kit only (matches image generation; no primary fallback).
    let brandKit: Doc<'brandKits'> | null = null
    if (product.brandKitId) {
      const kit = await ctx.db.get(product.brandKitId)
      if (kit && kit.userId === userId) brandKit = kit
    }

    // Ground the copy in a single angle when the caller picked one.
    const angle = angleKey
      ? adTest.angles.find((a) => a.key === angleKey)
      : undefined

    // Per-product customer language wins over the brand-level list.
    const customerLanguage =
      product.customerLanguage && product.customerLanguage.length > 0
        ? product.customerLanguage
        : brandKit?.customerLanguage

    return {
      productId: adTest.productId,
      productName: product.name,
      productDescription: product.productDescription,
      targetAudience: product.targetAudience,
      valueProposition: product.valueProposition,
      angle: angle
        ? {
            title: angle.title,
            description: angle.description ?? '',
            hook: angle.hook ?? '',
            suggestedAdStyle: angle.suggestedAdStyle ?? '',
          }
        : undefined,
      brandVoice: brandKit?.voice,
      brandTagline: brandKit?.tagline,
      currentOffer: brandKit?.currentOffer,
      customerLanguage,
    }
  },
})

/**
 * Inserts a Copy Bank row after generation. Re-verifies ownership inside the
 * mutation (the action's auth check happened in a separate context) so a forged
 * userId can never write to another user's test.
 */
export const _insertCopySet = internalMutation({
  args: {
    userId: v.string(),
    adTestId: v.id('adTests'),
    productId: v.id('products'),
    angleKey: v.optional(v.string()),
    request: copySetRequest,
    headlines: v.array(copySuggestion),
    primaryTexts: v.array(copySuggestion),
    descriptions: v.array(copySuggestion),
    recommendedCtaButton: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<'adTestCopySets'>> => {
    const adTest = await ctx.db.get(args.adTestId)
    if (!adTest || adTest.userId !== args.userId) {
      throw new Error('Ad Test not found')
    }

    const now = Date.now()
    return ctx.db.insert('adTestCopySets', {
      userId: args.userId,
      adTestId: args.adTestId,
      productId: args.productId,
      angleKey: args.angleKey,
      request: args.request,
      headlines: args.headlines,
      primaryTexts: args.primaryTexts,
      descriptions: args.descriptions,
      recommendedCtaButton: args.recommendedCtaButton,
      createdAt: now,
      updatedAt: now,
    })
  },
})

/**
 * User-triggered Copy Bank generation for an Ad Test. The buyer selects which
 * fields they want and how many of each; this generates a single
 * `adTestCopySets` row. CTA is a recommended Meta button value, not generated
 * prose. Copy generation is UNMETERED for image-credit billing — it never runs
 * a `requireCredits` preflight and never marks the Ad Test failed.
 *
 * This is an action (not a mutation) because it must call the LLM. It runs as:
 *   auth → validate request → owned read (context) → LLM → owned insert.
 */
export const generateCopySet = action({
  args: {
    adTestId: v.id('adTests'),
    angleKey: v.optional(v.string()),
    request: copySetRequest,
    /** Encourage 1-2 relevant emoji in primary texts / descriptions. */
    emoji: v.optional(v.boolean()),
  },
  handler: async (ctx, { adTestId, angleKey, request, emoji }): Promise<Id<'adTestCopySets'>> => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')
    const userId = identity.tokenIdentifier

    // Throws on out-of-range counts / empty request before any LLM spend.
    const counts = normalizeCopySetRequest(request)

    const context = await ctx.runQuery(internal.adTests.getCopyContextInternal, {
      userId,
      adTestId,
      angleKey,
    })
    if (!context) throw new Error('Ad Test not found')

    const ai = await ctx.runAction(internal.ai.generateCopyBankText, {
      productName: context.productName,
      productDescription: context.productDescription,
      targetAudience: context.targetAudience,
      valueProposition: context.valueProposition,
      angle: context.angle,
      brandVoice: context.brandVoice,
      brandTagline: context.brandTagline,
      currentOffer: context.currentOffer,
      customerLanguage: context.customerLanguage,
      headlineCount: counts.headlineCount,
      primaryTextCount: counts.primaryTextCount,
      descriptionCount: counts.descriptionCount,
      emoji: emoji ?? false,
    })

    // Wrap each generated string as a copySuggestion, stamping the angle it was
    // generated for (if any) so paired exports can trace copy back to an angle.
    const toSuggestions = (texts: string[]) =>
      texts.map((text, variantIndex) => ({
        text,
        variantIndex,
        angleKey: angleKey ?? undefined,
      }))

    return ctx.runMutation(internal.adTests._insertCopySet, {
      userId,
      adTestId,
      productId: context.productId,
      angleKey,
      request,
      headlines: toSuggestions(ai.headlines),
      primaryTexts: toSuggestions(ai.primaryTexts),
      descriptions: toSuggestions(ai.descriptions),
      recommendedCtaButton: normalizeCtaButton(ai.recommendedCtaButton),
    })
  },
})

/** Copy Bank field a suggestion belongs to. */
const copySetField = v.union(
  v.literal('headlines'),
  v.literal('primaryTexts'),
  v.literal('descriptions'),
)

/**
 * Edits a single Copy Bank suggestion in place. The buyer can refine any
 * generated headline/primary text/description before pairing or export. Matches
 * by `variantIndex` (stable across edits) rather than array position.
 */
export const updateCopySuggestion = mutation({
  args: {
    copySetId: v.id('adTestCopySets'),
    field: copySetField,
    variantIndex: v.number(),
    text: v.string(),
  },
  handler: async (ctx, { copySetId, field, variantIndex, text }) => {
    const userId = await requireAuth(ctx)
    const copySet = await ctx.db.get(copySetId)
    if (!copySet || copySet.userId !== userId) {
      throw new Error('Copy set not found')
    }

    const trimmed = text.trim()
    if (!trimmed) throw new Error('Suggestion text cannot be empty')

    const current = copySet[field]
    const idx = current.findIndex((s) => s.variantIndex === variantIndex)
    if (idx === -1) throw new Error('Suggestion not found')

    const updated = current.map((s, i) =>
      i === idx ? { ...s, text: trimmed } : s,
    )
    await ctx.db.patch(copySetId, { [field]: updated, updatedAt: Date.now() })
    return null
  },
})

/**
 * Updates the recommended CTA button on a Copy Bank set. Pass a Meta button
 * value (e.g. SHOP_NOW) to set it, or omit to clear it. Rejects values that
 * aren't supported platform buttons rather than storing free-form prose.
 */
export const setCopySetCta = mutation({
  args: {
    copySetId: v.id('adTestCopySets'),
    recommendedCtaButton: v.optional(v.string()),
  },
  handler: async (ctx, { copySetId, recommendedCtaButton }) => {
    const userId = await requireAuth(ctx)
    const copySet = await ctx.db.get(copySetId)
    if (!copySet || copySet.userId !== userId) {
      throw new Error('Copy set not found')
    }

    let normalized: string | undefined
    if (recommendedCtaButton) {
      normalized = normalizeCtaButton(recommendedCtaButton)
      if (!normalized) throw new Error('Unsupported CTA button')
    }

    await ctx.db.patch(copySetId, {
      recommendedCtaButton: normalized,
      updatedAt: Date.now(),
    })
    return null
  },
})

/**
 * Deletes a Copy Bank set and clears any creative pairings that reference it,
 * so no generated row is left pointing at a deleted copy set.
 */
export const deleteCopySet = mutation({
  args: { copySetId: v.id('adTestCopySets') },
  handler: async (ctx, { copySetId }) => {
    const userId = await requireAuth(ctx)
    const copySet = await ctx.db.get(copySetId)
    if (!copySet || copySet.userId !== userId) {
      throw new Error('Copy set not found')
    }

    // Clear pairings on this test's generations that point at the deleted set.
    const paired = await ctx.db
      .query('templateGenerations')
      .withIndex('by_adTestId', (q) => q.eq('adTestId', copySet.adTestId))
      .take(MAX_AD_UNITS_PER_TEST)
    for (const gen of paired) {
      if (gen.selectedCopySetId === copySetId) {
        await ctx.db.patch(gen._id, {
          selectedCopySetId: undefined,
          selectedHeadlineIndex: undefined,
          selectedPrimaryTextIndex: undefined,
          selectedDescriptionIndex: undefined,
        })
      }
    }

    await ctx.db.delete(copySetId)
    return null
  },
})

/**
 * Pairs Copy Bank suggestions with a generated creative (optional per the
 * spec — buyers may test copy independently). Pass a `copySetId` plus the
 * suggestion indices to pair; omit `copySetId` to unpair. Verifies the
 * generation belongs to an owned Ad Test and the copy set belongs to the SAME
 * test, and that each index exists in its field.
 */
export const pairCopyWithGeneration = mutation({
  args: {
    generationId: v.id('templateGenerations'),
    copySetId: v.optional(v.id('adTestCopySets')),
    headlineIndex: v.optional(v.number()),
    primaryTextIndex: v.optional(v.number()),
    descriptionIndex: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx)

    const gen = await ctx.db.get(args.generationId)
    if (!gen || gen.userId !== userId) throw new Error('Generation not found')
    if (!gen.adTestId) {
      throw new Error('Generation is not part of an Ad Test')
    }
    await requireOwnedAdTest(ctx, userId, gen.adTestId)

    // Unpair: clear every selection field.
    if (!args.copySetId) {
      await ctx.db.patch(args.generationId, {
        selectedCopySetId: undefined,
        selectedHeadlineIndex: undefined,
        selectedPrimaryTextIndex: undefined,
        selectedDescriptionIndex: undefined,
      })
      return null
    }

    const copySet = await ctx.db.get(args.copySetId)
    if (!copySet || copySet.userId !== userId) {
      throw new Error('Copy set not found')
    }
    if (copySet.adTestId !== gen.adTestId) {
      throw new Error('Copy set does not belong to this Ad Test')
    }

    // Validate each provided index against the matching field's variants.
    const checkIndex = (
      index: number | undefined,
      variants: Array<{ variantIndex: number }>,
      label: string,
    ) => {
      if (index === undefined) return
      if (!variants.some((variant) => variant.variantIndex === index)) {
        throw new Error(`Selected ${label} is not in this copy set`)
      }
    }
    checkIndex(args.headlineIndex, copySet.headlines, 'headline')
    checkIndex(args.primaryTextIndex, copySet.primaryTexts, 'primary text')
    checkIndex(args.descriptionIndex, copySet.descriptions, 'description')

    await ctx.db.patch(args.generationId, {
      selectedCopySetId: args.copySetId,
      selectedHeadlineIndex: args.headlineIndex,
      selectedPrimaryTextIndex: args.primaryTextIndex,
      selectedDescriptionIndex: args.descriptionIndex,
    })
    return null
  },
})

// ─── Internal mutations (workflow kickoff + counter + status derivation) ─────

/**
 * Starts the appropriate generation workflow for a single row created by
 * `startGeneration`. Called via ctx.scheduler so the mutation that creates
 * the rows doesn't need the workflow component registered (keeps tests clean).
 */
export const _kickoffGenerationWorkflow = internalMutation({
  args: {
    generationId: v.id('templateGenerations'),
    mode: v.union(v.literal('angle'), v.literal('prompt')),
  },
  handler: async (ctx, { generationId, mode }) => {
    if (mode === 'prompt') {
      await workflow.start(ctx, internal.studio.generateFromPromptWorkflow, {
        generationId,
      })
    } else {
      await workflow.start(ctx, internal.studio.generateFromAngleWorkflow, {
        generationId,
      })
    }
  },
})

/**
 * Recomputes `completedImageCount`, `failedImageCount`, and `winnerCount` from
 * the Ad Test's child `templateGenerations`. Call after generation
 * completion/failure and winner toggles. `plannedImageCount` is owned by the
 * generation-start path and is left untouched here.
 */
export const updateCountersForGeneration = internalMutation({
  args: { adTestId: v.id('adTests') },
  handler: async (ctx, { adTestId }) => {
    const adTest = await ctx.db.get(adTestId)
    if (!adTest) return null

    const generations = await ctx.db
      .query('templateGenerations')
      .withIndex('by_adTestId', (q) => q.eq('adTestId', adTestId))
      .take(MAX_AD_UNITS_PER_TEST)

    let completed = 0
    let failed = 0
    let winners = 0
    for (const g of generations) {
      if (g.status === 'complete') completed++
      else if (g.status === 'failed') failed++
      if (g.isWinner) winners++
    }

    await ctx.db.patch(adTestId, {
      completedImageCount: completed,
      failedImageCount: failed,
      winnerCount: winners,
      updatedAt: Date.now(),
    })
    return null
  },
})

/**
 * Derives Ad Test `status` from its child generation rows:
 *   - any in-flight (queued/running/uploading) → generating
 *   - all terminal & all complete               → ready
 *   - all terminal & all failed                 → failed
 *   - all terminal & mixed (≥1 complete)        → partially_failed
 * No children → status is left unchanged (a draft stays draft).
 * Never sets exported/archived; those are timestamp-derived.
 */
export const setStatusFromChildren = internalMutation({
  args: { adTestId: v.id('adTests') },
  handler: async (ctx, { adTestId }) => {
    const adTest = await ctx.db.get(adTestId)
    if (!adTest) return null

    const generations = await ctx.db
      .query('templateGenerations')
      .withIndex('by_adTestId', (q) => q.eq('adTestId', adTestId))
      .take(MAX_AD_UNITS_PER_TEST)

    if (generations.length === 0) return null

    let inFlight = 0
    let complete = 0
    let failed = 0
    for (const g of generations) {
      if (g.status === 'complete') complete++
      else if (g.status === 'failed') failed++
      // queued/running/uploading — and any future/unknown status — count as
      // in-flight so a not-yet-terminal row can never be read as "ready".
      else inFlight++
    }

    let status: Doc<'adTests'>['status']
    if (inFlight > 0) status = 'generating'
    else if (failed === 0) status = 'ready'
    else if (complete === 0) status = 'failed'
    else status = 'partially_failed'

    if (status !== adTest.status) {
      await ctx.db.patch(adTestId, { status, updatedAt: Date.now() })
    }
    return null
  },
})
