import { httpRouter } from 'convex/server'
import { httpAction } from './_generated/server'
import { internal } from './_generated/api'
import { Webhook } from 'svix'

const http = httpRouter()

// Schema version constant — bump when introducing breaking schema changes
// so external probes can detect deploy boundaries via /healthz.
const SCHEMA_VERSION = '1'
// Captured at module load (per cold start) — close enough for a deploy probe.
const DEPLOYED_AT = new Date().toISOString()

http.route({
  path: '/healthz',
  method: 'GET',
  handler: httpAction(async () => {
    return new Response(
      JSON.stringify({
        ok: true,
        schemaVersion: SCHEMA_VERSION,
        deployedAt: DEPLOYED_AT,
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    )
  }),
})

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

http.route({
  path: '/download',
  method: 'GET',
  handler: httpAction(async (_ctx, request) => {
    const params = new URL(request.url).searchParams
    const imageUrl = params.get('url')
    const filename = params.get('filename') ?? 'design.png'

    if (!imageUrl) return new Response('Missing url', { status: 400 })

    const publicUrl = process.env.R2_PUBLIC_URL
    if (!publicUrl || !imageUrl.startsWith(publicUrl)) {
      return new Response('URL not allowed', { status: 403 })
    }

    const res = await fetch(imageUrl)
    if (!res.ok) return new Response('Fetch failed', { status: 502 })

    return new Response(await res.arrayBuffer(), {
      status: 200,
      headers: {
        'Content-Type': res.headers.get('content-type') ?? 'image/png',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  }),
})

export default http
