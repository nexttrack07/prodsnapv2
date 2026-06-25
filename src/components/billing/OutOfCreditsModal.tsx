/**
 * Modal shown when a generate action fails with CREDITS_EXHAUSTED.
 * Surfaces current balance, days until plan reset, upgrade CTA.
 */
import { useQuery } from 'convex/react'
import { Link } from '@tanstack/react-router'
import { Button, Group, Modal, Stack, Text } from '@mantine/core'
import { api } from '../../../convex/_generated/api'

function formatDaysUntil(periodEnd: number): string {
  const now = Date.now()
  const diffMs = periodEnd - now
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays <= 0) return 'today'
  if (diffDays === 1) return 'in 1 day'
  return `in ${diffDays} days`
}

export function OutOfCreditsModal({
  opened,
  onClose,
}: {
  opened: boolean
  onClose: () => void
}) {
  const balance = useQuery(api.credits.getBalance, {})

  const resetLabel = balance?.periodEnd
    ? formatDaysUntil(balance.periodEnd)
    : 'soon'

  const creditsRemaining = balance?.creditsRemaining ?? 0
  const title =
    creditsRemaining === 0
      ? "You've used all your credits this month."
      : 'Not enough credits for this action.'

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
      centered
      styles={{
        content: {
          backgroundColor: 'var(--mantine-color-dark-8)',
          border: '1px solid var(--mantine-color-dark-5)',
        },
        header: {
          backgroundColor: 'var(--mantine-color-dark-8)',
          borderBottom: '1px solid var(--mantine-color-dark-5)',
        },
      }}
    >
      <Stack gap="md" pt="xs">
        {creditsRemaining > 0 && (
          <Text size="sm" c="dark.2">
            You have {creditsRemaining} credit{creditsRemaining === 1 ? '' : 's'} left.
          </Text>
        )}
        <Text size="sm" c="dark.2">
          Plan resets {resetLabel}.
        </Text>

        <Text size="xs" c="dark.3">
          Ad copy, brand kits, and product analysis still work — they're free
          on every plan.
        </Text>

        <Group justify="flex-end" gap="sm" mt="xs">
          <Button variant="default" onClick={onClose}>
            Close
          </Button>
          <Button
            component={Link}
            to="/pricing"
            color="brand"
            onClick={onClose}
          >
            Upgrade plan →
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
