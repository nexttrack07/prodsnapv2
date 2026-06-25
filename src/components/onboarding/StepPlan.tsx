import { Component, Suspense, type ReactNode } from 'react'
import { Anchor, Box, Button, Center, Group, Loader, Stack, Text, Title } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { PricingTable } from '@clerk/react'

/**
 * Error boundary around Clerk's hosted PricingTable. On mobile Safari / slow
 * hydration the embedded billing UI can fail to mount; without this boundary a
 * render error would blank the whole onboarding step (no pay path). On failure
 * we fall back to a link to the standalone /pricing page so the user can still
 * subscribe.
 */
class PricingErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(error: unknown) {
    console.error('[StepPlan] PricingTable failed to render:', error)
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children
  }
}

function PricingFallback() {
  return (
    <Stack gap="sm" align="center" py="lg">
      <Text c="dark.2" ta="center" size="sm" maw={420}>
        The plan picker didn't load here. You can choose a plan on our pricing
        page instead — it takes just a moment.
      </Text>
      <Button component={Link} to="/pricing" color="brand">
        View plans
      </Button>
    </Stack>
  )
}

/**
 * Final onboarding step. Renders Clerk's hosted PricingTable so plan
 * selection + checkout happens inline — no custom redirects to
 * `/checkout` and no `openUserProfile()` detour.
 *
 * Styling: dark theme variables passed via Clerk's `appearance` prop to
 * match the rest of the app.
 */
export function StepPlan({ onBack }: { onBack: () => void }) {
  return (
    <Stack gap="lg">
      <Stack gap="xs" align="center">
        <Title order={1} fz={28} fw={600} ta="center">
          Pick your plan
        </Title>
        <Text c="dark.2" ta="center" maw={460}>
          Pick a plan to unlock exports and bigger tests. Cancel anytime.
        </Text>
        <Text c="dark.3" size="sm" ta="center" maw={500}>
          All plans include unlimited ad copy, brand kits, and product analysis. Image generations are credit-metered.
        </Text>
      </Stack>

      <Box>
        <PricingErrorBoundary fallback={<PricingFallback />}>
          <Suspense
            fallback={
              <Center py="xl">
                <Loader color="brand" />
              </Center>
            }
          >
            <PricingTable
              for="user"
              newSubscriptionRedirectUrl="/onboarding?subscribed=1"
              appearance={{
                variables: {
                  colorPrimary: 'var(--mantine-color-brand-5)',
                  colorBackground: 'var(--surface, #ffffff)',
                  colorText: '#16191D',
                  colorTextSecondary: 'var(--text-2, #475467)',
                  colorInputBackground: 'var(--surface-muted, #f7f8fa)',
                  colorInputText: '#16191D',
                  colorNeutral: 'var(--border, #e6e8eb)',
                  borderRadius: '12px',
                  fontFamily: 'var(--mantine-font-family)',
                },
                elements: {
                  card: {
                    backgroundColor: 'var(--surface, #ffffff)',
                    borderColor: 'var(--border, #e6e8eb)',
                  },
                },
              }}
            />
          </Suspense>
        </PricingErrorBoundary>
      </Box>

      <Text c="dark.3" size="xs" ta="center">
        You're only charged when you subscribe. Cancel anytime from Account →
        Billing.
      </Text>

      <Text c="dark.3" size="xs" ta="center">
        Trouble loading the plans?{' '}
        <Anchor component={Link} to="/pricing" c="brand.4" inherit>
          Open the pricing page
        </Anchor>
        .
      </Text>

      <Group justify="flex-start">
        <Button variant="subtle" color="gray" onClick={onBack}>
          ← Back
        </Button>
      </Group>
    </Stack>
  )
}
