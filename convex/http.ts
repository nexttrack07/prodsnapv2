import { httpRouter } from 'convex/server'
import { httpAction } from './_generated/server'
import { internal } from './_generated/api'
import { Webhook } from 'svix'

const http = httpRouter()

http.route({
  path: '/webhooks/clerk',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const webhookSecret = process.env.CLERK_WEBHOOK_SECRET
    if (!webhookSecret) {
      console.error('[webhooks/clerk] CLERK_WEBHOOK_SECRET not set')
      return new Response('Webhook secret not configured', { status: 500 })
    }

    // Read raw body as text for Svix signature verification.
    // Convex's Request object exposes .text() but not .bytes().
    const bodyText = await request.text()

    const svixId = request.headers.get('svix-id')
    const svixTimestamp = request.headers.get('svix-timestamp')
    const svixSignature = request.headers.get('svix-signature')

    if (!svixId || !svixTimestamp || !svixSignature) {
      return new Response('Missing svix headers', { status: 401 })
    }

    // Verify signature using the Svix library.
    let event: { type: string; data: unknown }
    try {
      const wh = new Webhook(webhookSecret)
      event = wh.verify(bodyText, {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      }) as { type: string; data: unknown }
    } catch (err) {
      console.error('[webhooks/clerk] Signature verification failed:', err)
      return new Response('Invalid signature', { status: 401 })
    }

    // Dedup: record the event. Returns false if already seen (replay).
    const isNew = await ctx.runMutation(
      internal.billing.webhookHandler.recordWebhookEvent,
      {
        eventId: svixId,
        type: event.type,
        rawBody: bodyText,
      },
    )

    if (!isNew) {
      // Replay accepted silently — idempotent.
      return new Response('OK', { status: 200 })
    }

    // Dispatch handler asynchronously so we can return 200 immediately.
    await ctx.scheduler.runAfter(
      0,
      internal.billing.webhookHandler.handleBillingEvent,
      {
        eventId: svixId,
        eventType: event.type,
        payload: bodyText,
      },
    )

    return new Response('OK', { status: 200 })
  }),
})

export default http
