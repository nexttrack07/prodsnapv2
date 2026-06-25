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
import { Authenticated, Unauthenticated } from 'convex/react'
import { DefaultCatchBoundary } from '~/components/DefaultCatchBoundary'
import { NotFound } from '~/components/NotFound'
import { BillingSync } from '~/components/billing/BillingSync'
import { OnboardingGuard } from '~/components/onboarding/OnboardingGuard'
import { AuthGuard } from '~/components/auth/AuthGuard'
import { DevResetButton } from '~/components/dev/DevResetButton'
import { ScrapeProgressWatcher } from '~/components/imports/ScrapeProgressWatcher'
import { AppShellLayout } from '~/components/layout/AppShellLayout'
import { MarketingLayout } from '~/components/layout/MarketingLayout'
import { WizardLayout } from '~/components/layout/WizardLayout'
import appCss from '~/styles/app.css?url'
import { seo } from '~/utils/seo'
import { isAppRoute, isWizardRoute } from '~/utils/routeGroups'

const theme = createTheme({
  fontFamily:
    'Lato, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
  fontFamilyMonospace: 'JetBrains Mono, ui-monospace, SFMono-Regular, monospace',
  headings: {
    // Sharp grotesk display for headings (techy, Linear-like) over Lato body.
    fontFamily: '"Space Grotesk", Lato, ui-sans-serif, system-ui, sans-serif',
    fontWeight: '600',
    textWrap: 'balance',
  },
  primaryColor: 'brand',
  white: '#ffffff',
  black: '#16191d',
  colors: {
    // Minimalist monochrome accent: `brand` is a near-black grayscale ramp, so
    // every primary button / link / accent (color="brand", brand.6, etc.)
    // renders black instead of blue. Index 6 is the primary shade.
    brand: [
      '#f4f5f6',
      '#e7e8ea',
      '#cfd1d4',
      '#abaeb3',
      '#7f8389',
      '#4a4e56',
      '#16191d',
      '#0c0e11',
      '#060709',
      '#000000',
    ],
    // Neutral ramp, INVERTED for light mode: the codebase consistently uses low
    // `dark.X` indices for text and high indices for surfaces, so this mapping
    // makes existing `c="dark.2"` / `bg dark-7` / `border dark-5` usages resolve
    // to correct light-theme values without touching those files.
    dark: [
      '#16191d', // 0 — primary text (near-black)
      '#344054', // 1 — strong secondary text
      '#475467', // 2 — secondary text
      '#667085', // 3 — muted text
      '#98a2b3', // 4 — faint text / disabled
      '#e6e8eb', // 5 — hairline border
      '#eef0f3', // 6 — divider / subtle border
      '#ffffff', // 7 — CARD / panel surface (white, pops on the gray canvas)
      '#f4f6f8', // 8 — app canvas / page background (very light gray)
      '#eef1f4', // 9 — deeper nested well
    ],
    // Cool neutral gray used by Mantine defaults (borders, inputs, subtle fills).
    gray: [
      '#fafbfc',
      '#f3f4f6',
      '#eef0f3',
      '#e6e8eb',
      '#d5d9df',
      '#98a2b3',
      '#667085',
      '#475467',
      '#344054',
      '#16191d',
    ],
  },
  defaultRadius: 'xs',
  // Sharp, minimal corners everywhere — every radius token resolves to 4px so
  // cards, buttons, pills, badges, inputs all share the same crisp 4px corner.
  radius: { xs: '4px', sm: '4px', md: '4px', lg: '4px', xl: '4px' },
  shadows: {
    xs: '0 1px 2px rgba(16, 24, 40, 0.05)',
    sm: '0 1px 3px rgba(16, 24, 40, 0.10), 0 1px 2px rgba(16, 24, 40, 0.06)',
    md: '0 4px 8px -2px rgba(16, 24, 40, 0.10), 0 2px 4px -2px rgba(16, 24, 40, 0.06)',
    lg: '0 12px 16px -4px rgba(16, 24, 40, 0.08), 0 4px 6px -2px rgba(16, 24, 40, 0.03)',
    xl: '0 20px 24px -4px rgba(16, 24, 40, 0.08), 0 8px 8px -4px rgba(16, 24, 40, 0.03)',
  },
  other: {
    borderSubtle: 'rgba(16, 24, 40, 0.08)',
  },
  components: {
    Button: {
      defaultProps: { fw: 600 },
    },
    Paper: {
      defaultProps: { radius: 'md' },
    },
    // Mantine derives the SegmentedControl indicator/control radius from
    // calc(radius - 4px), which collapses to 0 (square selection) at our 4px
    // radius. Force a rounded 4px selection via inline styles (beats the class).
    SegmentedControl: {
      styles: {
        indicator: { borderRadius: '4px' },
        control: { borderRadius: '4px' },
      },
    },
    // Dropdown options use `color: inherit` and were picking up a light value.
    // Force dark option text via the styles API (inline → beats inheritance).
    Select: {
      styles: { option: { color: 'var(--mantine-color-text)' } },
    },
    MultiSelect: {
      styles: { option: { color: 'var(--mantine-color-text)' } },
    },
    Autocomplete: {
      styles: { option: { color: 'var(--mantine-color-text)' } },
    },
    Combobox: {
      styles: { option: { color: 'var(--mantine-color-text)' } },
    },
  },
})

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ...seo({
        title: 'ProdSnap — performance creative co-pilot for media buyers',
        description:
          'Save winning ads to a swipe file. Generate 12 Meta-ready variants per batch — using those exact references.',
        image: '/og-prodsnap.png',
      }),
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: '' },
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
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
        <MantineProvider theme={theme} forceColorScheme="light">
          <ModalsProvider>
            <Notifications position={isMobile ? 'top-center' : 'bottom-right'} />
            <Authenticated>
              <BillingSync />
              <OnboardingGuard />
              <ScrapeProgressWatcher />
              <DevResetButton />
            </Authenticated>
            <Unauthenticated>
              <AuthGuard />
            </Unauthenticated>
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
