/**
 * Central route classification, shared by the root layout switcher and the
 * auth guard so the two can never drift. A pathname matches a prefix when it
 * equals the prefix exactly or sits beneath it (`/studio` and `/studio/123`).
 */

// App-shell routes. These require an authenticated user — an anonymous visitor
// is redirected to /sign-in by AuthGuard.
export const APP_ROUTE_PREFIXES = [
  '/home',
  '/studio',
  '/account',
  '/admin',
  '/products',
  '/library',
  '/templates',
  '/strategy',
  '/ads',
  '/ad-tests',
]

// Wizard-chrome routes (onboarding / checkout). These manage their own auth
// (onboarding hosts its own sign-in modal), so AuthGuard leaves them alone.
export const WIZARD_ROUTE_PREFIXES = ['/onboarding', '/checkout']

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export function isAppRoute(pathname: string): boolean {
  return matchesPrefix(pathname, APP_ROUTE_PREFIXES)
}

export function isWizardRoute(pathname: string): boolean {
  return matchesPrefix(pathname, WIZARD_ROUTE_PREFIXES)
}
