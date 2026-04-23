import { createFileRoute } from '@tanstack/react-router'
import { SignInButton, useAuth } from '@clerk/react'
import { Button, Center, Container, Loader, Stack, Text, Title } from '@mantine/core'
import { CheckoutForm } from '~/components/billing/CheckoutForm'

type CheckoutSearch = {
  planId: string
  period: 'month' | 'annual'
}

export const Route = createFileRoute('/checkout')({
  validateSearch: (search: Record<string, unknown>): CheckoutSearch => {
    const planId = typeof search.planId === 'string' ? search.planId : ''
    const periodRaw = typeof search.period === 'string' ? search.period : 'month'
    const period: 'month' | 'annual' =
      periodRaw === 'annual' ? 'annual' : 'month'
    return { planId, period }
  },
  component: CheckoutRoute,
})

function CheckoutRoute() {
  const { planId, period } = Route.useSearch()
  const { isLoaded, isSignedIn } = useAuth()

  if (!planId) {
    return (
      <Container size="sm" py="xl">
        <Stack align="center" gap="md">
          <Title order={2}>Choose a plan first</Title>
          <Text c="dark.2" ta="center">
            Checkout needs a selected plan before payment can start.
          </Text>
          <Button component="a" href="/pricing" color="brand" fz="sm">
            View plans
          </Button>
        </Stack>
      </Container>
    )
  }

  if (!isLoaded) {
    return (
      <Center h="50vh">
        <Stack align="center" gap="md">
          <Loader size="md" color="brand" />
          <Text c="dark.2" size="sm">Loading checkout...</Text>
        </Stack>
      </Center>
    )
  }

  if (!isSignedIn) {
    return (
      <Container size="sm" py="xl">
        <Stack align="center" gap="md">
          <Title order={2}>Sign in to continue</Title>
          <Text c="dark.2" ta="center">
            Create or sign in to your account before completing checkout.
          </Text>
          <SignInButton mode="modal">
            <Button color="brand" fz="sm">
              Sign in or create account
            </Button>
          </SignInButton>
          <Button component="a" href="/pricing" variant="subtle" color="gray" fz="sm">
            Back to plans
          </Button>
        </Stack>
      </Container>
    )
  }

  return <CheckoutForm planId={planId} period={period} />
}
