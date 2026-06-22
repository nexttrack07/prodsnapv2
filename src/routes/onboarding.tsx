import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useAuth, SignInButton } from '@clerk/react'
import { useAction, useQuery } from 'convex/react'
import {
  Box,
  Button,
  Center,
  Container,
  Group,
  Loader,
  Stack,
  Text,
  Title,
  ThemeIcon,
  List,
} from '@mantine/core'
import { IconSparkles } from '@tabler/icons-react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { StepRole } from '~/components/onboarding/StepRole'
import { StepBusiness } from '~/components/onboarding/StepBusiness'
import { StepPlan } from '~/components/onboarding/StepPlan'

// sessionStorage key set when a user enters via the no-card starter flow.
// The OnboardingGuard reads this to allow access to /home and /studio
// without a paid plan.
export const STARTER_MODE_KEY = 'prodsnap_activation_mode'

type OnboardingSearch = { step?: number; subscribed?: boolean; starter?: boolean }

export const Route = createFileRoute('/onboarding')({
  validateSearch: (search: Record<string, unknown>): OnboardingSearch => {
    const raw = Number(search.step)
    const step = Number.isFinite(raw) ? raw : undefined
    const subscribed =
      search.subscribed === '1' || search.subscribed === 1 || search.subscribed === true
    const starter =
      search.starter === '1' || search.starter === 1 || search.starter === true
    return {
      ...(step && step >= 1 && step <= 3 ? { step } : {}),
      ...(subscribed ? { subscribed: true } : {}),
      ...(starter ? { starter: true } : {}),
    }
  },
  component: OnboardingPage,
})

function OnboardingPage() {
  const { isLoaded, isSignedIn } = useAuth()
  const status = useQuery(
    api.onboardingProfiles.getOnboardingStatus,
    isSignedIn ? {} : 'skip',
  )
  const profile = useQuery(
    api.onboardingProfiles.getMyProfile,
    isSignedIn ? {} : 'skip',
  )
  const search = Route.useSearch()
  const navigate = useNavigate()
  const finalizeOnboardingAfterCheckout = useAction(
    api.onboardingProfiles.finalizeOnboardingAfterCheckout,
  )
  const finalizedRef = useRef(false)
  const [finalizeError, setFinalizeError] = useState<string | null>(null)

  const runFinalize = () => {
    finalizedRef.current = true
    setFinalizeError(null)
    void finalizeOnboardingAfterCheckout().catch((err) => {
      finalizedRef.current = false
      setFinalizeError(err instanceof Error ? err.message : 'Could not finish setup')
    })
  }

  // The embedded PricingTable redirects here with ?subscribed=1 after checkout.
  // Treat the param as a UI hint only: the server action verifies Clerk has an
  // active paid subscription before syncing the plan, granting credits, and
  // marking onboarding complete.
  useEffect(() => {
    if (!isSignedIn || !search.subscribed || finalizedRef.current) return
    runFinalize()
  }, [isSignedIn, search.subscribed, finalizeOnboardingAfterCheckout])

  // Loading
  if (!isLoaded || (isSignedIn && (status === undefined || profile === undefined))) {
    return (
      <Center mih="60vh">
        <Loader size="md" color="brand" />
      </Center>
    )
  }

  // Not signed in — gate with Clerk modal
  if (!isSignedIn) {
    return (
      <Container size="sm" py="xl">
        <Stack align="center" gap="md">
          <Title order={2}>Sign in to get started</Title>
          <Text c="dark.2" ta="center">
            Create your account to begin onboarding.
          </Text>
          <SignInButton mode="modal">
            <Button color="brand">Sign in or create account</Button>
          </SignInButton>
        </Stack>
      </Container>
    )
  }

  // Already onboarded (explicit completedAt, paid-plan rescue, or legacy
  // user with products) → bounce to studio.
  if (status && status.state !== 'pending') {
    return <RedirectTo to="/home" />
  }

  // Post-subscribe finalize in progress (see effect above): show a brief
  // loader instead of re-rendering the plan picker while completeOnboarding
  // resolves and flips status → complete (which then redirects to /home).
  if (search.subscribed) {
    return (
      <Center mih="60vh">
        <Stack align="center" gap="md">
          {finalizeError ? (
            <>
              <Title order={2} ta="center">We couldn't finish setup</Title>
              <Text c="dark.2" ta="center" maw={420}>
                {finalizeError}. If your payment completed, retry in a moment;
                otherwise choose a plan to continue.
              </Text>
              <Group>
                <Button
                  variant="default"
                  onClick={runFinalize}
                >
                  Retry
                </Button>
                <Button color="brand" onClick={() => navigate({ to: '/pricing' })}>
                  View plans
                </Button>
              </Group>
            </>
          ) : (
            <>
              <Loader size="md" color="brand" />
              <Text c="dark.2">Finishing setup…</Text>
            </>
          )}
        </Stack>
      </Center>
    )
  }

  // Starter mode: skip the plan-selection wizard, provision a free one-time
  // Ad Test, and drop the user directly into the studio review.
  if (search.starter) {
    return <StarterActivation />
  }

  const profileStep = profile?.currentStep ?? 1
  const requestedStep = search.step ?? profileStep
  const activeStep = Math.min(requestedStep, profileStep)

  const goToStep = (step: number) =>
    navigate({ to: '/onboarding', search: { step } })

  return (
    <Container size="sm" py={48}>
      <StepIndicator current={activeStep} />
      <Box mt="xl">
        {activeStep === 1 && <StepRole onNext={() => goToStep(2)} />}
        {activeStep === 2 && (
          <StepBusiness
            onNext={() => goToStep(3)}
            onBack={() => goToStep(1)}
          />
        )}
        {activeStep === 3 && <StepPlan onBack={() => goToStep(2)} />}
      </Box>
    </Container>
  )
}

function StepIndicator({ current }: { current: number }) {
  const steps = [
    { num: 1, label: 'About you' },
    { num: 2, label: 'Your business' },
    { num: 3, label: 'Pick a plan' },
  ]
  return (
    <Group justify="center" gap="xs" wrap="nowrap">
      {steps.map((s, idx) => {
        const isDone = current > s.num
        const isActive = current === s.num
        return (
          <Group key={s.num} gap="xs" wrap="nowrap">
            <Box
              w={28}
              h={28}
              style={{
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                fontWeight: 600,
                backgroundColor: isActive
                  ? 'var(--mantine-color-brand-6)'
                  : isDone
                  ? 'var(--mantine-color-brand-9)'
                  : 'var(--mantine-color-dark-5)',
                color: isActive || isDone ? 'white' : 'var(--mantine-color-dark-2)',
              }}
            >
              {isDone ? '✓' : s.num}
            </Box>
            <Text
              size="sm"
              fw={isActive ? 600 : 400}
              c={isActive ? 'white' : 'dark.2'}
              visibleFrom="sm"
            >
              {s.label}
            </Text>
            {idx < steps.length - 1 && (
              <Box
                w={32}
                h={2}
                bg={current > s.num ? 'brand.9' : 'dark.5'}
                style={{ borderRadius: 1 }}
              />
            )}
          </Group>
        )
      })}
    </Group>
  )
}

function RedirectTo({ to }: { to: string }) {
  const navigate = useNavigate()
  useEffect(() => {
    navigate({ to })
  }, [navigate, to])
  return (
    <Center mih="60vh">
      <Loader size="md" color="brand" />
    </Center>
  )
}

function StarterActivation() {
  const navigate = useNavigate()
  const activateStarterFlow = useAction(api.activation.activateStarterFlow)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleActivate() {
    setLoading(true)
    setError(null)
    try {
      sessionStorage.setItem(STARTER_MODE_KEY, 'starter')
      const { adTestId, productId } = await activateStarterFlow({})
      navigate({
        to: '/studio/$productId',
        params: { productId },
        search: { adTestId },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not activate free test. Try again.')
      setLoading(false)
    }
  }

  return (
    <Center mih="60vh">
      <Container size="xs">
        <Stack align="center" gap="lg" ta="center">
          <ThemeIcon size={56} radius="xl" color="brand" variant="light">
            <IconSparkles size={28} />
          </ThemeIcon>
          <div>
            <Title order={2} mb={8}>Your free Ad Test is ready</Title>
            <Text c="dark.2" maw={380} mx="auto">
              Generate one complete ad test — one concept across three placements — at no cost, no card required.
            </Text>
          </div>
          <List size="sm" c="dark.1" spacing={6} withPadding>
            <List.Item>1 concept × 3 placements (Feed 1:1, Feed 4:5, Story 9:16)</List.Item>
            <List.Item>Preview all generated creatives</List.Item>
            <List.Item>Mark winners · Export requires a paid plan</List.Item>
          </List>
          {error && (
            <Text size="sm" c="red.4">{error}</Text>
          )}
          <Button
            color="brand"
            size="md"
            loading={loading}
            onClick={handleActivate}
          >
            Activate free test →
          </Button>
          <Text size="xs" c="dark.4">
            Want full access?{' '}
            <Button
              variant="transparent"
              size="xs"
              p={0}
              c="brand.4"
              onClick={() => navigate({ to: '/onboarding', search: { step: 3 } })}
            >
              Pick a plan instead
            </Button>
          </Text>
        </Stack>
      </Container>
    </Center>
  )
}
