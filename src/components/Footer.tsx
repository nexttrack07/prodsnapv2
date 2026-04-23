import { Link } from '@tanstack/react-router'
import { Anchor, Box, Container, Group, SimpleGrid, Stack, Text } from '@mantine/core'
import { useClerk } from '@clerk/react'
import { Authenticated, Unauthenticated } from 'convex/react'

export function Footer() {
  const { openUserProfile } = useClerk()

  return (
    <Box
      component="footer"
      py="xl"
      style={{
        backgroundColor: 'var(--mantine-color-dark-8)',
        borderTop: '1px solid var(--mantine-color-dark-5)',
      }}
    >
      <Container size="xl">
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xl">
          <Stack gap="xs">
            <Text fz="xs" fw={600} c="dark.1" tt="uppercase">
              Legal
            </Text>
            <Anchor
              component={Link}
              to="/privacy"
              fz="xs"
              c="dark.2"
              underline="never"
              styles={{ root: { '&:hover': { color: 'var(--mantine-color-brand-4)' } } }}
            >
              Privacy Policy
            </Anchor>
            <Anchor
              component={Link}
              to="/terms"
              fz="xs"
              c="dark.2"
              underline="never"
              styles={{ root: { '&:hover': { color: 'var(--mantine-color-brand-4)' } } }}
            >
              Terms of Service
            </Anchor>
          </Stack>

          <Authenticated>
            <Stack gap="xs">
              <Text fz="xs" fw={600} c="dark.1" tt="uppercase">
                Account
              </Text>
              <Anchor
                component="button"
                fz="xs"
                c="dark.2"
                underline="never"
                onClick={() => openUserProfile()}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
                styles={{ root: { '&:hover': { color: 'var(--mantine-color-brand-4)' } } }}
              >
                Manage account
              </Anchor>
              <Anchor
                component="button"
                fz="xs"
                c="dark.2"
                underline="never"
                onClick={() => openUserProfile()}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
                styles={{ root: { '&:hover': { color: 'var(--mantine-color-brand-4)' } } }}
              >
                Delete account
              </Anchor>
            </Stack>
          </Authenticated>

          <Unauthenticated>
            {/* Empty column placeholder to preserve 3-col layout on desktop */}
            <div />
          </Unauthenticated>

          <Stack gap="xs">
            <Text fz="xs" fw={600} c="dark.1" tt="uppercase">
              Support
            </Text>
            <Anchor
              href="mailto:support@prodsnap.io"
              fz="xs"
              c="dark.2"
              underline="never"
              styles={{ root: { '&:hover': { color: 'var(--mantine-color-brand-4)' } } }}
            >
              support@prodsnap.io
            </Anchor>
            <Text fz="xs" c="dark.3" mt="xs">
              © 2026 ProdSnap
            </Text>
          </Stack>
        </SimpleGrid>
      </Container>
    </Box>
  )
}
