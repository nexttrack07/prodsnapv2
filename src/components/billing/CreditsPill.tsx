/**
 * CreditsPill — always-visible header badge showing the user's remaining
 * credits. Reactive via Convex useQuery. Hidden when signed out or before the
 * first credit grant (null result).
 *
 * Color thresholds (absolute remaining credits):
 *   >= 50  → green  (healthy)
 *   10–49  → yellow (low)
 *   < 10   → red    (critical)
 */
import { useState } from 'react'
import { useQuery } from 'convex/react'
import { Box, Group, Popover, Stack, Text, UnstyledButton } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { IconCoins } from '@tabler/icons-react'
import { api } from '../../../convex/_generated/api'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPlanName(slug: string): string {
  if (!slug) return 'Free'
  return slug.charAt(0).toUpperCase() + slug.slice(1)
}

function formatDaysUntil(periodEnd: number): string {
  const now = Date.now()
  const diffMs = periodEnd - now
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays <= 0) return 'today'
  if (diffDays === 1) return 'in 1 day'
  return `in ${diffDays} days`
}

function pillColor(creditsRemaining: number): string {
  if (creditsRemaining >= 50) return 'var(--mantine-color-teal-5)'
  if (creditsRemaining >= 10) return 'var(--mantine-color-yellow-5)'
  return 'var(--mantine-color-red-5)'
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CreditsPill() {
  const [opened, setOpened] = useState(false)
  const balance = useQuery(api.credits.getBalance, {})

  // undefined = loading, null = signed out / pre-grant → hide
  if (balance === undefined || balance === null) return null

  const { creditsRemaining, planRemainingMc, topupBalanceMc, periodEnd, planSlug } = balance

  const planCreditsLeft = Math.floor(planRemainingMc / 1000)
  const topupCreditsLeft = Math.floor(topupBalanceMc / 1000)
  const color = pillColor(creditsRemaining)
  const resetLabel = periodEnd ? formatDaysUntil(periodEnd) : 'soon'

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      offset={8}
      shadow="md"
      width={220}
    >
      <Popover.Target>
        <UnstyledButton
          onClick={() => setOpened((o) => !o)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: 20,
            background: 'var(--mantine-color-dark-6)',
            border: `1px solid var(--mantine-color-dark-4)`,
            cursor: 'pointer',
            userSelect: 'none',
          }}
          aria-label={`${creditsRemaining} credits remaining`}
        >
          <IconCoins size={14} stroke={1.8} />
          <Text size="xs" fw={600} style={{ color }}>
            {creditsRemaining} left
          </Text>
        </UnstyledButton>
      </Popover.Target>

      <Popover.Dropdown
        style={{
          background: 'var(--mantine-color-dark-8)',
          border: '1px solid var(--mantine-color-dark-5)',
          borderRadius: 8,
          padding: '12px 14px',
        }}
      >
        <Stack gap="xs">
          {/* Plan header */}
          <Group justify="space-between" align="baseline" wrap="nowrap">
            <Text size="sm" fw={700} c="dark.0">
              {formatPlanName(planSlug)} plan
            </Text>
          </Group>

          {/* Breakdown rows */}
          <Box>
            <Group justify="space-between" wrap="nowrap">
              <Text size="xs" c="dark.2">
                Plan credits left
              </Text>
              <Text size="xs" c="dark.0">
                {planCreditsLeft}
              </Text>
            </Group>

            {topupBalanceMc > 0 && (
              <Group justify="space-between" wrap="nowrap" mt={2}>
                <Text size="xs" c="dark.2">
                  Top-up credits
                </Text>
                <Text size="xs" c="dark.0">
                  {topupCreditsLeft}
                </Text>
              </Group>
            )}

            <Group justify="space-between" wrap="nowrap" mt={6}>
              <Text size="xs" fw={700} c="dark.0">
                Total
              </Text>
              <Text size="xs" fw={700} style={{ color }}>
                {creditsRemaining}
              </Text>
            </Group>
          </Box>

          {/* Reset hint */}
          <Text size="xs" c="dark.3" mt={2}>
            Plan credits reset {resetLabel}.
          </Text>

          {/* Upgrade link */}
          <Box mt={2}>
            <Text
              component={Link}
              to="/pricing"
              size="xs"
              c="teal.4"
              style={{ textDecoration: 'none' }}
              onClick={() => setOpened(false)}
            >
              Upgrade →
            </Text>
          </Box>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}
