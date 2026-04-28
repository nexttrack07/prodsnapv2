/**
 * Invisible guard that redirects authenticated users with an incomplete
 * onboarding profile into /onboarding. Mounted inside <Authenticated/> in
 * the root layout, alongside BillingSync.
 *
 * Existing users with at least one product are treated as onboarded
 * (status === 'legacy') so they're never bounced backward.
 */
import { useEffect } from 'react'
import { useQuery } from 'convex/react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { api } from '../../../convex/_generated/api'

// Paths the user can visit while onboarding is incomplete.
const ALLOWED_PREFIXES = [
  '/onboarding',
  '/checkout',
  '/pricing',
  '/sign-in',
  '/sign-up',
  '/privacy',
  '/terms',
]

export function OnboardingGuard() {
  const status = useQuery(api.onboardingProfiles.getOnboardingStatus, {})
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const navigate = useNavigate()

  useEffect(() => {
    if (!status) return // loading
    if (status.state === 'unauthenticated') return

    // Pending users (signed up but haven't finished plan selection) need to
    // be force-routed to /onboarding from anywhere outside the allow-list,
    // including the landing page. Onboarded users can visit / freely — the
    // landing page has its own "App" link to bring them back into the app.
    if (status.state === 'pending') {
      if (pathname === '/') {
        navigate({ to: '/onboarding' })
        return
      }
      if (ALLOWED_PREFIXES.some((p) => pathname.startsWith(p))) return
      navigate({ to: '/onboarding' })
    }
  }, [status, pathname, navigate])

  return null
}
