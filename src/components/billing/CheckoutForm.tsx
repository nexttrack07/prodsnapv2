/**
 * Custom checkout form built on Clerk's experimental billing hooks.
 *
 * Flow:
 *   1. <CheckoutProvider> mounts with planId + period from the URL.
 *   2. On first render, checkout.status is "needs_initialization" — we
 *      trigger `checkout.start()` to create the pending Stripe intent.
 *   3. User enters card details in <PaymentElement/> (Stripe-owned iframe).
 *   4. On submit: usePaymentElement.submit() → checkout.confirm(data) →
 *      show <PostCheckoutInterstitial/> while server-side plan syncs →
 *      checkout.finalize({ navigate }) routes to /studio.
 *
 * ALL @clerk/react/experimental imports live in this file + its siblings
 * in src/components/billing/** per the CI fence.
 */
import { useEffect, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import {
  Alert,
  Button,
  Card,
  Container,
  Group,
  Loader,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import {
  CheckoutProvider,
  PaymentElement,
  PaymentElementProvider,
  useCheckout,
  usePaymentElement,
} from '@clerk/react/experimental'
import { notifications } from '@mantine/notifications'
import { stripeAppearance } from '~/lib/billing/stripeAppearance'
import { mapBillingError } from '~/lib/billing/mapBillingError'
import { PostCheckoutInterstitial } from './PostCheckoutInterstitial'

export type CheckoutFormProps = {
  planId: string
  period: 'month' | 'annual'
  /** When set, treats this as the final step of onboarding. */
  from?: 'onboarding'
}

export function CheckoutForm({ planId, period, from }: CheckoutFormProps) {
  return (
    <CheckoutProvider for="user" planId={planId} planPeriod={period}>
      <CheckoutBody from={from} />
    </CheckoutProvider>
  )
}

function CheckoutBody({ from }: { from?: 'onboarding' }) {
  const { checkout, errors, fetchStatus } = useCheckout()

  // Auto-initialize the checkout session on mount. Avoids a "click to start"
  // extra step in the flow.
  useEffect(() => {
    if (checkout.status === 'needs_initialization' && fetchStatus !== 'fetching') {
      void checkout.start()
    }
  }, [checkout, fetchStatus])

  if (checkout.status === 'needs_initialization' || fetchStatus === 'fetching') {
    return (
      <CheckoutShell>
        <Stack align="center" py="xl">
          <Loader size="md" />
          <Text c="dark.2" size="sm">
            Preparing checkout…
          </Text>
        </Stack>
      </CheckoutShell>
    )
  }

  return (
    <CheckoutShell>
      <Stack gap="lg">
        <OrderSummary />
        {errors?.global?.length ? (
          <Alert color="red" variant="light">
            <Stack gap={4}>
              {errors.global.map((e, i) => (
                <Text key={i} size="sm">
                  {e.longMessage || e.message}
                </Text>
              ))}
            </Stack>
          </Alert>
        ) : null}
        <PaymentElementProvider
          checkout={checkout}
          stripeAppearance={stripeAppearance()}
        >
          <PaymentSection from={from} />
        </PaymentElementProvider>
      </Stack>
    </CheckoutShell>
  )
}

function CheckoutShell({ children }: { children: React.ReactNode }) {
  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <Title order={2}>Checkout</Title>
        <Card withBorder radius="lg" padding="lg" bg="dark.7">
          {children}
        </Card>
      </Stack>
    </Container>
  )
}

function OrderSummary() {
  const { checkout } = useCheckout()
  if (!checkout.plan) return null

  return (
    <Stack gap="xs">
      <Text size="xs" c="dark.2" tt="uppercase" fw={600}>
        Order
      </Text>
      <Group justify="space-between">
        <Text fw={600}>{checkout.plan.name}</Text>
        <Text fw={700}>
          {checkout.totals?.totalDueNow?.currencySymbol}
          {checkout.totals?.totalDueNow?.amountFormatted}
        </Text>
      </Group>
    </Stack>
  )
}

function PaymentSection({ from }: { from?: 'onboarding' }) {
  const { checkout, fetchStatus } = useCheckout()
  const { isFormReady, submit } = usePaymentElement()
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [showInterstitial, setShowInterstitial] = useState(false)
  const router = useRouter()

  const disabled = !isFormReady || submitting || fetchStatus === 'fetching'

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (disabled) return
    setSubmitting(true)
    setLocalError(null)
    try {
      const { data, error } = await submit()
      if (error) {
        // Stripe validation errors surface inside <PaymentElement/> itself,
        // but we also show a top-level hint.
        setLocalError('Please check your card details and try again.')
        return
      }
      const confirmRes = await checkout.confirm(data)
      if (confirmRes.error) {
        const msg =
          confirmRes.error.longMessage ||
          confirmRes.error.message ||
          'We couldn’t complete this payment. Please try again.'
        setLocalError(msg)
        return
      }
      // Payment confirmed. Show the interstitial while the server syncs.
      setShowInterstitial(true)
    } catch (err) {
      const info = mapBillingError(err)
      setLocalError(info.message)
      notifications.show({
        title: info.title,
        message: info.message,
        color: 'red',
        autoClose: 8000,
      })
    } finally {
      setSubmitting(false)
    }
  }

  const completeOnboarding = useMutation(
    api.onboardingProfiles.completeOnboarding,
  )

  const onPlanActive = () => {
    // For onboarding, mark profile complete first (best-effort) so the
    // redirect guard doesn't bounce the user back to /onboarding.
    const finalizeAfter = () => {
      void checkout.finalize({
        navigate: ({ decorateUrl }) => {
          const url = decorateUrl('/home')
          if (url.startsWith('http')) {
            window.location.href = url
          } else {
            router.navigate({ to: '/home' })
          }
        },
      })
    }
    if (from === 'onboarding') {
      void completeOnboarding({})
        .catch(() => {
          // best-effort; redirect guard tolerates legacy users
        })
        .finally(finalizeAfter)
    } else {
      finalizeAfter()
    }
  }

  return (
    <>
      <form onSubmit={onSubmit}>
        <Stack gap="lg">
          <PaymentElement
            fallback={
              <Stack align="center" py="lg">
                <Loader size="sm" />
                <Text c="dark.2" size="sm">
                  Loading secure payment form…
                </Text>
              </Stack>
            }
          />
          {localError && (
            <Alert color="red" variant="light">
              {localError}
            </Alert>
          )}
          <Button
            type="submit"
            color="brand"
            size="md"
            fz="sm"
            loading={submitting}
            disabled={disabled}
            fullWidth
          >
            {submitting ? 'Processing…' : 'Complete purchase'}
          </Button>
          <Text c="dark.3" size="xs" ta="center">
            Secured payments. Cancel anytime from Account → Billing.
          </Text>
        </Stack>
      </form>
      <PostCheckoutInterstitial
        open={showInterstitial}
        onPlanActive={onPlanActive}
      />
    </>
  )
}
