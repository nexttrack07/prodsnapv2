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
import { STARTER_MODE_KEY } from '../../routes/onboarding'

// Paths the user can visit while onboarding is incomplete.
const ALLOWED_PREFIXES = [
  '/onboarding',
  '/checkout',
  '/pricing',
  '/sign-in',
  '/sign-up',
  '/privacy',
  '/terms',
  // Browse-allowed: pending (signed-up-but-unpaid) users can explore the
  // template library before committing to a plan. Without this they're
  // trapped in the wizard and bounce — a hard funnel drop-off. Generating
  // still requires onboarding, so this is read-only exploration.
  '/templates',
]

// Extra paths unlocked when the user entered via the no-card starter flow.
const STARTER_ALLOWED_PREFIXES = ['/home', '/studio']

export function OnboardingGuard() {
  const status = useQuery(api.onboardingProfiles.getOnboardingStatus, {})
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const navigate = useNavigate()

  useEffect(() => {
    if (!status) return // loading
    if (status.state === 'unauthenticated') return

    // Pending users (signed up but haven't finished plan selection) are
    // force-routed to /onboarding from app routes, but may freely browse the
    // landing page (/) and the allow-listed marketing/browse routes (e.g.
    // /templates) so they can explore before paying instead of being trapped.
    if (status.state === 'pending') {
      if (pathname === '/') return
      if (ALLOWED_PREFIXES.some((p) => pathname.startsWith(p))) return

      // Starter-mode users activated a free test (no card). Allow them to
      // access /home and /studio so they can see their generated creatives
      // without being bounced back to onboarding.
      const isStarterMode = sessionStorage.getItem(STARTER_MODE_KEY) === 'starter'
      if (isStarterMode && STARTER_ALLOWED_PREFIXES.some((p) => pathname.startsWith(p))) return

      navigate({ to: '/onboarding' })
    }

    // Clear the starter flag once the user completes onboarding (paid plan).
    if (status.state !== 'pending') {
      sessionStorage.removeItem(STARTER_MODE_KEY)
    }
  }, [status, pathname, navigate])

  return null
}
