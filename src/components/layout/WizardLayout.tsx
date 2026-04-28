/**
 * Minimal layout for transitional flows: /onboarding and /checkout. No
 * sidebar, no marketing chrome. Just the brand mark anchored top-left so the
 * user can ground themselves, with the wizard / checkout content centered
 * underneath. Footer omitted by design.
 */
import * as React from 'react'
import { Anchor, Box, Group } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { Logo } from '../Logo'

export function WizardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Box
      mih="100vh"
      style={{
        backgroundColor: 'var(--mantine-color-dark-8, #050505)',
      }}
    >
      <Group px="lg" py="md">
        <Anchor component={Link} to="/" underline="never" aria-label="ProdSnap home">
          <Logo size="sm" />
        </Anchor>
      </Group>
      <Box>{children}</Box>
    </Box>
  )
}
