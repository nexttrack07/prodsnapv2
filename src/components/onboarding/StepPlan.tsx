import { Box, Button, Group, Stack, Text, Title } from '@mantine/core'
import { PricingTable } from '@clerk/react'

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
          7 days free. Cancel anytime — no charge during your trial.
        </Text>
      </Stack>

      <Box>
        <PricingTable
          for="user"
          newSubscriptionRedirectUrl="/home"
          appearance={{
            variables: {
              colorPrimary: 'var(--mantine-color-brand-5)',
              colorBackground: 'var(--mantine-color-dark-7)',
              colorText: '#ffffff',
              colorTextSecondary: 'var(--mantine-color-dark-2)',
              colorInputBackground: 'var(--mantine-color-dark-6)',
              colorInputText: '#ffffff',
              colorNeutral: 'var(--mantine-color-dark-5)',
              borderRadius: '12px',
              fontFamily: 'var(--mantine-font-family)',
            },
            elements: {
              card: {
                backgroundColor: 'var(--mantine-color-dark-7)',
                borderColor: 'var(--mantine-color-dark-5)',
              },
            },
          }}
        />
      </Box>

      <Text c="dark.3" size="xs" ta="center">
        Not charged until your trial ends. Cancel anytime from Account →
        Billing.
      </Text>

      <Group justify="flex-start">
        <Button variant="subtle" color="gray" onClick={onBack}>
          ← Back
        </Button>
      </Group>
    </Stack>
  )
}
