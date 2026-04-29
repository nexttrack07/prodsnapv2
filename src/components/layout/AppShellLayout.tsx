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
import { Link } from '@tanstack/react-router'
import { Sidebar } from './Sidebar'
import { Breadcrumbs } from './Breadcrumbs'
import { LogoMark } from '../Logo'

const SIDEBAR_WIDTH = 72
const MOBILE_HEADER_HEIGHT = 56

export function AppShellLayout({ children }: { children: React.ReactNode }) {
  const [opened, { toggle, close }] = useDisclosure(false)
  const isMobile = useMediaQuery('(max-width: 768px)')

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
          backgroundColor: 'var(--mantine-color-dark-7)',
          borderRight: '1px solid var(--mantine-color-dark-5)',
        },
        header: {
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid var(--mantine-color-dark-5)',
        },
        main: {
          backgroundColor: 'var(--mantine-color-dark-8, #050505)',
          minHeight: '100vh',
        },
      }}
    >
      <AppShell.Header hiddenFrom="sm">
        <Group h="100%" px="md" justify="space-between">
          <Group gap="md">
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
        </Group>
      </AppShell.Header>

      <AppShell.Navbar>
        <Sidebar onNavigate={close} />
      </AppShell.Navbar>

      <AppShell.Main>
        <Box px={{ base: 'md', sm: 'xl' }} pt="md" pb={48}>
          {/* Breadcrumbs row + slot for page-level actions (right-aligned).
              Pages render into #page-header-actions via createPortal. */}
          <Group justify="space-between" align="center" wrap="nowrap" gap="md" mih={24}>
            <Box style={{ flex: 1, minWidth: 0 }}>
              <Breadcrumbs />
            </Box>
            <Box id="page-header-actions" style={{ flexShrink: 0 }} />
          </Group>
          <Box mt="md">{children}</Box>
        </Box>
      </AppShell.Main>
    </AppShell>
  )
}
