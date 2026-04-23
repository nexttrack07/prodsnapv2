import { v } from 'convex/values'
import { internalAction, internalMutation, internalQuery } from '../_generated/server'
import { internal } from '../_generated/api'

const SUPPORTED_EVENTS = new Set([
  'subscription.created',
  'subscription.updated',
  'subscription.active',
  'subscriptionItem.past_due',
  'subscriptionItem.canceled',
  'user.updated',
])

/**
 * Internal query — check if a webhook event has already been processed.
 */
export const getWebhookEvent = internalQuery({
  args: { eventId: v.string() },
  returns: v.union(v.object({ handled: v.boolean() }), v.null()),
  handler: async (ctx, { eventId }) => {
    const row = await ctx.db
      .query('webhookEvents')
      .withIndex('by_eventId', (q) => q.eq('eventId', eventId))
      .unique()
    if (!row) return null
    return { handled: row.handled }
  },
})

/**
 * Internal mutation — record a webhook event (dedup insert).
 * Returns false if the event was already recorded (replay).
 */
export const recordWebhookEvent = internalMutation({
  args: {
    eventId: v.string(),
    type: v.string(),
    rawBody: v.optional(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, { eventId, type, rawBody }) => {
    const existing = await ctx.db
      .query('webhookEvents')
      .withIndex('by_eventId', (q) => q.eq('eventId', eventId))
      .unique()
    if (existing) return false
    await ctx.db.insert('webhookEvents', {
      eventId,
      type,
      receivedAt: Date.now(),
      handled: false,
      rawBody,
    })
    return true
  },
})

/**
 * Internal mutation — mark a webhook event as handled (or record an error).
 */
export const markWebhookHandled = internalMutation({
  args: {
    eventId: v.string(),
    handlerError: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { eventId, handlerError }) => {
    const row = await ctx.db
      .query('webhookEvents')
      .withIndex('by_eventId', (q) => q.eq('eventId', eventId))
      .unique()
    if (!row) return null
    await ctx.db.patch(row._id, {
      handled: handlerError === undefined,
      handlerError,
    })
    return null
  },
})

/**
 * Internal action — dispatched by the HTTP handler after recording the event.
 * Extracts clerkUserId from the event payload and calls syncUserPlanInternal.
 */
export const handleBillingEvent = internalAction({
  args: {
    eventId: v.string(),
    eventType: v.string(),
    payload: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { eventId, eventType, payload }) => {
    if (!SUPPORTED_EVENTS.has(eventType)) {
      console.log(`[webhookHandler] Ignoring unsupported event type: ${eventType}`)
      await ctx.runMutation(internal.billing.webhookHandler.markWebhookHandled, {
        eventId,
      })
      return null
    }

    let data: Record<string, unknown>
    try {
      data = JSON.parse(payload)
    } catch {
      await ctx.runMutation(internal.billing.webhookHandler.markWebhookHandled, {
        eventId,
        handlerError: 'Failed to parse payload JSON',
      })
      return null
    }

    // Extract clerkUserId from the event. For subscription events the user id
    // is nested under data.object.subscriber_id or data.subscriber_id.
    // For user.updated it is data.id.
    const clerkUserId =
      (data?.data as any)?.subscriber_id ??
      (data?.data as any)?.object?.subscriber_id ??
      (data?.data as any)?.id ??
      null

    if (!clerkUserId || typeof clerkUserId !== 'string') {
      console.error(
        `[webhookHandler] Could not extract clerkUserId from event ${eventType}:`,
        JSON.stringify(data).slice(0, 500),
      )
      await ctx.runMutation(internal.billing.webhookHandler.markWebhookHandled, {
        eventId,
        handlerError: 'Could not extract clerkUserId from payload',
      })
      return null
    }

    // Derive tokenIdentifier — Convex uses `<issuer>|<subject>` as the stable
    // identity key. For webhook-driven syncs we use clerkUserId as the userId
    // key since we can't derive tokenIdentifier server-side without the JWT.
    // writePlan accepts any string userId; for webhook paths we store the
    // Clerk user ID directly until the user's next client-initiated sync
    // normalises it to tokenIdentifier.
    //
    // To keep things consistent with client-sync we call syncUserPlanInternal
    // which will look up existing rows by userId. Since the webhook won't have
    // the tokenIdentifier, we look up the existing row by clerkUserId first.
    const existingUserId = (await ctx.runQuery(
      internal.billing.webhookHandler.getUserIdByClerkId,
      { clerkUserId },
    )) as string | null

    const userId = existingUserId ?? clerkUserId

    try {
      await ctx.runAction(internal.billing.syncPlan.syncUserPlanInternal, {
        userId,
        clerkUserId,
      })
      await ctx.runMutation(internal.billing.webhookHandler.markWebhookHandled, {
        eventId,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[webhookHandler] syncUserPlanInternal failed for ${eventType}:`, msg)
      await ctx.runMutation(internal.billing.webhookHandler.markWebhookHandled, {
        eventId,
        handlerError: msg,
      })
    }

    return null
  },
})

/**
 * Internal query — find an existing userPlans row's userId by clerkUserId.
 * Used so webhook syncs hit the same row as client-initiated syncs.
 */
export const getUserIdByClerkId = internalQuery({
  args: { clerkUserId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { clerkUserId }) => {
    const row = await ctx.db
      .query('userPlans')
      .filter((q) => q.eq(q.field('clerkUserId'), clerkUserId))
      .first()
    return row?.userId ?? null
  },
})
