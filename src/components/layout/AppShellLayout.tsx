/**
 * Authenticated app-shell layout. Sidebar nav + breadcrumb strip + main
 * content. No top bar on desktop. On mobile a thin header surfaces a burger
 * that collapses/expands the sidebar.
 */
import * as React from 'react'
import {
  Anchor,
  AppShell,
  Box,
  Burger,
  Group,
} from '@mantine/core'
import { useDisclosure, useMediaQuery } from '@mantine/hooks'
import { Link, useRouterState } from '@tanstack/react-router'
import { Sidebar } from './Sidebar'
import { Breadcrumbs } from './Breadcrumbs'
import { LogoMark } from '../Logo'
import { CreditsPill } from '../billing/CreditsPill'

const SIDEBAR_WIDTH = 72
const MOBILE_HEADER_HEIGHT = 56

export function AppShellLayout({ children }: { children: React.ReactNode }) {
  const [opened, { toggle, close }] = useDisclosure(false)
  const isMobile = useMediaQuery('(max-width: 768px)')
  // Routes that own their inner padding (via Container fluid p="lg"). The
  // outer shell padding is tightened so they don't double up.
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isDenseRoute =
    pathname === '/home' ||
    pathname.startsWith('/home/') ||
    (pathname.startsWith('/studio/') && pathname !== '/studio' && pathname !== '/studio/')

  return (
    <AppShell
      header={{
        height: MOBILE_HEADER_HEIGHT,
        collapsed: !isMobile,
      }}
      navbar={{
        width: SIDEBAR_WIDTH,
        breakpoint: 'sm',
        collapsed: { mobile: !opened },
      }}
      padding={0}
      styles={{
        navbar: {
          backgroundColor: 'var(--surface, #ffffff)',
          borderRight: '1px solid var(--border, #e6e8eb)',
          boxShadow: '4px 0 16px rgba(16, 24, 40, 0.05)',
        },
        header: {
          backgroundColor: 'rgba(255, 255, 255, 0.72)',
          backdropFilter: 'blur(22px) saturate(190%)',
          WebkitBackdropFilter: 'blur(22px) saturate(190%)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.6)',
        },
        // Clean, flat light-gray canvas — minimalist, no colored ambient tint.
        main: {
          backgroundColor: 'var(--canvas, #f4f6f8)',
          minHeight: '100vh',
        },
      }}
    >
      <AppShell.Header hiddenFrom="sm">
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="md" wrap="nowrap">
            <Burger
              opened={opened}
              onClick={toggle}
              size="sm"
              color="var(--mantine-color-dark-1)"
              aria-label="Toggle navigation"
            />
            <Anchor component={Link} to="/" underline="never" aria-label="ProdSnap landing page">
              <LogoMark size="sm" />
            </Anchor>
          </Group>
          <CreditsPill />
        </Group>
      </AppShell.Header>

      <AppShell.Navbar>
        <Sidebar onNavigate={close} />
      </AppShell.Navbar>

      <AppShell.Main>
        <Box
          px={isDenseRoute ? 'sm' : { base: 'md', sm: 'xl' }}
          pt={isDenseRoute ? 'xs' : 'md'}
          pb={48}
        >
          {/* Breadcrumbs row + slot for page-level actions (right-aligned).
              Pages render into #page-header-actions via createPortal. */}
          <Group justify="space-between" align="center" wrap="nowrap" gap="md" mih={24}>
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Breadcrumbs />
            </Box>
            <Group gap="sm" wrap="nowrap" style={{ flexShrink: 0 }}>
              <Box id="page-header-actions" />
            </Group>
          </Group>
          <Box mt={isDenseRoute ? 'xs' : 'md'}>{children}</Box>
        </Box>
      </AppShell.Main>
    </AppShell>
  )
}
