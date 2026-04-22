[Skip to main content](https://clerk.com/docs/nextjs/guides/development/custom-flows/billing/checkout-new-payment-method#main)

# Build a custom checkout flow with a new payment method

1. [Enable Billing Features](https://clerk.com/docs/nextjs/guides/development/custom-flows/billing/checkout-new-payment-method#enable-billing-features)
2. [Build the custom flow](https://clerk.com/docs/nextjs/guides/development/custom-flows/billing/checkout-new-payment-method#build-the-custom-flow)

Available in other SDKs

Copy as markdownMarkdownCopy as markdown

[Open inOpen in ChatGPTOpenAI](https://chatgpt.com/?q=Read+https%3A%2F%2Fclerk.com%2Fdocs%2Fnextjs%2Fguides%2Fdevelopment%2Fcustom-flows%2Fbilling%2Fcheckout-new-payment-method.md&hints=search)

Warning

This guide is for users who want to build a custom flow⁠. To use a _prebuilt_ UI, use the [Account Portal pages](https://clerk.com/docs/guides/account-portal/overview) or [prebuilt components](https://clerk.com/docs/nextjs/reference/components/overview).

Warning

Billing is currently in Beta and its APIs are experimental and may undergo breaking changes. To mitigate potential disruptions, we recommend [pinning](https://clerk.com/docs/pinning) your SDK and `clerk-js` package versions.

This guide will walk you through how to build a custom user interface for a checkout flow that allows users to **add a new payment method during checkout**.

For the custom flow that allows users to checkout **with an existing payment** method, see the [dedicated guide](https://clerk.com/docs/nextjs/guides/development/custom-flows/billing/checkout-existing-payment-method).

For the custom flow that allows users to add a new payment method to their account, **outside of a checkout flow**, see the [dedicated guide](https://clerk.com/docs/nextjs/guides/development/custom-flows/billing/add-new-payment-method).

## [Enable Billing Features](https://clerk.com/docs/nextjs/guides/development/custom-flows/billing/checkout-new-payment-method\#enable-billing-features)

To use Billing Features, you first need to ensure they are enabled for your application. Follow the [Billing documentation](https://clerk.com/docs/guides/billing/overview) to enable them and setup your Plans.

## [Build the custom flow](https://clerk.com/docs/nextjs/guides/development/custom-flows/billing/checkout-new-payment-method\#build-the-custom-flow)

To create a checkout session with a new payment card, you must:

1. Set up the checkout provider with Plan details.
2. Initialize the checkout session when the user is ready.
3. Render the payment form for card collection.
4. Confirm the payment with the collected payment method.
5. Complete the checkout process and redirect the user.

The following example:

1. Uses the [useCheckout()](https://clerk.com/docs/nextjs/reference/hooks/use-checkout) hook to initiate and manage the checkout session.
2. Uses the [usePaymentElement()](https://clerk.com/docs/nextjs/reference/hooks/use-payment-element) hook to control the payment element, which is rendered by `<PaymentElement />`.
3. Assumes that you have already have a valid `planId`, which you can acquire in many ways.

- [Copy from the Clerk Dashboard⁠](https://dashboard.clerk.com/~/billing/plans).
- Use the [Clerk Backend API⁠](https://clerk.com/docs/reference/backend-api/tag/commerce/get/commerce/plans#tag/commerce/get/commerce/plans).
- Use the new [usePlans()](https://clerk.com/docs/nextjs/reference/hooks/use-plans) hook to get the Plan details.

app/checkout/page.tsx

```
'use client'
import * as React from 'react'
import { Show, ClerkLoaded } from '@clerk/nextjs'
import {
  CheckoutProvider,
  useCheckout,
  PaymentElementProvider,
  PaymentElement,
  usePaymentElement,
} from '@clerk/nextjs/experimental'
import { useRouter } from 'next/navigation'

export default function CheckoutPage() {
  return (
    // Update with your Plan ID and Plan Period
    <CheckoutProvider for="user" planId="cplan_38GgHD9MBVUMcnMrl1PvCptgQUw" planPeriod="month">
      <ClerkLoaded>
        <Show when="signed-in">
          <CustomCheckout />
        </Show>
      </ClerkLoaded>
    </CheckoutProvider>
  )
}

function CustomCheckout() {
  const { checkout } = useCheckout()

  if (checkout.status === 'needs_initialization') {
    return <CheckoutInitialization />
  }

  return (
    <div className="checkout-container">
      <CheckoutSummary />

      <PaymentElementProvider checkout={checkout}>
        <PaymentSection />
      </PaymentElementProvider>
    </div>
  )
}

function CheckoutInitialization() {
  const { checkout, fetchStatus } = useCheckout()

  if (checkout.status !== 'needs_initialization') {
    return null
  }

  return (
    <button onClick={() => checkout.start()} disabled={fetchStatus === 'fetching'}>
      {fetchStatus === 'fetching' ? 'Initializing...' : 'Start Checkout'}
    </button>
  )
}

function PaymentSection() {
  const { checkout, errors, fetchStatus } = useCheckout()

  const { isFormReady, submit } = usePaymentElement()
  const [isProcessing, setIsProcessing] = React.useState(false)

  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!isFormReady || isProcessing || fetchStatus === 'fetching') return
    setIsProcessing(true)

    try {
      // Submit payment form to get payment method
      const { data, error } = await submit()
      // Usually a validation error from stripe that you can ignore
      if (error) {
        console.error(JSON.stringify(error, null, 2))
        return
      }
      // Confirm checkout with payment method
      const { error: confirmError } = await checkout.confirm(data)
      if (confirmError) {
        console.error(JSON.stringify(confirmError, null, 2))
        return
      }
      // Complete checkout and redirect
      await checkout.finalize({
        navigate: ({ decorateUrl }) => {
          const url = decorateUrl('/')
          if (url.startsWith('http')) {
            window.location.href = url
          } else {
            router.push(url)
          }
        },
      })
    } catch (error) {
      console.error('Payment failed:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  const isSubmitting = isProcessing || fetchStatus === 'fetching'

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement fallback={<div>Loading payment element...</div>} />

      {errors.global && (
        <ul>
          {errors.global.map((error, index) => (
            <li key={index}>{error.longMessage || error.message}</li>
          ))}
        </ul>
      )}

      <button type="submit" disabled={!isFormReady || isSubmitting}>
        {isSubmitting ? 'Processing...' : 'Complete Purchase'}
      </button>
    </form>
  )
}

function CheckoutSummary() {
  const { checkout } = useCheckout()

  if (!checkout.plan) {
    return null
  }

  return (
    <div>
      <h2>Order Summary</h2>
      <span>{checkout.plan.name}</span>
      <span>
        {checkout.totals.totalDueNow.currencySymbol} {checkout.totals.totalDueNow.amountFormatted}
      </span>
    </div>
  )
}
```

## Feedback

What did you think of this content?

It was helpfulIt was not helpfulI have feedback

Last updated onApr 17, 2026

[GitHubEdit on GitHub](https://github.com/clerk/clerk-docs/edit/main/docs/guides/development/custom-flows/billing/checkout-new-payment-method.mdx)

Support