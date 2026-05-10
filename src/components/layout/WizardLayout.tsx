/**
 * Minimal layout for transitional flows: /onboarding and /checkout. No
 * sidebar, no marketing chrome. Brand mark anchored top-left, sign-out
 * top-right (visible only when signed in — gives users a way out of
 * /onboarding without being auto-bounced back by OnboardingGuard).
 * Footer omitted by design.
 */
import * as React from 'react'
import { Anchor, Box, Button, Group } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { SignedIn, SignOutButton } from '@clerk/react'
import { Logo } from '../Logo'

export function WizardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Box
      mih="100vh"
      style={{
        backgroundColor: 'var(--mantine-color-dark-8, #050505)',
      }}
    >
      <Group px="lg" py="md" justify="space-between">
        <Anchor component={Link} to="/" underline="never" aria-label="ProdSnap home">
          <Logo size="sm" />
        </Anchor>
        <SignedIn>
          <SignOutButton>
            <Button variant="subtle" color="gray" size="sm">
              Sign out
            </Button>
          </SignOutButton>
        </SignedIn>
      </Group>
      <Box>{children}</Box>
    </Box>
  )
}
