import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useAuth, SignInButton } from '@clerk/react'
import { useQuery } from 'convex/react'
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
} from '@mantine/core'
import { api } from '../../convex/_generated/api'
import { StepRole } from '~/components/onboarding/StepRole'
import { StepBusiness } from '~/components/onboarding/StepBusiness'
import { StepPlan } from '~/components/onboarding/StepPlan'

type OnboardingSearch = { step?: number }

export const Route = createFileRoute('/onboarding')({
  validateSearch: (search: Record<string, unknown>): OnboardingSearch => {
    const raw = Number(search.step)
    const step = Number.isFinite(raw) ? raw : undefined
    return step && step >= 1 && step <= 3 ? { step } : {}
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
