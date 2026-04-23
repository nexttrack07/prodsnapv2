import { Outlet, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAuth } from '@clerk/react'
import { Center, Loader, Stack, Text, Button } from '@mantine/core'
import { useEffect } from 'react'
import { SubscriptionRequired } from '~/components/billing/SubscriptionRequired'
import { OverLimitBanners } from '~/components/billing/OverLimitBanners'

export const Route = createFileRoute('/studio')({
  component: StudioLayout,
})

function StudioLayout() {
  const { isLoaded, isSignedIn } = useAuth()
  const navigate = useNavigate()

  // Redirect to home if not signed in (after auth loads)
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      navigate({ to: '/' })
    }
  }, [isLoaded, isSignedIn, navigate])

  // Show loading while Clerk initializes
  if (!isLoaded) {
    return (
      <Center h="50vh">
        <Stack align="center" gap="md">
          <Loader size="lg" color="brand" />
          <Text c="dimmed" size="sm">Loading...</Text>
        </Stack>
      </Center>
    )
  }

  // Not signed in - show message (will redirect via useEffect)
  if (!isSignedIn) {
    return (
      <Center h="50vh">
        <Stack align="center" gap="md">
          <Text size="lg" fw={500}>Sign In Required</Text>
          <Text c="dimmed" size="sm">Please sign in to access the studio.</Text>
          <Button onClick={() => navigate({ to: '/' })} fz="sm">
            Go to Home
          </Button>
        </Stack>
      </Center>
    )
  }

  return (
    <SubscriptionRequired>
      <OverLimitBanners />
      <Outlet />
    </SubscriptionRequired>
  )
}
