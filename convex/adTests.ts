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
  internalMutation,
  mutation,
  query,
} from './_generated/server'
import {
  PLACEMENT_ASPECT_RATIO,
  adPlacement,
  adTestAngle,
  adTestSource,
  copySetRequest,
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
    if (args.angles.length === 0 && (args.prompts?.length ?? 0) === 0) {
      throw new Error('At least one angle or prompt is required')
    }

    await requireOwnedProduct(ctx, userId, args.productId)

    if (args.sourceGenerationId) {
      const src = await ctx.db.get(args.sourceGenerationId)
      if (!src || (src.userId && src.userId !== userId)) {
        throw new Error('Source generation not found')
      }
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

// ─── Internal mutations (counter + status derivation) ────────────────────────

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
