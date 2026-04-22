/// <reference types="vite/client" />
import { ReactQueryDevtools } from '@tanstack/react-query-devtools/production'
import {
  Link,
  Outlet,
  createRootRouteWithContext,
  useRouterState,
  HeadContent,
  Scripts,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import * as React from 'react'
import {
  MantineProvider,
  createTheme,
  AppShell,
  Container,
  Group,
  Anchor,
  Loader,
  Box,
  Button,
  Burger,
  Drawer,
  Stack,
  Divider,
  Text,
} from '@mantine/core'
import { useDisclosure, useMediaQuery } from '@mantine/hooks'
import { Notifications } from '@mantine/notifications'
import type { QueryClient } from '@tanstack/react-query'
import { SignInButton, UserButton } from '@clerk/react'
import { Authenticated, Unauthenticated } from 'convex/react'
import { DefaultCatchBoundary } from '~/components/DefaultCatchBoundary'
import { NotFound } from '~/components/NotFound'
import { Logo } from '~/components/Logo'
import { BillingSync } from '~/components/billing/BillingSync'
import appCss from '~/styles/app.css?url'
import { seo } from '~/utils/seo'

const theme = createTheme({
  fontFamily: 'Poppins, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
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
  defaultRadius: 'md',
  components: {
    Button: {
      defaultProps: {
        fw: 500,
      },
    },
  },
})

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
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
  const [mobileNavOpened, { toggle: toggleMobileNav, close: closeMobileNav }] = useDisclosure(false)

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <MantineProvider theme={theme} forceColorScheme="dark">
          <Notifications position={isMobile ? 'top-center' : 'bottom-right'} />
          <AppShell
            header={{ height: 64 }}
            padding={0}
          >
            <AppShell.Header
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.85)',
                backdropFilter: 'blur(8px)',
                borderBottom: '1px solid var(--mantine-color-dark-5)',
              }}
            >
              <Container size="xl" h="100%">
                <Group h="100%" justify="space-between">
                  <Group gap="xl">
                    {/* Mobile hamburger menu - hidden on desktop */}
                    <Burger
                      opened={mobileNavOpened}
                      onClick={toggleMobileNav}
                      hiddenFrom="sm"
                      size="sm"
                      color="var(--mantine-color-dark-1)"
                      aria-label="Toggle navigation"
                    />
                    <Anchor component={Link} to="/" underline="never" aria-label="ProdSnap home">
                      <Logo size="md" />
                    </Anchor>
                    {/* Desktop navigation - hidden on mobile */}
                    <Group gap={4} visibleFrom="sm">
                      <NavLink to="/">Home</NavLink>
                      <NavLink to="/studio">Studio</NavLink>
                      <NavLink to="/admin">Admin</NavLink>
                    </Group>
                  </Group>
                  <Group gap="md">
                    <LoadingIndicator />
                    <Unauthenticated>
                      <SignInButton mode="modal">
                        <Button size="sm" variant="light" color="brand">
                          Sign In
                        </Button>
                      </SignInButton>
                    </Unauthenticated>
                    <Authenticated>
                      <BillingSync />
                      <UserButton
                        appearance={{
                          elements: {
                            avatarBox: {
                              width: 32,
                              height: 32,
                            },
                          },
                        }}
                      />
                    </Authenticated>
                  </Group>
                </Group>
              </Container>
            </AppShell.Header>

            <AppShell.Main>
              {children}
            </AppShell.Main>
          </AppShell>

          {/* Mobile navigation drawer - only renders on mobile */}
          <Drawer
            opened={mobileNavOpened}
            onClose={closeMobileNav}
            size="xs"
            padding="md"
            hiddenFrom="sm"
            title={<Logo size="sm" />}
            styles={{
              header: {
                backgroundColor: 'var(--mantine-color-dark-7)',
                borderBottom: '1px solid var(--mantine-color-dark-5)',
              },
              body: {
                backgroundColor: 'var(--mantine-color-dark-7)',
              },
              overlay: {
                backdropFilter: 'blur(4px)',
              },
            }}
          >
            <Stack gap="xs">
              <MobileNavLink to="/" onClick={closeMobileNav}>Home</MobileNavLink>
              <MobileNavLink to="/studio" onClick={closeMobileNav}>Studio</MobileNavLink>
              <MobileNavLink to="/admin" onClick={closeMobileNav}>Admin</MobileNavLink>
              <Divider my="sm" color="dark.5" />
              <Text size="xs" c="dark.2" px="md">
                Pro-quality product photos in a snap
              </Text>
            </Stack>
          </Drawer>

          <ReactQueryDevtools />
          <TanStackRouterDevtools position="bottom-right" />
        </MantineProvider>
        <Scripts />
      </body>
    </html>
  )
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isActive = to === '/' ? pathname === '/' : pathname.startsWith(to)

  return (
    <Anchor
      component={Link}
      to={to}
      underline="never"
      px="sm"
      py={6}
      fz="sm"
      fw={500}
      c={isActive ? 'white' : 'dark.1'}
      bg={isActive ? 'dark.6' : undefined}
      style={{
        borderRadius: 'var(--mantine-radius-md)',
        transition: 'background-color 150ms ease, color 150ms ease',
      }}
      styles={{
        root: {
          '&:hover': {
            backgroundColor: 'var(--mantine-color-dark-6)',
            color: 'white',
          },
        },
      }}
    >
      {children}
    </Anchor>
  )
}

function MobileNavLink({ to, children, onClick }: { to: string; children: React.ReactNode; onClick: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isActive = to === '/' ? pathname === '/' : pathname.startsWith(to)

  return (
    <Anchor
      component={Link}
      to={to}
      onClick={onClick}
      underline="never"
      px="md"
      py="sm"
      fz="md"
      fw={isActive ? 600 : 500}
      c={isActive ? 'white' : 'dark.0'}
      bg={isActive ? 'dark.6' : undefined}
      display="block"
      style={{
        borderRadius: 'var(--mantine-radius-md)',
        transition: 'background-color 150ms ease',
      }}
      styles={{
        root: {
          '&:hover': {
            backgroundColor: 'var(--mantine-color-dark-6)',
          },
        },
      }}
    >
      {children}
    </Anchor>
  )
}

function LoadingIndicator() {
  const isLoading = useRouterState({ select: (s) => s.isLoading })
  return (
    <Box
      style={{
        opacity: isLoading ? 1 : 0,
        transition: 'opacity 300ms ease',
        transitionDelay: isLoading ? '200ms' : '0ms',
      }}
    >
      <Group gap="xs">
        <Loader size="xs" color="brand" />
        <Box component="span" fz="xs" c="dark.2">Loading</Box>
      </Group>
    </Box>
  )
}
