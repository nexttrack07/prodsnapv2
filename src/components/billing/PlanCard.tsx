/**
 * Single plan card rendered on /pricing. Fetches nothing itself — consumes
 * a BillingPlanResource passed from the parent (PricingPage uses
 * usePlans()).
 *
 * Volume limits (productLimit, imageCredits) are looked up by slug from
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
import { useAction, useQuery } from 'convex/react'
import { useClerk } from '@clerk/react'
import { api } from '../../../convex/_generated/api'
import { PLAN_CONFIG, isUnlimited } from '../../../convex/lib/billing/planConfig'
import type { BillingPlanSummary } from './types'

export type PlanCardProps = {
  plan: BillingPlanSummary
  period: 'month' | 'annual'
  isCurrent?: boolean
  /** Marketing badge ("Most popular", "Best value"). */
  badge?: string | null
  /** Visually elevate this card above its siblings. */
  highlight?: boolean
}

export function PlanCard({
  plan,
  period,
  isCurrent = false,
  badge = null,
  highlight = false,
}: PlanCardProps) {
  const limits = PLAN_CONFIG[plan.slug]
  const billingStatus = useQuery(api.billing.syncPlan.getBillingStatus)
  const syncPlan = useAction(api.billing.syncPlan.syncUserPlan)
  const { openUserProfile } = useClerk()
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Fire syncUserPlan after a delay so the UI reflects plan changes made in
  // the Clerk modal without waiting for the webhook. Clerk modals have no
  // close callback so we poll after ~5 s as the eager path.
  function openProfileAndResync() {
    openUserProfile()
    setTimeout(() => {
      void syncPlan().catch(() => {})
    }, 5000)
  }

  const priceAmount =
    period === 'month'
      ? plan.fee?.amountFormatted
      : plan.annualMonthlyFee?.amountFormatted
  const currencySymbol = plan.fee?.currencySymbol ?? '$'
  const trialDays = plan.freeTrialEnabled ? plan.freeTrialDays : null

  // Annual savings, computed from Clerk's own amounts so the "sale" always
  // matches what the user is charged at checkout (no fabricated discount).
  // `amount` is in the currency's smallest unit (cents).
  const monthlyAmount = plan.fee?.amount ?? 0
  const annualMonthlyAmount = plan.annualMonthlyFee?.amount ?? 0
  const yearlySavings =
    monthlyAmount > 0 && annualMonthlyAmount > 0
      ? Math.round(((monthlyAmount - annualMonthlyAmount) * 12) / 100)
      : 0
  const showAnnualSale = period === 'annual' && yearlySavings > 0

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

  // Determine if this is a downgrade that would leave the user over-limit.
  // Unlimited (-1) target tiers can never be over-limit.
  const isProductOverLimit =
    !isCurrent &&
    limits != null &&
    !isUnlimited(limits.productLimit) &&
    billingStatus?.signedIn &&
    billingStatus.productCount > limits.productLimit

  const isCreditsDowngrade =
    !isCurrent &&
    limits != null &&
    !isUnlimited(limits.imageCredits) &&
    billingStatus?.signedIn &&
    billingStatus.creditsTotal > 0 &&
    billingStatus.creditsUsed > limits.imageCredits

  const needsDowngradeWarning = isProductOverLimit || isCreditsDowngrade

  function handleSubscribeClick(e: React.MouseEvent<HTMLAnchorElement>) {
    // Plan change for existing subscribers → open Clerk's hosted UI.
    if (hasActiveSubscription && !isCurrent) {
      e.preventDefault()
      openProfileAndResync()
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
      openProfileAndResync()
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
          borderColor:
            isCurrent || highlight
              ? 'var(--mantine-color-brand-5)'
              : 'var(--mantine-color-dark-5)',
          borderWidth: isCurrent || highlight ? 2 : 1,
          backgroundColor: highlight ? 'rgba(16, 24, 40, 0.03)' : 'var(--mantine-color-dark-8)',
          boxShadow: highlight ? '0 4px 24px rgba(16, 24, 40,0.08), var(--mantine-shadow-sm)' : 'var(--mantine-shadow-xs)',
          position: 'relative',
        }}
      >
        <Stack gap="md" h="100%">
          {badge && (
            <Badge
              color={highlight ? 'brand' : 'gray'}
              variant={highlight ? 'filled' : 'light'}
              size="sm"
              radius="sm"
              style={{ alignSelf: 'flex-start' }}
            >
              {badge}
            </Badge>
          )}

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

          <Stack gap={4}>
            <Group gap={8} align="baseline">
              {showAnnualSale && plan.fee?.amountFormatted && (
                <Text fw={500} fz={22} c="dark.3" td="line-through">
                  {currencySymbol}
                  {plan.fee.amountFormatted}
                </Text>
              )}
              <Text fw={800} fz={40}>
                {currencySymbol}
                {priceAmount ?? '—'}
              </Text>
              <Text size="sm" c="dark.2">
                /mo{period === 'annual' ? ', billed annually' : ''}
              </Text>
            </Group>
            {showAnnualSale && (
              <Badge color="teal" variant="light" size="sm" w="fit-content">
                Save {currencySymbol}
                {yearlySavings}/year
              </Badge>
            )}
          </Stack>

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
                {isUnlimited(limits.productLimit) ? (
                  <>
                    <strong>Unlimited</strong> products
                  </>
                ) : (
                  <>
                    <strong>{limits.productLimit}</strong> product
                    {limits.productLimit === 1 ? '' : 's'}
                  </>
                )}
              </List.Item>
              <List.Item>
                <strong>
                  {isUnlimited(limits.imageCredits)
                    ? 'Unlimited'
                    : limits.imageCredits}
                </strong>{' '}
                credits / month
                {!isUnlimited(limits.imageCredits) && (
                  <Text
                    component="span"
                    display="block"
                    size="xs"
                    c="dark.3"
                    fs="italic"
                  >
                    ≈ {Math.floor(limits.imageCredits / 10)} image generations
                  </Text>
                )}
              </List.Item>
              <List.Item>
                Unlimited ad copy, brand kits &amp; product analysis
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

          <Stack gap={6} mt="auto">
            <Button
              component="a"
              href={checkoutHref}
              color="brand"
              variant={highlight ? 'filled' : 'light'}
              size="lg"
              fz="sm"
              fullWidth
              disabled={isCurrent}
              onClick={handleSubscribeClick}
            >
              {isCurrent
                ? 'Current plan'
                : hasActiveSubscription
                  ? `Switch to ${plan.name}`
                  : trialDays != null
                    ? `Start ${trialDays}-day free trial`
                    : `Subscribe — ${plan.name}`}
            </Button>
            {!isCurrent && !hasActiveSubscription && (
              <Text size="xs" c="dark.3" ta="center">
                {trialDays != null && priceAmount
                  ? `Free for ${trialDays} days, then ${currencySymbol}${priceAmount}/mo. Cancel anytime.`
                  : 'Cancel anytime.'}
              </Text>
            )}
          </Stack>
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
                <strong>{limits.imageCredits}</strong>. Generation will be blocked until
                your next billing period.
              </>
            )}
            {isProductOverLimit && isCreditsDowngrade && limits && billingStatus && (
              <>{' '}You've also used <strong>{billingStatus.creditsUsed} credits</strong>{' '}
              this period, above {plan.name}'s {limits.imageCredits}-credit limit.</>
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
