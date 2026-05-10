/// <reference types="vite/client" />
import {
  Outlet,
  createRootRouteWithContext,
  useRouterState,
  HeadContent,
  Scripts,
} from '@tanstack/react-router'
import * as React from 'react'
import {
  MantineProvider,
  createTheme,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { Notifications } from '@mantine/notifications'
import { ModalsProvider } from '@mantine/modals'
import type { QueryClient } from '@tanstack/react-query'
import { Authenticated } from 'convex/react'
import { DefaultCatchBoundary } from '~/components/DefaultCatchBoundary'
import { NotFound } from '~/components/NotFound'
import { BillingSync } from '~/components/billing/BillingSync'
import { OnboardingGuard } from '~/components/onboarding/OnboardingGuard'
import { AppShellLayout } from '~/components/layout/AppShellLayout'
import { MarketingLayout } from '~/components/layout/MarketingLayout'
import { WizardLayout } from '~/components/layout/WizardLayout'
import appCss from '~/styles/app.css?url'
import { seo } from '~/utils/seo'

const theme = createTheme({
  fontFamily:
    'Poppins, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
  primaryColor: 'brand',
  colors: {
    brand: [
      '#e5f3ff',
      '#cde2ff',
      '#9ac2ff',
      '#64a0ff',
      '#3884fe',
      '#1d72fe',
      '#0063ff',
      '#0058e4',
      '#004ecd',
      '#0043b5',
    ],
    dark: [
      '#C1C2C5',
      '#A6A7AB',
      '#909296',
      '#5C5F66',
      '#373A40',
      '#2C2E33',
      '#1a1a1a',
      '#0d0d0d',
      '#050505',
      '#000000',
    ],
  },
  defaultRadius: 'lg',
  other: {
    borderSubtle: 'rgba(255, 255, 255, 0.06)',
  },
  components: {
    Button: {
      defaultProps: { fw: 600 },
    },
  },
})

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ...seo({
        title: 'ProdSnap — Pro-quality product photos in a snap',
        description:
          'Upload a product photo, pick Facebook-ad templates, and generate variations in seconds.',
      }),
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: '' },
      { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
      { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
      { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
      { rel: 'icon', href: '/favicon.ico' },
    ],
  }),
  errorComponent: (props) => (
    <RootDocument>
      <DefaultCatchBoundary {...props} />
    </RootDocument>
  ),
  notFoundComponent: () => <NotFound />,
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const isMobile = useMediaQuery('(max-width: 768px)')

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <MantineProvider theme={theme} forceColorScheme="dark">
          <ModalsProvider>
            <Notifications position={isMobile ? 'top-center' : 'bottom-right'} />
            <Authenticated>
              <BillingSync />
              <OnboardingGuard />
            </Authenticated>
            <LayoutSwitcher>{children}</LayoutSwitcher>
          </ModalsProvider>
        </MantineProvider>
        <Scripts />
      </body>
    </html>
  )
}

// Route-driven layout selection. Auth state matters separately (handled by
// OnboardingGuard) — chrome is determined by where the user is, not who.
function LayoutSwitcher({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  if (isWizardRoute(pathname)) return <WizardLayout>{children}</WizardLayout>
  if (isAppRoute(pathname)) return <AppShellLayout>{children}</AppShellLayout>
  return <MarketingLayout>{children}</MarketingLayout>
}

const APP_ROUTE_PREFIXES = [
  '/home',
  '/studio',
  '/account',
  '/admin',
  '/products',
  '/library',
  '/templates',
  '/strategy',
  '/ads',
]
function isAppRoute(pathname: string): boolean {
  return APP_ROUTE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

const WIZARD_ROUTE_PREFIXES = ['/onboarding', '/checkout']
function isWizardRoute(pathname: string): boolean {
  return WIZARD_ROUTE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
}
