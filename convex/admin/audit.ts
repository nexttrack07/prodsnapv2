import { v } from 'convex/values'
import { query, internalMutation } from '../_generated/server'
import { requireAdminIdentity } from '../lib/admin/requireAdmin'

export const listAuditEvents = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminIdentity(ctx)
    return ctx.db
      .query('adminAuditEvents')
      .withIndex('by_at')
      .order('desc')
      .take(100)
  },
})

export const insertAuditEvent = internalMutation({
  args: {
    adminUserId: v.string(),
    action: v.string(),
    targetUserId: v.optional(v.string()),
    targetId: v.optional(v.string()),
    details: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('adminAuditEvents', {
      adminUserId: args.adminUserId,
      action: args.action,
      targetUserId: args.targetUserId,
      targetId: args.targetId,
      details: args.details,
      at: Date.now(),
    })
  },
})
