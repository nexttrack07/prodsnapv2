/**
 * Layout for unauthenticated marketing pages: landing, pricing, privacy,
 * terms. Top header with Logo + nav + Sign In, footer with legal/links.
 */
import * as React from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import {
  Anchor,
  AppShell,
  Box,
  Burger,
  Button,
  Container,
  Divider,
  Drawer,
  Group,
  Loader,
  Stack,
  Text,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { SignInButton } from '@clerk/react'
import { Unauthenticated, Authenticated } from 'convex/react'
import { Logo } from '../Logo'
import { Footer } from '../Footer'

export function MarketingLayout({ children }: { children: React.ReactNode }) {
  const [mobileNavOpened, { toggle: toggleMobileNav, close: closeMobileNav }] =
    useDisclosure(false)

  return (
    <>
      <AppShell header={{ height: 64 }} padding={0}>
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
                <Group gap={4} visibleFrom="sm">
                  <NavLink to="/">Home</NavLink>
                  <NavLink to="/pricing">Pricing</NavLink>
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
                  <Button
                    component={Link}
                    to="/home"
                    size="sm"
                    color="brand"
                  >
                    App
                  </Button>
                </Authenticated>
              </Group>
            </Group>
          </Container>
        </AppShell.Header>

        <AppShell.Main>{children}</AppShell.Main>
      </AppShell>

      <Footer />

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
          body: { backgroundColor: 'var(--mantine-color-dark-7)' },
          overlay: { backdropFilter: 'blur(4px)' },
        }}
      >
        <Stack gap="xs">
          <MobileNavLink to="/" onClick={closeMobileNav}>
            Home
          </MobileNavLink>
          <MobileNavLink to="/pricing" onClick={closeMobileNav}>
            Pricing
          </MobileNavLink>
          <Divider my="sm" color="dark.5" />
          <Text size="xs" c="dark.2" px="md">
            Pro-quality product photos in a snap
          </Text>
        </Stack>
      </Drawer>
    </>
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

function MobileNavLink({
  to,
  children,
  onClick,
}: {
  to: string
  children: React.ReactNode
  onClick: () => void
}) {
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
          '&:hover': { backgroundColor: 'var(--mantine-color-dark-6)' },
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
        <Box component="span" fz="xs" c="dark.2">
          Loading
        </Box>
      </Group>
    </Box>
  )
}
