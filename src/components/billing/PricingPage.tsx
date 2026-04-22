/**
 * /pricing route body. Fetches live plan data via Clerk's experimental
 * usePlans hook (confined to src/components/billing/** per CI fence).
 * Renders a responsive grid of PlanCards.
 */
import { useState } from 'react'
import {
  Container,
  Group,
  Loader,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { usePlans } from '@clerk/react/experimental'
import { useAuth } from '@clerk/react'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { PlanCard } from './PlanCard'

export function PricingPage() {
  const [period, setPeriod] = useState<'month' | 'annual'>('month')

  const { data: plans, isLoading } = usePlans({ for: 'user' })

  // Resolve current plan slug via our userPlans table (single source of
  // truth for the signed-in user's subscription state).
  const { isSignedIn } = useAuth()
  const billingStatus = useQuery(
    api.billing.syncPlan.getBillingStatus,
    isSignedIn ? {} : 'skip',
  )
  const currentPlanSlug = billingStatus?.plan ?? null

  return (
    <Container size="lg" py={64}>
      <Stack align="center" gap="md" mb={48}>
        <Title order={1} ta="center">
          Choose your plan
        </Title>
        <Text c="dark.2" size="lg" maw={600} ta="center">
          Unlock AI-powered product photos with more generations, more
          products, and every feature we make.
        </Text>
        <SegmentedControl
          value={period}
          onChange={(v) => setPeriod(v as 'month' | 'annual')}
          data={[
            { label: 'Monthly', value: 'month' },
            { label: 'Annual (save up to 30%)', value: 'annual' },
          ]}
        />
      </Stack>

      {isLoading && !plans ? (
        <Group justify="center" py={64}>
          <Loader size="md" />
        </Group>
      ) : !plans || plans.length === 0 ? (
        <Text c="dark.2" ta="center" py={64}>
          No plans are currently available. Please check back later.
        </Text>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
          {plans
            // Only user-tier paid plans with a base fee (skip free/default tiers)
            .filter((p) => p.forPayerType === 'user' && p.hasBaseFee)
            .sort((a, b) => {
              const aFee = a.fee?.amount ?? 0
              const bFee = b.fee?.amount ?? 0
              return aFee - bFee
            })
            .map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                period={period}
                isCurrent={currentPlanSlug === plan.slug}
              />
            ))}
        </SimpleGrid>
      )}

      <Text c="dark.3" size="xs" ta="center" mt={48} maw={600} mx="auto">
        Payments processed securely by Stripe. Cancel anytime from Account →
        Billing.
      </Text>
    </Container>
  )
}
