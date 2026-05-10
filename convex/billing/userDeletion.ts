// Hard-delete on Clerk user.deleted webhook. Privacy policy at /privacy
// declares 30-day retention; this is currently immediate hard-delete which is
// stricter than the policy. If the user wants soft-delete + cron sweep
// instead, swap to a `deletedAt` timestamp + a daily cron in convex/crons.ts.
//
// Coverage (tables walked):
//   products, productImages, studioRuns (legacy), userPlans, billingEvents,
//   templateGenerations, brandKits, urlImports, onboardingProfiles,
//   productInspirations
//
// Skipped:
//   - boards/columns/items (Trellaux demo, no userId)
//   - adTemplates / promptConfigs (global, not user-scoped)
//   - webhookEvents (Svix dedup log; no PII beyond raw event body which is
//     short-lived; per task spec)
//   - adminAuditEvents (admin actions log; targetUserId may match but the
//     row is an admin's audit trail, not the deleted user's data)
//   - adminDebugRuns (keyed by adminUserId; admin-only tool)
//
// Idempotent: the webhook may retry. If we find no rows we exit cleanly.

import { v } from 'convex/values'
import {
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from '../_generated/server'
import { internal } from '../_generated/api'

// Convex limits a single transaction to ~16k document reads. We page through
// each user-scoped table in batches well below that ceiling.
const BATCH_SIZE = 256

/**
 * Derive an R2 object key from a public R2 URL by stripping the public-URL
 * prefix. Returns null if the URL doesn't belong to our R2 bucket (e.g.
 * legacy external URLs, third-party CDN images) — those are not ours to
 * delete.
 */
function r2KeyFromUrl(url: string | undefined | null): string | null {
  if (!url) return null
  const publicUrl = process.env.R2_PUBLIC_URL
  if (!publicUrl) return null
  const prefix = publicUrl.endsWith('/') ? publicUrl : `${publicUrl}/`
  if (!url.startsWith(prefix)) return null
  const key = url.slice(prefix.length)
  return key.length > 0 ? key : null
}

// ─── Internal queries (paged reads) ──────────────────────────────────────────

export const findUserPlanIdsByUserId = internalQuery({
  args: { userId: v.string(), cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    page: v.array(v.id('userPlans')),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { userId, cursor }) => {
    const r = await ctx.db
      .query('userPlans')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .paginate({ numItems: BATCH_SIZE, cursor })
    return {
      page: r.page.map((d) => d._id),
      isDone: r.isDone,
      continueCursor: r.continueCursor,
    }
  },
})

export const findBillingEventIdsByUserId = internalQuery({
  args: { userId: v.string(), cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    page: v.array(v.id('billingEvents')),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { userId, cursor }) => {
    const r = await ctx.db
      .query('billingEvents')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .paginate({ numItems: BATCH_SIZE, cursor })
    return {
      page: r.page.map((d) => d._id),
      isDone: r.isDone,
      continueCursor: r.continueCursor,
    }
  },
})

export const findOnboardingProfileIdsByUserId = internalQuery({
  args: { userId: v.string(), cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    page: v.array(v.id('onboardingProfiles')),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { userId, cursor }) => {
    const r = await ctx.db
      .query('onboardingProfiles')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .paginate({ numItems: BATCH_SIZE, cursor })
    return {
      page: r.page.map((d) => d._id),
      isDone: r.isDone,
      continueCursor: r.continueCursor,
    }
  },
})

export const findStudioRunIdsByUserId = internalQuery({
  args: { userId: v.string(), cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    page: v.array(v.id('studioRuns')),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { userId, cursor }) => {
    const r = await ctx.db
      .query('studioRuns')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .paginate({ numItems: BATCH_SIZE, cursor })
    return {
      page: r.page.map((d) => d._id),
      isDone: r.isDone,
      continueCursor: r.continueCursor,
    }
  },
})

export const findProductsByUserId = internalQuery({
  args: { userId: v.string(), cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    page: v.array(
      v.object({
        _id: v.id('products'),
        imageUrl: v.optional(v.string()),
        backgroundRemovedUrl: v.optional(v.string()),
      }),
    ),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { userId, cursor }) => {
    const r = await ctx.db
      .query('products')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .paginate({ numItems: BATCH_SIZE, cursor })
    return {
      page: r.page.map((d) => ({
        _id: d._id,
        imageUrl: d.imageUrl,
        backgroundRemovedUrl: d.backgroundRemovedUrl,
      })),
      isDone: r.isDone,
      continueCursor: r.continueCursor,
    }
  },
})

export const findProductImagesByUserId = internalQuery({
  args: { userId: v.string(), cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    page: v.array(
      v.object({
        _id: v.id('productImages'),
        imageUrl: v.string(),
        thumbnailUrl: v.optional(v.string()),
      }),
    ),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { userId, cursor }) => {
    // productImages has no by_userId index. Scan with a filter; the table is
    // ~per-product so this is bounded to the user's products in practice but
    // we still page to stay under transaction limits.
    const r = await ctx.db
      .query('productImages')
      .filter((q) => q.eq(q.field('userId'), userId))
      .paginate({ numItems: BATCH_SIZE, cursor })
    return {
      page: r.page.map((d) => ({
        _id: d._id,
        imageUrl: d.imageUrl,
        thumbnailUrl: d.thumbnailUrl,
      })),
      isDone: r.isDone,
      continueCursor: r.continueCursor,
    }
  },
})

export const findTemplateGenerationsByUserId = internalQuery({
  args: { userId: v.string(), cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    page: v.array(
      v.object({
        _id: v.id('templateGenerations'),
        outputUrl: v.optional(v.string()),
      }),
    ),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { userId, cursor }) => {
    const r = await ctx.db
      .query('templateGenerations')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .paginate({ numItems: BATCH_SIZE, cursor })
    return {
      page: r.page.map((d) => ({ _id: d._id, outputUrl: d.outputUrl })),
      isDone: r.isDone,
      continueCursor: r.continueCursor,
    }
  },
})

export const findBrandKitsByUserId = internalQuery({
  args: { userId: v.string(), cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    page: v.array(
      v.object({
        _id: v.id('brandKits'),
        logoStorageKey: v.optional(v.string()),
      }),
    ),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { userId, cursor }) => {
    const r = await ctx.db
      .query('brandKits')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .paginate({ numItems: BATCH_SIZE, cursor })
    return {
      page: r.page.map((d) => ({
        _id: d._id,
        logoStorageKey: d.logoStorageKey,
      })),
      isDone: r.isDone,
      continueCursor: r.continueCursor,
    }
  },
})

export const findUrlImportsByUserId = internalQuery({
  args: { userId: v.string(), cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    page: v.array(
      v.object({
        _id: v.id('urlImports'),
        uploadedImageKeys: v.optional(v.array(v.string())),
      }),
    ),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { userId, cursor }) => {
    const r = await ctx.db
      .query('urlImports')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .paginate({ numItems: BATCH_SIZE, cursor })
    return {
      page: r.page.map((d) => ({
        _id: d._id,
        uploadedImageKeys: d.uploadedImageKeys,
      })),
      isDone: r.isDone,
      continueCursor: r.continueCursor,
    }
  },
})

export const findProductInspirationsByUserId = internalQuery({
  args: { userId: v.string(), cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    page: v.array(
      v.object({
        _id: v.id('productInspirations'),
        imageStorageKey: v.optional(v.string()),
      }),
    ),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { userId, cursor }) => {
    const r = await ctx.db
      .query('productInspirations')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .paginate({ numItems: BATCH_SIZE, cursor })
    return {
      page: r.page.map((d) => ({
        _id: d._id,
        imageStorageKey: d.imageStorageKey,
      })),
      isDone: r.isDone,
      continueCursor: r.continueCursor,
    }
  },
})

// ─── Internal mutations (batch deletes) ──────────────────────────────────────

export const deleteUserPlanRows = internalMutation({
  args: { ids: v.array(v.id('userPlans')) },
  returns: v.null(),
  handler: async (ctx, { ids }) => {
    for (const id of ids) await ctx.db.delete(id)
    return null
  },
})

export const deleteBillingEventRows = internalMutation({
  args: { ids: v.array(v.id('billingEvents')) },
  returns: v.null(),
  handler: async (ctx, { ids }) => {
    for (const id of ids) await ctx.db.delete(id)
    return null
  },
})

export const deleteOnboardingProfileRows = internalMutation({
  args: { ids: v.array(v.id('onboardingProfiles')) },
  returns: v.null(),
  handler: async (ctx, { ids }) => {
    for (const id of ids) await ctx.db.delete(id)
    return null
  },
})

export const deleteStudioRunRows = internalMutation({
  args: { ids: v.array(v.id('studioRuns')) },
  returns: v.null(),
  handler: async (ctx, { ids }) => {
    for (const id of ids) await ctx.db.delete(id)
    return null
  },
})

export const deleteProductRows = internalMutation({
  args: { ids: v.array(v.id('products')) },
  returns: v.null(),
  handler: async (ctx, { ids }) => {
    for (const id of ids) await ctx.db.delete(id)
    return null
  },
})

export const deleteProductImageRows = internalMutation({
  args: { ids: v.array(v.id('productImages')) },
  returns: v.null(),
  handler: async (ctx, { ids }) => {
    for (const id of ids) await ctx.db.delete(id)
    return null
  },
})

export const deleteTemplateGenerationRows = internalMutation({
  args: { ids: v.array(v.id('templateGenerations')) },
  returns: v.null(),
  handler: async (ctx, { ids }) => {
    for (const id of ids) await ctx.db.delete(id)
    return null
  },
})

export const deleteBrandKitRows = internalMutation({
  args: { ids: v.array(v.id('brandKits')) },
  returns: v.null(),
  handler: async (ctx, { ids }) => {
    for (const id of ids) await ctx.db.delete(id)
    return null
  },
})

export const deleteUrlImportRows = internalMutation({
  args: { ids: v.array(v.id('urlImports')) },
  returns: v.null(),
  handler: async (ctx, { ids }) => {
    for (const id of ids) await ctx.db.delete(id)
    return null
  },
})

export const deleteProductInspirationRows = internalMutation({
  args: { ids: v.array(v.id('productInspirations')) },
  returns: v.null(),
  handler: async (ctx, { ids }) => {
    for (const id of ids) await ctx.db.delete(id)
    return null
  },
})

// ─── Main internal action ────────────────────────────────────────────────────

/**
 * GDPR right-to-erasure handler. Triggered by Clerk's `user.deleted` webhook.
 *
 * Resolves clerkUserId → internal userId via the same lookup the billing
 * webhook uses (userPlans.clerkUserId). Then walks each user-scoped table,
 * collecting R2 object keys for cleanup and hard-deleting rows in batches.
 *
 * Idempotent: a retried webhook with no remaining rows is a no-op.
 *
 * Does NOT delete the Clerk user account — Clerk already did that.
 */
export const handleUserDeleted = internalAction({
  args: { clerkUserId: v.string() },
  returns: v.null(),
  handler: async (ctx, { clerkUserId }) => {
    // Resolve clerkUserId → tokenIdentifier-shaped userId. If no row exists
    // (user signed up but never synced a plan), fall back to clerkUserId
    // since older code paths sometimes wrote the Clerk id directly.
    const resolvedUserId = (await ctx.runQuery(
      internal.billing.webhookHandler.getUserIdByClerkId,
      { clerkUserId },
    )) as string | null

    // Some tables were written under tokenIdentifier (`userId`), others under
    // raw clerkUserId — depending on whether the row was created via
    // client-auth or webhook. We walk both so we don't leave orphans.
    const userIds = new Set<string>([clerkUserId])
    if (resolvedUserId) userIds.add(resolvedUserId)

    console.log(
      `[userDeletion] Starting GDPR erasure for clerkUserId=${clerkUserId} ` +
        `userIds=${[...userIds].join(',')}`,
    )

    const r2Keys = new Set<string>()
    const counts: Record<string, number> = {}

    for (const userId of userIds) {
      // ── userPlans
      counts.userPlans = (counts.userPlans ?? 0) + (await drainIds(
        ctx,
        userId,
        internal.billing.userDeletion.findUserPlanIdsByUserId,
        internal.billing.userDeletion.deleteUserPlanRows,
      ))

      // ── billingEvents (audit trail; legal-retention concern: per spec we
      // hard-delete immediately. If a finance/compliance review later requires
      // 7-year retention, switch to soft-delete + offline export here.)
      counts.billingEvents = (counts.billingEvents ?? 0) + (await drainIds(
        ctx,
        userId,
        internal.billing.userDeletion.findBillingEventIdsByUserId,
        internal.billing.userDeletion.deleteBillingEventRows,
      ))

      // ── onboardingProfiles
      counts.onboardingProfiles =
        (counts.onboardingProfiles ?? 0) +
        (await drainIds(
          ctx,
          userId,
          internal.billing.userDeletion.findOnboardingProfileIdsByUserId,
          internal.billing.userDeletion.deleteOnboardingProfileRows,
        ))

      // ── studioRuns (legacy, indexed by_userId)
      counts.studioRuns =
        (counts.studioRuns ?? 0) +
        (await drainIds(
          ctx,
          userId,
          internal.billing.userDeletion.findStudioRunIdsByUserId,
          internal.billing.userDeletion.deleteStudioRunRows,
        ))

      // ── products (collect imageUrl + backgroundRemovedUrl as R2 keys)
      counts.products =
        (counts.products ?? 0) +
        (await drainProducts(ctx, userId, r2Keys))

      // ── productImages (imageUrl + thumbnailUrl)
      counts.productImages =
        (counts.productImages ?? 0) +
        (await drainProductImages(ctx, userId, r2Keys))

      // ── templateGenerations (outputUrl)
      counts.templateGenerations =
        (counts.templateGenerations ?? 0) +
        (await drainTemplateGenerations(ctx, userId, r2Keys))

      // ── brandKits (logoStorageKey is explicit)
      counts.brandKits =
        (counts.brandKits ?? 0) +
        (await drainBrandKits(ctx, userId, r2Keys))

      // ── urlImports (uploadedImageKeys is explicit)
      counts.urlImports =
        (counts.urlImports ?? 0) +
        (await drainUrlImports(ctx, userId, r2Keys))

      // ── productInspirations (imageStorageKey is explicit)
      counts.productInspirations =
        (counts.productInspirations ?? 0) +
        (await drainProductInspirations(ctx, userId, r2Keys))
    }

    // Schedule R2 deletes — best-effort, fire-and-forget. clearUserObjectStorage
    // catches its own errors so a single missing object doesn't break the run.
    for (const key of r2Keys) {
      await ctx.scheduler.runAfter(0, internal.r2.clearUserObjectStorage, {
        key,
      })
    }

    const totalRows = Object.values(counts).reduce((a, b) => a + b, 0)
    console.log(
      `[userDeletion] Completed for clerkUserId=${clerkUserId}: ` +
        `rows=${totalRows} r2Keys=${r2Keys.size} ` +
        `breakdown=${JSON.stringify(counts)}`,
    )

    return null
  },
})

// ─── Drain helpers (page through a table, delete batch, repeat) ─────────────

// Shared shape for our finder queries' return value. Per-table queries return
// arrays of typed Ids (or row projections); we widen to `unknown` here so a
// single helper can drive any of them — the deleter mutation re-validates the
// id type via its own argument validator.
type IdPage = {
  page: Array<unknown>
  isDone: boolean
  continueCursor: string
}

async function drainIds(
  ctx: ActionCtx,
  userId: string,
  // FunctionReference for an internalQuery returning { page, isDone, continueCursor }.
  // We don't import the full type — call sites guarantee compatibility.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  finder: any,
  // FunctionReference for an internalMutation taking { ids }.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deleter: any,
): Promise<number> {
  let cursor: string | null = null
  let total = 0
  // Bound the loop in case a cursor never advances (defensive).
  for (let i = 0; i < 1000; i++) {
    const res: IdPage = await ctx.runQuery(finder, { userId, cursor })
    if (res.page.length > 0) {
      await ctx.runMutation(deleter, { ids: res.page })
      total += res.page.length
    }
    if (res.isDone) break
    cursor = res.continueCursor
  }
  return total
}

type ProductPage = {
  page: Array<{
    _id: import('../_generated/dataModel').Id<'products'>
    imageUrl?: string
    backgroundRemovedUrl?: string
  }>
  isDone: boolean
  continueCursor: string
}

async function drainProducts(
  ctx: ActionCtx,
  userId: string,
  r2Keys: Set<string>,
): Promise<number> {
  let cursor: string | null = null
  let total = 0
  for (let i = 0; i < 1000; i++) {
    const res: ProductPage = await ctx.runQuery(
      internal.billing.userDeletion.findProductsByUserId,
      { userId, cursor },
    )
    if (res.page.length > 0) {
      for (const row of res.page) {
        const k1 = r2KeyFromUrl(row.imageUrl)
        if (k1) r2Keys.add(k1)
        const k2 = r2KeyFromUrl(row.backgroundRemovedUrl)
        if (k2) r2Keys.add(k2)
      }
      await ctx.runMutation(
        internal.billing.userDeletion.deleteProductRows,
        { ids: res.page.map((r) => r._id) },
      )
      total += res.page.length
    }
    if (res.isDone) break
    cursor = res.continueCursor
  }
  return total
}

type ProductImagePage = {
  page: Array<{
    _id: import('../_generated/dataModel').Id<'productImages'>
    imageUrl: string
    thumbnailUrl?: string
  }>
  isDone: boolean
  continueCursor: string
}

async function drainProductImages(
  ctx: ActionCtx,
  userId: string,
  r2Keys: Set<string>,
): Promise<number> {
  let cursor: string | null = null
  let total = 0
  for (let i = 0; i < 1000; i++) {
    const res: ProductImagePage = await ctx.runQuery(
      internal.billing.userDeletion.findProductImagesByUserId,
      { userId, cursor },
    )
    if (res.page.length > 0) {
      for (const row of res.page) {
        const k1 = r2KeyFromUrl(row.imageUrl)
        if (k1) r2Keys.add(k1)
        const k2 = r2KeyFromUrl(row.thumbnailUrl)
        if (k2) r2Keys.add(k2)
      }
      await ctx.runMutation(
        internal.billing.userDeletion.deleteProductImageRows,
        { ids: res.page.map((r) => r._id) },
      )
      total += res.page.length
    }
    if (res.isDone) break
    cursor = res.continueCursor
  }
  return total
}

type TemplateGenerationPage = {
  page: Array<{
    _id: import('../_generated/dataModel').Id<'templateGenerations'>
    outputUrl?: string
  }>
  isDone: boolean
  continueCursor: string
}

async function drainTemplateGenerations(
  ctx: ActionCtx,
  userId: string,
  r2Keys: Set<string>,
): Promise<number> {
  let cursor: string | null = null
  let total = 0
  for (let i = 0; i < 1000; i++) {
    const res: TemplateGenerationPage = await ctx.runQuery(
      internal.billing.userDeletion.findTemplateGenerationsByUserId,
      { userId, cursor },
    )
    if (res.page.length > 0) {
      for (const row of res.page) {
        const k = r2KeyFromUrl(row.outputUrl)
        if (k) r2Keys.add(k)
      }
      await ctx.runMutation(
        internal.billing.userDeletion.deleteTemplateGenerationRows,
        { ids: res.page.map((r) => r._id) },
      )
      total += res.page.length
    }
    if (res.isDone) break
    cursor = res.continueCursor
  }
  return total
}

type BrandKitPage = {
  page: Array<{
    _id: import('../_generated/dataModel').Id<'brandKits'>
    logoStorageKey?: string
  }>
  isDone: boolean
  continueCursor: string
}

async function drainBrandKits(
  ctx: ActionCtx,
  userId: string,
  r2Keys: Set<string>,
): Promise<number> {
  let cursor: string | null = null
  let total = 0
  for (let i = 0; i < 1000; i++) {
    const res: BrandKitPage = await ctx.runQuery(
      internal.billing.userDeletion.findBrandKitsByUserId,
      { userId, cursor },
    )
    if (res.page.length > 0) {
      for (const row of res.page) {
        if (row.logoStorageKey) r2Keys.add(row.logoStorageKey)
      }
      await ctx.runMutation(
        internal.billing.userDeletion.deleteBrandKitRows,
        { ids: res.page.map((r) => r._id) },
      )
      total += res.page.length
    }
    if (res.isDone) break
    cursor = res.continueCursor
  }
  return total
}

type UrlImportPage = {
  page: Array<{
    _id: import('../_generated/dataModel').Id<'urlImports'>
    uploadedImageKeys?: string[]
  }>
  isDone: boolean
  continueCursor: string
}

async function drainUrlImports(
  ctx: ActionCtx,
  userId: string,
  r2Keys: Set<string>,
): Promise<number> {
  let cursor: string | null = null
  let total = 0
  for (let i = 0; i < 1000; i++) {
    const res: UrlImportPage = await ctx.runQuery(
      internal.billing.userDeletion.findUrlImportsByUserId,
      { userId, cursor },
    )
    if (res.page.length > 0) {
      for (const row of res.page) {
        if (row.uploadedImageKeys) {
          for (const k of row.uploadedImageKeys) r2Keys.add(k)
        }
      }
      await ctx.runMutation(
        internal.billing.userDeletion.deleteUrlImportRows,
        { ids: res.page.map((r) => r._id) },
      )
      total += res.page.length
    }
    if (res.isDone) break
    cursor = res.continueCursor
  }
  return total
}

type ProductInspirationPage = {
  page: Array<{
    _id: import('../_generated/dataModel').Id<'productInspirations'>
    imageStorageKey?: string
  }>
  isDone: boolean
  continueCursor: string
}

async function drainProductInspirations(
  ctx: ActionCtx,
  userId: string,
  r2Keys: Set<string>,
): Promise<number> {
  let cursor: string | null = null
  let total = 0
  for (let i = 0; i < 1000; i++) {
    const res: ProductInspirationPage = await ctx.runQuery(
      internal.billing.userDeletion.findProductInspirationsByUserId,
      { userId, cursor },
    )
    if (res.page.length > 0) {
      for (const row of res.page) {
        if (row.imageStorageKey) r2Keys.add(row.imageStorageKey)
      }
      await ctx.runMutation(
        internal.billing.userDeletion.deleteProductInspirationRows,
        { ids: res.page.map((r) => r._id) },
      )
      total += res.page.length
    }
    if (res.isDone) break
    cursor = res.continueCursor
  }
  return total
}
