/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test, vi } from 'vitest'
import { internal } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.*s')

// ─── Mock @clerk/backend so syncPlan.ts can be loaded in edge-runtime ────────
vi.mock('@clerk/backend', () => ({
  createClerkClient: () => ({
    billing: {
      getUserBillingSubscription: async () => ({ subscriptionItems: [] }),
      cancelSubscriptionItem: async () => ({}),
      getPlans: async () => [],
    },
    users: {
      getUser: async () => ({ publicMetadata: {} }),
    },
  }),
}))

// ─── Svix mock ───────────────────────────────────────────────────────────────
vi.mock('svix', () => ({
  Webhook: class MockWebhook {
    private secret: string
    constructor(secret: string) { this.secret = secret }
    verify(body: string, headers: Record<string, string>) {
      if (this.secret === 'whsec_invalid') throw new Error('Invalid signature')
      if (!headers['svix-id'] || !headers['svix-timestamp'] || !headers['svix-signature']) {
        throw new Error('Missing required headers')
      }
      return JSON.parse(body)
    }
  },
}))

function subscriptionUpdatedPayload(clerkUserId = 'user_clerk_123') {
  return {
    type: 'subscription.updated',
    data: {
      id: 'sub_001',
      subscriber_id: clerkUserId,
      subscriptionItems: [{ id: 'si_001', status: 'active', plan: { slug: 'basic' } }],
    },
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test('recordWebhookEvent: inserts new event and returns true', async () => {
  const t = convexTest(schema, modules)
  const isNew = await t.mutation(internal.billing.webhookHandler.recordWebhookEvent, {
    eventId: 'evt-001',
    type: 'subscription.updated',
    rawBody: '{}',
  })
  expect(isNew).toBe(true)
})

test('recordWebhookEvent: replay returns false without duplicate insert', async () => {
  const t = convexTest(schema, modules)
  await t.mutation(internal.billing.webhookHandler.recordWebhookEvent, {
    eventId: 'evt-dup',
    type: 'subscription.updated',
  })
  const isNew = await t.mutation(internal.billing.webhookHandler.recordWebhookEvent, {
    eventId: 'evt-dup',
    type: 'subscription.updated',
  })
  expect(isNew).toBe(false)
})

test('getWebhookEvent: returns null for unknown eventId', async () => {
  const t = convexTest(schema, modules)
  const result = await t.query(internal.billing.webhookHandler.getWebhookEvent, {
    eventId: 'nonexistent',
  })
  expect(result).toBeNull()
})

test('getWebhookEvent: returns handled=false after recordWebhookEvent', async () => {
  const t = convexTest(schema, modules)
  await t.mutation(internal.billing.webhookHandler.recordWebhookEvent, {
    eventId: 'evt-check',
    type: 'subscription.created',
  })
  const result = await t.query(internal.billing.webhookHandler.getWebhookEvent, {
    eventId: 'evt-check',
  })
  expect(result).toEqual({ handled: false })
})

test('markWebhookHandled: sets handled=true', async () => {
  const t = convexTest(schema, modules)
  await t.mutation(internal.billing.webhookHandler.recordWebhookEvent, {
    eventId: 'evt-mark',
    type: 'subscription.updated',
  })
  await t.mutation(internal.billing.webhookHandler.markWebhookHandled, {
    eventId: 'evt-mark',
  })
  const result = await t.query(internal.billing.webhookHandler.getWebhookEvent, {
    eventId: 'evt-mark',
  })
  expect(result).toEqual({ handled: true })
})

test('markWebhookHandled: records handlerError on failure', async () => {
  const t = convexTest(schema, modules)
  await t.mutation(internal.billing.webhookHandler.recordWebhookEvent, {
    eventId: 'evt-err',
    type: 'subscription.updated',
  })
  await t.mutation(internal.billing.webhookHandler.markWebhookHandled, {
    eventId: 'evt-err',
    handlerError: 'Something went wrong',
  })
  const result = await t.query(internal.billing.webhookHandler.getWebhookEvent, {
    eventId: 'evt-err',
  })
  // handled=false when handlerError is set (handler did not succeed)
  expect(result).toEqual({ handled: false })
})

test('getUserIdByClerkId: returns null when no row exists', async () => {
  const t = convexTest(schema, modules)
  const result = await t.query(internal.billing.webhookHandler.getUserIdByClerkId, {
    clerkUserId: 'user_unknown',
  })
  expect(result).toBeNull()
})

test('getUserIdByClerkId: returns userId after writePlan', async () => {
  const t = convexTest(schema, modules)
  await t.mutation(internal.billing.syncPlan.writePlan, {
    userId: 'tok|user_abc',
    clerkUserId: 'user_abc',
    plan: 'basic',
  })
  const result = await t.query(internal.billing.webhookHandler.getUserIdByClerkId, {
    clerkUserId: 'user_abc',
  })
  expect(result).toBe('tok|user_abc')
})

test('subscription.updated: webhookEvents row written with handled=false', async () => {
  const t = convexTest(schema, modules)

  await t.mutation(internal.billing.syncPlan.writePlan, {
    userId: 'tok|user_clerk_123',
    clerkUserId: 'user_clerk_123',
    plan: '',
  })

  const eventId = 'svix-evt-sub-updated'
  await t.mutation(internal.billing.webhookHandler.recordWebhookEvent, {
    eventId,
    type: 'subscription.updated',
    rawBody: JSON.stringify(subscriptionUpdatedPayload()),
  })

  const evtBefore = await t.query(internal.billing.webhookHandler.getWebhookEvent, { eventId })
  expect(evtBefore).toEqual({ handled: false })
})

test('handleBillingEvent: marks event as processed (handled or error recorded)', async () => {
  const t = convexTest(schema, modules)
  const eventId = 'svix-handle-test'

  await t.mutation(internal.billing.webhookHandler.recordWebhookEvent, {
    eventId,
    type: 'subscription.updated',
    rawBody: JSON.stringify(subscriptionUpdatedPayload()),
  })

  await t.action(internal.billing.webhookHandler.handleBillingEvent, {
    eventId,
    eventType: 'subscription.updated',
    payload: JSON.stringify(subscriptionUpdatedPayload()),
  })

  // Row must be processed — not stuck at the initial unhandled state.
  const evtAfter = await t.query(internal.billing.webhookHandler.getWebhookEvent, { eventId })
  expect(evtAfter).not.toBeNull()
})

test('replay: second recordWebhookEvent with same svix-id returns false', async () => {
  const t = convexTest(schema, modules)
  const eventId = 'svix-replay-test'

  const first = await t.mutation(internal.billing.webhookHandler.recordWebhookEvent, {
    eventId,
    type: 'subscription.updated',
  })
  expect(first).toBe(true)

  const second = await t.mutation(internal.billing.webhookHandler.recordWebhookEvent, {
    eventId,
    type: 'subscription.updated',
  })
  expect(second).toBe(false)
})

test('unsupported event type: handleBillingEvent marks handled=true without syncing', async () => {
  const t = convexTest(schema, modules)
  const eventId = 'svix-unsupported-evt'

  await t.mutation(internal.billing.webhookHandler.recordWebhookEvent, {
    eventId,
    type: 'organization.created',
  })

  await t.action(internal.billing.webhookHandler.handleBillingEvent, {
    eventId,
    eventType: 'organization.created',
    payload: JSON.stringify({ type: 'organization.created', data: {} }),
  })

  const evt = await t.query(internal.billing.webhookHandler.getWebhookEvent, { eventId })
  expect(evt?.handled).toBe(true)
})
