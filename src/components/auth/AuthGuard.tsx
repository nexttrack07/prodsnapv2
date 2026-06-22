/**
 * Invisible guard that redirects unauthenticated visitors away from app-shell
 * routes to /sign-in. Mounted inside <Unauthenticated/> in the root layout, so
 * it only fires once Convex has resolved auth state as signed-out — never
 * during the loading window, avoiding a premature redirect or shell flash.
 *
 * Mirror image of OnboardingGuard (which sits inside <Authenticated/>).
 */
import { useEffect } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { isAppRoute } from '~/utils/routeGroups'

export function AuthGuard() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const navigate = useNavigate()

  useEffect(() => {
    if (isAppRoute(pathname)) {
      // /sign-in is a splat route (Clerk path routing); target the base path.
      navigate({ to: '/sign-in/$', params: { _splat: '' } })
    }
  }, [pathname, navigate])

  return null
}
