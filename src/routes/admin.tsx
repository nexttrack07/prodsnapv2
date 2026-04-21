import { Outlet, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAuth } from '@clerk/react'
import { Center, Loader, Stack, Text, Button } from '@mantine/core'
import { useEffect } from 'react'

export const Route = createFileRoute('/admin')({
  component: AdminLayout,
})

function AdminLayout() {
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
          <Text size="lg" fw={500}>Admin Access Required</Text>
          <Text c="dimmed" size="sm">Please sign in to access the admin panel.</Text>
          <Button onClick={() => navigate({ to: '/' })}>
            Go to Home
          </Button>
        </Stack>
      </Center>
    )
  }

  return <Outlet />
}
