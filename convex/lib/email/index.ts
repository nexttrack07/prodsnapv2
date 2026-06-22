import { v } from 'convex/values'
import { internalAction } from '../../_generated/server'
import { Resend } from 'resend'

export const sendTrialEndingEmail = internalAction({
  args: { email: v.string(), name: v.optional(v.string()) },
  handler: async (ctx, { email, name }) => {
    if (!process.env.RESEND_API_KEY) {
      console.warn('[email] RESEND_API_KEY not set. Skipping trial email to', email)
      return
    }
    
    const resend = new Resend(process.env.RESEND_API_KEY)
    
    const { error } = await resend.emails.send({
      from: 'ProdSnap Support <info@prodsnap.io>',
      to: email,
      subject: 'Your 7-day trial is ending soon',
      html: `<p>Hi ${name || 'there'},</p>
<p>Your free trial of ProdSnap is ending in 3 days. We hope you've enjoyed generating product photos!</p>
<p>If you'd like to cancel, you can do so from the <a href="https://prodsnap.io/account/billing">billing dashboard</a>.</p>
<p>Thanks,<br/>The ProdSnap Team</p>`,
    })
    
    if (error) {
      console.error('[email] Error sending trial ending email:', error)
      throw new Error(error.message)
    }
  },
})

/**
 * Weekly Ad Test lifecycle nudge: "your test has had a week to run — log the
 * winner and create next week's test." Returns `{ sent }` so the caller only
 * stamps `lastLifecycleEmailSentAt` on a real send. When RESEND_API_KEY is
 * unset this is a no-op stub (sent=false) — the documented retention gap until
 * the email provider is configured; the test stays eligible for a later sweep.
 */
export const sendAdTestLifecycleEmail = internalAction({
  args: {
    email: v.string(),
    name: v.optional(v.string()),
    productName: v.string(),
    testName: v.string(),
    deepLink: v.string(),
  },
  returns: v.object({ sent: v.boolean() }),
  handler: async (_ctx, { email, name, productName, testName, deepLink }) => {
    if (!process.env.RESEND_API_KEY) {
      console.warn(
        '[email] RESEND_API_KEY not set. Skipping Ad Test lifecycle email to',
        email,
        '— retention gap until provider is configured.',
      )
      return { sent: false }
    }

    const resend = new Resend(process.env.RESEND_API_KEY)

    const { error } = await resend.emails.send({
      from: 'ProdSnap <info@prodsnap.io>',
      to: email,
      subject: `Your "${testName}" test has had a week to run`,
      html: `<p>Hi ${name || 'there'},</p>
<p>Your <strong>${testName}</strong> test for ${productName} has had a week to run. Log the winner and spin up next week's Ad Test while the momentum's there.</p>
<p><a href="${deepLink}">Open the test and log your winner →</a></p>
<p>Thanks,<br/>The ProdSnap Team</p>`,
    })

    if (error) {
      console.error('[email] Error sending Ad Test lifecycle email:', error)
      throw new Error(error.message)
    }
    return { sent: true }
  },
})

export const sendPaymentFailedEmail = internalAction({
  args: { email: v.string(), name: v.optional(v.string()) },
  handler: async (ctx, { email, name }) => {
    if (!process.env.RESEND_API_KEY) {
      console.warn('[email] RESEND_API_KEY not set. Skipping payment failure email to', email)
      return
    }

    const resend = new Resend(process.env.RESEND_API_KEY)

    const { error } = await resend.emails.send({
      from: 'ProdSnap Support <info@prodsnap.io>',
      to: email,
      subject: 'Action Required: Payment failed',
      html: `<p>Hi ${name || 'there'},</p>
<p>We couldn't process the latest payment for your ProdSnap subscription.</p>
<p>Please update your payment method on your <a href="https://prodsnap.io/account/billing">billing dashboard</a> to avoid losing access to the studio.</p>
<p>Thanks,<br/>The ProdSnap Team</p>`,
    })
    
    if (error) {
      console.error('[email] Error sending payment failed email:', error)
      throw new Error(error.message)
    }
  },
})
