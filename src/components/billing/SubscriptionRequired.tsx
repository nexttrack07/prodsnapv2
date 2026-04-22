/**
 * Wraps protected routes. If the signed-in user has no synced plan,
 * redirects to /pricing. Shows a brief loader during the initial sync
 * so users with plans don't see a flash-to-/pricing on page load.
 *
 * Placement pattern: wrap inside a route component, inside <Authenticated>,
 * so unauthenticated users aren't rerouted here. Unauthenticated users see
 * the sign-in experience from __root's <Unauthenticated> branch.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from '@tanstack/react-router'
import { Center, Loader, Stack, Text } from '@mantine/core'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'

// Tunables: how long to wait for BillingSync to populate userPlans before
// redirecting to /pricing. Keeps us generous during flaky networks and
// avoids flashing new subscribers back to /pricing right after checkout.
const SYNC_GRACE_MS = 3000

export function SubscriptionRequired({ children }: { children: ReactNode }) {
  const router = useRouter()
  const status = useQuery(api.billing.syncPlan.getBillingStatus)
  const [graceExpired, setGraceExpired] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setGraceExpired(true), SYNC_GRACE_MS)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!status) return
    if (status.signedIn && !status.plan && graceExpired) {
      router.navigate({ to: '/pricing' })
    }
  }, [status, graceExpired, router])

  if (!status) {
    return <LoadingGate />
  }
  // Not signed in — let the parent branch handle it (should be rare here
  // because this wrapper is inside <Authenticated> by convention).
  if (!status.signedIn) return <>{children}</>
  // Plan not yet synced — either grace period, or we've already kicked off
  // the redirect. Render a loader to avoid a flash of protected content.
  if (!status.plan) return <LoadingGate hint="Loading your subscription…" />
  return <>{children}</>
}

function LoadingGate({ hint }: { hint?: string }) {
  return (
    <Center h="60vh">
      <Stack align="center" gap="md">
        <Loader size="md" color="brand" />
        {hint && (
          <Text c="dark.2" size="sm">
            {hint}
          </Text>
        )}
      </Stack>
    </Center>
  )
}
