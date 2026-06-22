/**
 * /pricing route body. Fetches live plan data via Clerk's experimental
 * usePlans hook (confined to src/components/billing/** per CI fence).
 * Renders a responsive grid of PlanCards.
 */
import { useEffect, useState } from 'react'
import {
  Accordion,
  Container,
  Group,
  Loader,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Anchor,
} from '@mantine/core'
import { IconClockHour4, IconLock, IconRefresh } from '@tabler/icons-react'
import { usePlans } from '@clerk/react/experimental'
import { useAuth } from '@clerk/react'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { PlanCard } from './PlanCard'

/**
 * Per-plan marketing presentation, keyed by Clerk plan slug. Drives the
 * "Most popular" / "Best value" badges and which card is visually elevated.
 * Slugs must match the prod Clerk plans (lite / pro / max); unknown slugs
 * simply render as a plain card.
 */
const PLAN_PRESENTATION: Record<
  string,
  { badge?: string; highlight?: boolean }
> = {
  pro: { badge: 'Most popular', highlight: true },
  max: { badge: 'Best value' },
}

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: 'Do I need a credit card to start?',
    a: "No. Every new account gets 100 free credits (about 10 ads) with no card. Pick a plan when you run out or need exports and bigger tests — you're only charged when you subscribe.",
  },
  {
    q: 'Can I change plans later?',
    a: 'Yes — upgrade or downgrade anytime from Account → Billing. Changes are prorated automatically by our payment provider.',
  },
  {
    q: 'How do credits work?',
    a: 'Each image generation uses 10 credits and background removal uses 2. Ad copy, brand kits, and product analysis are free on every plan. Credits refresh at the start of each billing period.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Cancel from Account → Billing and you keep access until the end of your current billing period — no questions asked.',
  },
]

export function PricingPage() {
  const [period, setPeriod] = useState<'month' | 'annual'>('month')

  const {
    data: plans,
    isFetching,
    error: plansError,
    revalidate,
  } = usePlans({ for: 'user' })

  // Resolve current plan slug via our userPlans table (single source of
  // truth for the signed-in user's subscription state).
  const { isSignedIn, isLoaded: clerkLoaded } = useAuth()

  // Race-condition guard. Clerk's billing SDK can briefly report
  // "settled with zero plans" while the clerk-js handshake is still
  // completing — that's an init race, not a real failure. Treating it the
  // same as a fetch error is what flashed the scary "email us" message on
  // cold loads. So: revalidate a few times before trusting an empty result,
  // and only ever surface the error on a genuine API failure or after the
  // retries are exhausted with Clerk fully loaded and the query settled.
  const MAX_RETRIES = 3
  const [retryCount, setRetryCount] = useState(0)
  const hasPlans = !!plans && plans.length > 0

  useEffect(() => {
    if (!clerkLoaded || plansError || isFetching) return
    if (hasPlans) {
      if (retryCount !== 0) setRetryCount(0)
      return
    }
    if (retryCount < MAX_RETRIES) {
      const t = setTimeout(() => {
        void revalidate()
        setRetryCount((c) => c + 1)
      }, 600 * (retryCount + 1))
      return () => clearTimeout(t)
    }
  }, [clerkLoaded, plansError, isFetching, hasPlans, retryCount, revalidate])

  const retriesExhausted = retryCount >= MAX_RETRIES
  // A genuine error: an explicit API failure, or Clerk fully loaded + the
  // query settled + retries exhausted and still no plans.
  const showError =
    !!plansError ||
    (clerkLoaded && !isFetching && !hasPlans && retriesExhausted)

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
            { label: 'Annual (save up to 24%)', value: 'annual' },
          ]}
        />
      </Stack>

      {hasPlans ? (
        <SimpleGrid
          cols={{ base: 1, md: 3 }}
          spacing="lg"
          verticalSpacing="lg"
        >
          {plans
            // Only user-tier paid plans with a base fee (skip free/default tiers)
            .filter((p) => p.forPayerType === 'user' && p.hasBaseFee)
            .sort((a, b) => {
              const aFee = a.fee?.amount ?? 0
              const bFee = b.fee?.amount ?? 0
              return aFee - bFee
            })
            .map((plan) => {
              const pres = PLAN_PRESENTATION[plan.slug] ?? {}
              return (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  period={period}
                  isCurrent={currentPlanSlug === plan.slug}
                  badge={pres.badge}
                  highlight={pres.highlight}
                />
              )
            })}
        </SimpleGrid>
      ) : showError ? (
        <Text c="dark.2" ta="center" py={64}>
          Plans aren't loading — please <Anchor href="mailto:info@prodsnap.io">email info@prodsnap.io</Anchor>.
        </Text>
      ) : (
        <Group justify="center" py={64}>
          <Loader size="md" />
        </Group>
      )}

      {/* Trust strip — factual reassurances, no social proof (pre-revenue). */}
      <Group justify="center" gap="xl" mt={40} wrap="wrap">
        <Group gap={6}>
          <IconClockHour4 size={16} color="var(--mantine-color-dark-2)" />
          <Text size="sm" c="dark.2">
            100 free credits to start
          </Text>
        </Group>
        <Group gap={6}>
          <IconRefresh size={16} color="var(--mantine-color-dark-2)" />
          <Text size="sm" c="dark.2">
            Cancel anytime
          </Text>
        </Group>
        <Group gap={6}>
          <IconLock size={16} color="var(--mantine-color-dark-2)" />
          <Text size="sm" c="dark.2">
            Secure payments
          </Text>
        </Group>
      </Group>

      <Text c="dark.3" size="xs" ta="center" mt={24} maw={680} mx="auto" fs="italic">
        Each image generation uses 10 credits. Background removal uses 2 credits. Ad copy, brand kits, and product analysis are free on every plan.
      </Text>

      {/* FAQ — objection handling */}
      <Stack maw={680} mx="auto" mt={72} gap="lg">
        <Title order={2} ta="center" fz={26}>
          Frequently asked questions
        </Title>
        <Accordion variant="separated" radius="md">
          {FAQ_ITEMS.map((item) => (
            <Accordion.Item key={item.q} value={item.q}>
              <Accordion.Control>{item.q}</Accordion.Control>
              <Accordion.Panel>
                <Text size="sm" c="dark.2">
                  {item.a}
                </Text>
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      </Stack>
    </Container>
  )
}
