/**
 * Custom (user-uploaded) templates.
 *
 * A custom template is an `adTemplates` row owned by a user (ownerUserId set).
 * It rides the exact same generation path as a curated library template — the
 * generator only needs the seed image — so there is no special-casing in
 * studio/ai. These functions are the user-facing CRUD around that row.
 *
 * Visibility (admin-in-the-middle approval flow):
 *   - 'private' (default): only the owner sees and can generate from it.
 *   - 'pending': the owner has requested it be made public and it's awaiting
 *     admin review. Behaves like 'private' to everyone except the owner.
 *   - 'public': admin-approved; anyone can see it in the discover browse and
 *     generate from it.
 *
 * Users may only request (private -> pending) or withdraw / take down
 * (pending|public -> private). Promotion to 'public' is admin-only.
 *
 * The image bytes are uploaded first via `r2.uploadCustomTemplateImage`, which
 * returns the URLs/keys/aspect this mutation persists.
 */
import { v } from 'convex/values'
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server'
import { internal } from './_generated/api'
import { logAdminAction, requireAdminIdentity } from './lib/admin/requireAdmin'

async function requireAuth(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error('Not authenticated')
  return identity.tokenIdentifier
}

const aspectRatioLiteral = v.union(
  v.literal('1:1'),
  v.literal('4:5'),
  v.literal('9:16'),
  v.literal('16:9'),
)

/**
 * Persist an uploaded image as a private custom template owned by the caller.
 * Custom templates skip the AI tagging pipeline — the seed image drives the
 * generation, and tags are only a secondary filtering aid.
 */
export const createCustomTemplate = mutation({
  args: {
    name: v.string(),
    imageUrl: v.string(),
    thumbnailUrl: v.string(),
    imageStorageKey: v.optional(v.string()),
    thumbnailStorageKey: v.optional(v.string()),
    aspectRatio: aspectRatioLiteral,
    width: v.number(),
    height: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx)
    const name = args.name.trim().slice(0, 120) || 'My template'

    return await ctx.db.insert('adTemplates', {
      imageUrl: args.imageUrl,
      thumbnailUrl: args.thumbnailUrl,
      imageStorageKey: args.imageStorageKey,
      thumbnailStorageKey: args.thumbnailStorageKey,
      aspectRatio: args.aspectRatio,
      width: args.width,
      height: args.height,
      // Published immediately so it's usable as a generation seed; the curated
      // library's ingest/tag workflow is intentionally skipped for custom rows.
      status: 'published',
      ownerUserId: userId,
      visibility: 'private',
      name,
    })
  },
})

/** All custom templates owned by the caller, newest first. */
export const listMyCustomTemplates = query({
  args: {},
  handler: async (ctx) => {
    const userId = await ctx.auth.getUserIdentity()
    if (!userId) return []
    const rows = await ctx.db
      .query('adTemplates')
      .withIndex('by_owner', (q) => q.eq('ownerUserId', userId.tokenIdentifier))
      .order('desc')
      .take(500)
    return rows
  },
})

/**
 * Owner requests that their custom template be made public. This only records
 * intent (visibility -> 'pending'); an admin must approve before it becomes
 * 'public'. A user can NEVER set 'public' directly.
 *
 * Allowed from 'private' or 'pending' (idempotent re-request). Rejected if the
 * row is already 'public' — that approval can only be undone via
 * makeTemplatePrivate (take down), not re-requested.
 */
export const requestPublicTemplate = mutation({
  args: { templateId: v.id('adTemplates') },
  handler: async (ctx, { templateId }) => {
    const userId = await requireAuth(ctx)
    const row = await ctx.db.get(templateId)
    if (!row) throw new Error('Template not found')
    if (row.ownerUserId !== userId) throw new Error('Not authorized')
    if (row.visibility === 'public') {
      throw new Error('Template is already public')
    }
    if (row.visibility === 'pending') return // idempotent
    await ctx.db.patch(templateId, { visibility: 'pending' })
  },
})

/**
 * Owner takes a custom template back to private. Covers BOTH withdrawing a
 * still-pending publish request AND taking down an already-approved public
 * template. Owner only. Never lets a user set 'public'.
 */
export const makeTemplatePrivate = mutation({
  args: { templateId: v.id('adTemplates') },
  handler: async (ctx, { templateId }) => {
    const userId = await requireAuth(ctx)
    const row = await ctx.db.get(templateId)
    if (!row) throw new Error('Template not found')
    if (row.ownerUserId !== userId) throw new Error('Not authorized')
    if (row.visibility === 'private') return // idempotent
    await ctx.db.patch(templateId, { visibility: 'private' })
  },
})

/** Delete a custom template + best-effort R2 cleanup. Owner only. */
export const deleteCustomTemplate = mutation({
  args: { templateId: v.id('adTemplates') },
  handler: async (ctx, { templateId }) => {
    const userId = await requireAuth(ctx)
    const row = await ctx.db.get(templateId)
    if (!row) return
    if (row.ownerUserId !== userId) throw new Error('Not authorized')

    await ctx.db.delete(templateId)
    if (row.imageStorageKey) {
      await ctx.scheduler.runAfter(0, internal.r2.clearTemplateStorage, {
        key: row.imageStorageKey,
      })
    }
    if (row.thumbnailStorageKey && row.thumbnailStorageKey !== row.imageStorageKey) {
      await ctx.scheduler.runAfter(0, internal.r2.clearTemplateStorage, {
        key: row.thumbnailStorageKey,
      })
    }
  },
})

// ─── Admin moderation (admin-in-the-middle approval) ──────────────────────────
// A user can only request publication (visibility -> 'pending'). An admin
// reviews pending submissions and either approves (-> 'public') or rejects
// (-> 'private'). Gated by requireAdminIdentity + audited via logAdminAction,
// mirroring the curated-library admin functions in convex/templates.ts.

/**
 * All user-submitted custom templates awaiting review (visibility 'pending'),
 * newest first. Admin only. Uses the by_visibility_status index.
 */
export const listPendingCustomTemplates = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminIdentity(ctx)
    const rows = await ctx.db
      .query('adTemplates')
      .withIndex('by_visibility_status', (q) => q.eq('visibility', 'pending'))
      .order('desc')
      .take(500)
    return rows.map((r) => ({
      _id: r._id,
      _creationTime: r._creationTime,
      imageUrl: r.imageUrl,
      thumbnailUrl: r.thumbnailUrl,
      name: r.name,
      ownerUserId: r.ownerUserId,
      aspectRatio: r.aspectRatio,
    }))
  },
})

/**
 * Approve a pending custom template: visibility 'pending' -> 'public'. Admin
 * only. Requires the row to currently be 'pending' (legal predecessor guard).
 */
export const approveCustomTemplate = mutation({
  args: { templateId: v.id('adTemplates') },
  handler: async (ctx, { templateId }) => {
    const adminUserId = await requireAdminIdentity(ctx)
    const row = await ctx.db.get(templateId)
    if (!row) throw new Error('Template not found')
    if (row.visibility !== 'pending') {
      throw new Error('Template is not pending review')
    }
    await ctx.db.patch(templateId, { visibility: 'public' })
    await logAdminAction(ctx, adminUserId, {
      action: 'customTemplate.approve',
      targetId: templateId,
      targetUserId: row.ownerUserId,
    })
  },
})

/**
 * Reject a pending custom template: visibility 'pending' -> 'private'. Admin
 * only. Requires the row to currently be 'pending'. An optional reason is
 * recorded in the admin audit log.
 */
export const rejectCustomTemplate = mutation({
  args: { templateId: v.id('adTemplates'), reason: v.optional(v.string()) },
  handler: async (ctx, { templateId, reason }) => {
    const adminUserId = await requireAdminIdentity(ctx)
    const row = await ctx.db.get(templateId)
    if (!row) throw new Error('Template not found')
    if (row.visibility !== 'pending') {
      throw new Error('Template is not pending review')
    }
    await ctx.db.patch(templateId, { visibility: 'private' })
    await logAdminAction(ctx, adminUserId, {
      action: 'customTemplate.reject',
      targetId: templateId,
      targetUserId: row.ownerUserId,
      details: reason ? { reason } : undefined,
    })
  },
})
