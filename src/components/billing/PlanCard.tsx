/**
 * Single plan card rendered on /pricing. Fetches nothing itself — consumes
 * a BillingPlanResource passed from the parent (PricingPage uses
 * usePlans()).
 *
 * Volume limits (productLimit, monthlyCredits) are looked up by slug from
 * the app's PLAN_CONFIG rather than from Clerk, because Clerk's plan
 * features don't carry scalar limits. If the slug isn't in PLAN_CONFIG
 * we silently omit those lines rather than rendering confusing data.
 *
 * Downgrade guard: if the target plan's productLimit is lower than the
 * user's current product count, a confirmation modal blocks navigation to
 * /checkout until the user explicitly confirms.
 */
import { useState } from 'react'
import {
  Badge,
  Button,
  Card,
  Group,
  List,
  Modal,
  Stack,
  Divider,
  Text,
  Title,
} from '@mantine/core'
import { IconCheck } from '@tabler/icons-react'
import { useQuery } from 'convex/react'
import { useClerk } from '@clerk/react'
import { api } from '../../../convex/_generated/api'
import { PLAN_CONFIG } from '../../../convex/lib/billing/planConfig'
import type { BillingPlanSummary } from './types'

export type PlanCardProps = {
  plan: BillingPlanSummary
  period: 'month' | 'annual'
  isCurrent?: boolean
}

export function PlanCard({ plan, period, isCurrent = false }: PlanCardProps) {
  const limits = PLAN_CONFIG[plan.slug]
  const billingStatus = useQuery(api.billing.syncPlan.getBillingStatus)
  const { openUserProfile } = useClerk()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const priceAmount =
    period === 'month'
      ? plan.fee?.amountFormatted
      : plan.annualMonthlyFee?.amountFormatted
  const currencySymbol = plan.fee?.currencySymbol ?? '$'
  const trialDays = plan.freeTrialEnabled ? plan.freeTrialDays : null

  const checkoutHref = `/checkout?planId=${encodeURIComponent(plan.id)}&period=${period}`

  // Has the user already subscribed to ANY paid plan? Our custom
  // /checkout flow uses useCheckout() which is for first-time
  // subscriptions only — Clerk's experimental billing API rejects
  // plan changes through that hook with "Please choose a different
  // plan or billing interval". For existing subscribers, route to
  // Clerk's hosted UserProfile billing UI which natively supports
  // upgrades/downgrades.
  const hasActiveSubscription =
    !!billingStatus?.signedIn &&
    !!billingStatus.plan &&
    billingStatus.plan !== 'free'

  // Determine if this is a downgrade that would leave the user over-limit
  const isProductOverLimit =
    !isCurrent &&
    limits != null &&
    billingStatus?.signedIn &&
    billingStatus.productCount > limits.productLimit

  const isCreditsDowngrade =
    !isCurrent &&
    limits != null &&
    billingStatus?.signedIn &&
    billingStatus.creditsTotal > 0 &&
    billingStatus.creditsUsed > limits.monthlyCredits

  const needsDowngradeWarning = isProductOverLimit || isCreditsDowngrade

  function handleSubscribeClick(e: React.MouseEvent<HTMLAnchorElement>) {
    // Plan change for existing subscribers → open Clerk's hosted UI.
    if (hasActiveSubscription && !isCurrent) {
      e.preventDefault()
      openUserProfile()
      return
    }
    if (needsDowngradeWarning) {
      e.preventDefault()
      setConfirmOpen(true)
    }
  }

  function handleConfirm() {
    setConfirmOpen(false)
    if (hasActiveSubscription) {
      openUserProfile()
    } else {
      window.location.href = checkoutHref
    }
  }

  return (
    <>
      <Card
        withBorder
        radius="lg"
        padding="xl"
        style={{
          borderColor: isCurrent
            ? 'var(--mantine-color-brand-5)'
            : 'var(--mantine-color-dark-5)',
          borderWidth: isCurrent ? 2 : 1,
          backgroundColor: 'var(--mantine-color-dark-7)',
        }}
      >
        <Stack gap="md" h="100%">
          <Group justify="space-between" align="flex-start">
            <Title order={3} tt="capitalize">
              {plan.name}
            </Title>
            {isCurrent && (
              <Badge color="brand" variant="light">
                Current
              </Badge>
            )}
          </Group>

          {plan.description && (
            <Text size="sm" c="dark.2">
              {plan.description}
            </Text>
          )}

          <Group gap={4} align="baseline">
            <Text fw={800} fz={40}>
              {currencySymbol}
              {priceAmount ?? '—'}
            </Text>
            <Text size="sm" c="dark.2">
              /mo{period === 'annual' ? ' billed annually' : ''}
            </Text>
          </Group>

          {trialDays != null && (
            <Badge color="brand" variant="light" size="sm" w="fit-content">
              {trialDays}-day free trial
            </Badge>
          )}

          {limits && (
            <List
              spacing="xs"
              size="sm"
              icon={<IconCheck size={16} color="var(--mantine-color-brand-5)" />}
            >
              <List.Item>
                <strong>{limits.productLimit}</strong> product
                {limits.productLimit === 1 ? '' : 's'}
              </List.Item>
              <List.Item>
                <strong>{limits.monthlyCredits}</strong> generations per month
              </List.Item>
            </List>
          )}

          {limits && plan.features.length > 0 && (
            <Divider label="Includes" labelPosition="left" />
          )}

          {plan.features.length > 0 && (
            <List
              spacing="xs"
              size="sm"
              icon={<IconCheck size={16} color="var(--mantine-color-brand-5)" />}
            >
              {plan.features.map((f) => (
                <List.Item key={f.id}>{f.name}</List.Item>
              ))}
            </List>
          )}

          <Button
            component="a"
            href={checkoutHref}
            color="brand"
            size="lg"
            fz="sm"
            fullWidth
            mt="auto"
            disabled={isCurrent}
            onClick={handleSubscribeClick}
          >
            {isCurrent
              ? 'Current plan'
              : hasActiveSubscription
                ? `Switch to ${plan.name}`
                : `Subscribe — ${plan.name}`}
          </Button>
        </Stack>
      </Card>

      <Modal
        opened={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Downgrade to ${plan.name}?`}
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            {isProductOverLimit && limits && billingStatus && (
              <>
                You currently have <strong>{billingStatus.productCount} products</strong>,
                but {plan.name} allows only <strong>{limits.productLimit}</strong>.
                You won't lose any products, but you won't be able to generate new
                content until you archive down to {limits.productLimit}.
              </>
            )}
            {isCreditsDowngrade && !isProductOverLimit && limits && billingStatus && (
              <>
                You've already used <strong>{billingStatus.creditsUsed} credits</strong>{' '}
                this billing period, which exceeds {plan.name}'s limit of{' '}
                <strong>{limits.monthlyCredits}</strong>. Generation will be blocked until
                your next billing period.
              </>
            )}
            {isProductOverLimit && isCreditsDowngrade && limits && billingStatus && (
              <>{' '}You've also used <strong>{billingStatus.creditsUsed} credits</strong>{' '}
              this period, above {plan.name}'s {limits.monthlyCredits}-credit limit.</>
            )}
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setConfirmOpen(false)}>
              Keep current plan
            </Button>
            <Button color="brand" onClick={handleConfirm}>
              Continue to downgrade
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}
