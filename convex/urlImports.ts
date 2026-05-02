/**
 * URL import: paste a Shopify or product page URL → scrape with Firecrawl →
 * AI-extract product fields + brand kit fields → re-host images to R2 →
 * create the product (which then runs analysis) and upsert the brand kit.
 *
 * V8 surface only — public mutations + queries. The orchestration action
 * lives in `urlImportsActions.ts` ('use node') because it uses the Node-only
 * R2 helpers.
 *
 * Required env: FIRECRAWL_API_KEY
 */
import { v } from 'convex/values'
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server'
import { internal } from './_generated/api'

async function requireAuth(ctx: { auth: { getUserIdentity: () => Promise<unknown> } }): Promise<string> {
  const identity = (await ctx.auth.getUserIdentity()) as { tokenIdentifier: string } | null
  if (!identity) throw new Error('Not authenticated')
  return identity.tokenIdentifier
}

// ─── Public queries ────────────────────────────────────────────────────────
export const getUrlImport = query({
  args: { importId: v.id('urlImports') },
  handler: async (ctx, { importId }) => {
    const userId = await requireAuth(ctx)
    const row = await ctx.db.get(importId)
    if (!row || row.userId !== userId) return null
    return row
  },
})

export const listMyUrlImports = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx)
    return await ctx.db
      .query('urlImports')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .order('desc')
      .take(20)
  },
})

// ─── Public mutation: kick off an import ──────────────────────────────────
export const createUrlImport = mutation({
  args: {
    url: v.string(),
    mode: v.optional(v.union(
      v.literal('product-and-brand'),
      v.literal('brand-only'),
    )),
  },
  handler: async (ctx, { url, mode }) => {
    const userId = await requireAuth(ctx)
    const sourceUrl = normalizeUrl(url)
    const resolvedMode = mode ?? 'product-and-brand'

    const inflight = await ctx.db
      .query('urlImports')
      .withIndex('by_userId_sourceUrl', (q) => q.eq('userId', userId).eq('sourceUrl', sourceUrl))
      .filter((q) =>
        q.or(
          q.eq(q.field('status'), 'pending'),
          q.eq(q.field('status'), 'scraping'),
          q.eq(q.field('status'), 'extracting'),
          q.eq(q.field('status'), 'uploading'),
        ),
      )
      .first()
    if (inflight) return inflight._id

    const importId = await ctx.db.insert('urlImports', {
      userId,
      sourceUrl,
      status: 'pending',
      currentStep: 'Queued',
      mode: resolvedMode,
      createdAt: Date.now(),
    })
    await ctx.scheduler.runAfter(0, internal.urlImportsActions.runUrlImport, {
      importId,
    })
    return importId
  },
})

function normalizeUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) throw new Error('URL is required')
  let parsed: URL
  try {
    parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
  } catch {
    throw new Error("That URL doesn't look valid")
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http(s) URLs are supported')
  }
  return parsed.toString()
}

// ─── Internal mutation: status patches ────────────────────────────────────
export const patchImportStatus = internalMutation({
  args: {
    importId: v.id('urlImports'),
    status: v.optional(
      v.union(
        v.literal('pending'),
        v.literal('scraping'),
        v.literal('extracting'),
        v.literal('uploading'),
        v.literal('done'),
        v.literal('failed'),
      ),
    ),
    currentStep: v.optional(v.string()),
    productId: v.optional(v.id('products')),
    brandKitUpdated: v.optional(v.boolean()),
    error: v.optional(v.string()),
    finishedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { importId, ...patch } = args
    const cleaned: Record<string, unknown> = {}
    for (const [k, v2] of Object.entries(patch)) {
      if (v2 !== undefined) cleaned[k] = v2
    }
    await ctx.db.patch(importId, cleaned)
  },
})

// ─── Internal mutation: save distilled results from runUrlImport ──────────
// Called by the action after scraping + distillation. Stores the distilled
// fields directly on the import row so the frontend can autofill the form
// without a product row being created yet.
export const saveDistilledResults = internalMutation({
  args: {
    importId: v.id('urlImports'),
    distilledName: v.optional(v.string()),
    distilledDescription: v.optional(v.string()),
    distilledCategory: v.optional(v.string()),
    distilledTags: v.optional(v.array(v.string())),
    distilledAiNotes: v.optional(v.string()),
    distilledPrice: v.optional(v.number()),
    distilledCurrency: v.optional(v.string()),
    distilledReviewSnippets: v.optional(v.array(v.string())),
    uploadedImageUrls: v.array(v.string()),
    uploadedImageKeys: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { importId, ...patch }) => {
    await ctx.db.patch(importId, patch)
  },
})

// ─── Public mutation: discard a URL import (Cancel from /products/new) ────
// Cleans up the import row + its uploaded R2 objects. The brand kit
// (if upserted during import) stays — that's user-level data, not tied
// to a single import attempt. Called when the user clicks Cancel after
// importing but before saving a product.
export const discardUrlImport = mutation({
  args: { importId: v.id('urlImports') },
  handler: async (ctx, { importId }) => {
    const userId = await requireAuth(ctx)
    const row = await ctx.db.get(importId)
    if (!row) return // already gone
    if (row.userId !== userId) throw new Error('Not authorized to discard this import')

    const keys = row.uploadedImageKeys ?? []
    if (keys.length > 0) {
      // Schedule R2 deletion via the node-runtime action (we can't call
      // S3Client from a V8 mutation). Best-effort — never blocks discard.
      await ctx.scheduler.runAfter(0, internal.urlImportsActions.deleteImportR2Objects, {
        keys,
      })
    }

    await ctx.db.delete(importId)
  },
})

// ─── Internal query: used by the orchestration action ────────────────────
export const getInternal = internalQuery({
  args: { importId: v.id('urlImports') },
  handler: async (ctx, { importId }) => {
    return await ctx.db.get(importId)
  },
})
