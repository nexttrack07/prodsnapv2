/**
 * Single plan card rendered on /pricing. Fetches nothing itself — consumes
 * a BillingPlanResource passed from the parent (PricingPage uses
 * usePlans()).
 *
 * Volume limits (productLimit, monthlyCredits) are looked up by slug from
 * the app's PLAN_CONFIG rather than from Clerk, because Clerk's plan
 * features don't carry scalar limits. If the slug isn't in PLAN_CONFIG
 * we silently omit those lines rather than rendering confusing data.
 */
import {
  Badge,
  Button,
  Card,
  Group,
  List,
  Stack,
  Divider,
  Text,
  Title,
} from '@mantine/core'
import { IconCheck } from '@tabler/icons-react'
import { PLAN_CONFIG } from '../../../convex/lib/billing/planConfig'
import type { BillingPlanSummary } from './types'

export type PlanCardProps = {
  plan: BillingPlanSummary
  period: 'month' | 'annual'
  isCurrent?: boolean
}

export function PlanCard({ plan, period, isCurrent = false }: PlanCardProps) {
  const limits = PLAN_CONFIG[plan.slug]

  const priceAmount =
    period === 'month'
      ? plan.fee?.amountFormatted
      : plan.annualMonthlyFee?.amountFormatted
  const currencySymbol = plan.fee?.currencySymbol ?? '$'
  const trialDays = plan.freeTrialEnabled ? plan.freeTrialDays : null

  return (
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
          href={`/checkout?planId=${encodeURIComponent(plan.id)}&period=${period}`}
          color="brand"
          size="lg"
          fullWidth
          mt="auto"
          disabled={isCurrent}
        >
          {isCurrent ? 'Current plan' : `Subscribe — ${plan.name}`}
        </Button>
      </Stack>
    </Card>
  )
}
