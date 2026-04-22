import { Outlet, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useUser } from '@clerk/react'
import { Center, Loader, Stack, Text, Button } from '@mantine/core'
import { useEffect } from 'react'

export const Route = createFileRoute('/admin')({
  component: AdminLayout,
})

function AdminLayout() {
  const { isLoaded, isSignedIn, user } = useUser()
  const navigate = useNavigate()

  const isAdmin = isSignedIn && (user?.publicMetadata as Record<string, unknown>)?.role === 'admin'

  // Redirect non-admins to home once auth loads
  useEffect(() => {
    if (isLoaded && !isAdmin) {
      navigate({ to: '/' })
    }
  }, [isLoaded, isAdmin, navigate])

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

  if (!isAdmin) {
    return (
      <Center h="50vh">
        <Stack align="center" gap="md">
          <Text size="lg" fw={500}>Admin Access Required</Text>
          <Text c="dimmed" size="sm">You do not have permission to access this page.</Text>
          <Button onClick={() => navigate({ to: '/' })} fz="sm">
            Go to Home
          </Button>
        </Stack>
      </Center>
    )
  }

  return <Outlet />
}
