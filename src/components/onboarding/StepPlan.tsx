import { useState } from 'react'
import {
  Anchor,
  Badge,
  Box,
  Button,
  Group,
  List,
  Loader,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core'
import { IconCheck } from '@tabler/icons-react'
import { useNavigate } from '@tanstack/react-router'
import { usePlans } from '@clerk/react/experimental'
import { useClerk } from '@clerk/react'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { BillingPlanSummary } from '../billing/types'

type Period = 'month' | 'annual'

export function StepPlan({ onBack }: { onBack: () => void }) {
  const [period, setPeriod] = useState<Period>('month')
  const { data: plans, isLoading } = usePlans({ for: 'user' })
  const navigate = useNavigate()
  const { openUserProfile } = useClerk()
  const billingStatus = useQuery(api.billing.syncPlan.getBillingStatus)

  // OnboardingGuard normally keeps subscribed users out of /onboarding,
  // but if one slips through (direct URL, browser back), useCheckout()
  // would reject the plan change. Mirror PlanCard: route them through
  // Clerk's hosted UserProfile UI which handles plan changes natively.
  const hasActiveSubscription =
    !!billingStatus?.signedIn &&
    !!billingStatus.plan &&
    billingStatus.plan !== 'free'

  const handleSelect = (planId: string) => {
    if (hasActiveSubscription) {
      openUserProfile()
      return
    }
    navigate({
      to: '/checkout',
      search: { planId, period, from: 'onboarding' },
    })
  }

  const visible =
    plans
      ?.filter((p) => p.forPayerType === 'user' && p.hasBaseFee)
      .sort((a, b) => (a.fee?.amount ?? 0) - (b.fee?.amount ?? 0)) ?? []

  return (
    <Stack gap="lg">
      <Stack gap="xs" align="center">
        <Title order={1} fz={28} fw={600} ta="center">
          Pick your plan
        </Title>
        <Text c="dark.2" ta="center" maw={460}>
          7 days free. Cancel anytime — no charge during your trial.
        </Text>
      </Stack>

      <Group justify="center">
        <SegmentedControl
          value={period}
          onChange={(v) => setPeriod(v as Period)}
          data={[
            { label: 'Monthly', value: 'month' },
            { label: 'Annual (save up to 30%)', value: 'annual' },
          ]}
          size="sm"
        />
      </Group>

      {isLoading && !plans ? (
        <Group justify="center" py={48}>
          <Loader size="md" color="brand" />
        </Group>
      ) : visible.length === 0 ? (
        <Text c="dark.2" ta="center" py={48}>
          Plans aren't loading right now. Please{' '}
          <Anchor href="mailto:support@prodsnap.io">contact support</Anchor>.
        </Text>
      ) : (
        <Stack gap="md">
          {visible.map((plan, idx) => (
            <PlanRow
              key={plan.id}
              plan={plan}
              period={period}
              recommended={idx === Math.floor(visible.length / 2)}
              onSelect={() => handleSelect(plan.id)}
            />
          ))}
        </Stack>
      )}

      <Text c="dark.3" size="xs" ta="center">
        Not charged until your trial ends. Cancel anytime from Account →
        Billing.
      </Text>

      <Group justify="flex-start">
        <Button variant="subtle" color="gray" onClick={onBack}>
          ← Back
        </Button>
      </Group>
    </Stack>
  )
}

function PlanRow({
  plan,
  period,
  recommended,
  onSelect,
}: {
  plan: BillingPlanSummary
  period: Period
  recommended: boolean
  onSelect: () => void
}) {
  const monthlyFee = plan.fee
  const annualMonthly = plan.annualMonthlyFee
  const showFee =
    period === 'annual' && annualMonthly ? annualMonthly : monthlyFee
  const priceText = showFee
    ? `${showFee.currencySymbol}${showFee.amountFormatted}`
    : '—'
  const periodLabel = '/mo'

  return (
    <Paper
      p="lg"
      radius="lg"
      withBorder
      style={{
        borderColor: recommended
          ? 'var(--mantine-color-brand-5)'
          : 'var(--mantine-color-dark-5)',
        borderWidth: recommended ? 2 : 1,
        backgroundColor: 'var(--mantine-color-dark-7)',
      }}
    >
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Group gap="xs">
            <Text fw={600} c="white" fz="lg">
              {plan.name}
            </Text>
            {recommended && (
              <Badge color="brand" variant="filled" size="sm">
                Most popular
              </Badge>
            )}
          </Group>
          {plan.description && (
            <Text size="sm" c="dark.2">
              {plan.description}
            </Text>
          )}
          {plan.features && plan.features.length > 0 && (
            <List
              size="xs"
              spacing={4}
              mt={6}
              icon={
                <ThemeIcon
                  size="xs"
                  radius="xl"
                  color="teal"
                  variant="light"
                >
                  <IconCheck size={10} />
                </ThemeIcon>
              }
            >
              {plan.features.slice(0, 4).map((f) => (
                <List.Item key={f.id}>
                  <Text size="xs" c="dark.1">
                    {f.name}
                  </Text>
                </List.Item>
              ))}
            </List>
          )}
        </Stack>
        <Stack gap={4} align="flex-end">
          <Box>
            <Text component="span" fw={700} c="white" fz={28}>
              {priceText}
            </Text>
            <Text component="span" c="dark.2" size="sm" ml={4}>
              {periodLabel}
            </Text>
          </Box>
          <Button
            color="brand"
            variant={recommended ? 'filled' : 'default'}
            onClick={onSelect}
            size="md"
          >
            Start free trial
          </Button>
        </Stack>
      </Group>
    </Paper>
  )
}
