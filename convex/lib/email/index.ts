import { v } from 'convex/values'
import { internalAction } from '../../_generated/server'
import { Resend } from 'resend'

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
