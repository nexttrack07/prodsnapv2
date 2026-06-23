/**
 * Cross-product Ad Tests index. The sidebar's "Ad tests" destination — every
 * active (non-archived) test the user has, grouped by product, each deep-linking
 * to its review screen at /studio/$productId?adTestId=. Recent-work surface,
 * capped server-side at 100 (see adTests.listMyAdTests), not a full archive.
 */
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import {
  Badge,
  Center,
  Container,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { IconFlask2, IconTrophy } from '@tabler/icons-react'
import { api } from '../../convex/_generated/api'

export const Route = createFileRoute('/ad-tests')({
  component: AdTestsPage,
})

const STATUS_META: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'gray' },
  generating: { label: 'Generating', color: 'blue' },
  ready: { label: 'Ready', color: 'teal' },
  partially_failed: { label: 'Partial', color: 'orange' },
  failed: { label: 'Failed', color: 'red' },
}

const SOURCE_LABEL: Record<string, string> = {
  starter: 'Starter',
  recommendation: 'Recommended',
  winner_iteration: 'Winner iteration',
  custom: 'Custom',
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.round(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

type AdTestRow = NonNullable<
  ReturnType<typeof useQuery<typeof api.adTests.listMyAdTests>>
>[number]

function AdTestsPage() {
  const tests = useQuery(api.adTests.listMyAdTests, {})

  return (
    <Container size="md" py="xl">
      <Group gap="xs" align="center" mb={4}>
        <IconFlask2 size={22} color="var(--mantine-color-brand-5)" />
        <Title order={2} fz={24} c="white" fw={600}>
          Ad tests
        </Title>
      </Group>
      <Text c="dark.2" size="sm" mb="xl">
        Every test you're running, newest first. Open one to review creatives,
        pick winners, and edit copy.
      </Text>

      {tests === undefined ? (
        <Center mih="40vh">
          <Loader color="brand" />
        </Center>
      ) : tests.length === 0 ? (
        <Paper
          radius="lg"
          p={60}
          ta="center"
          withBorder
          style={{
            borderStyle: 'dashed',
            borderWidth: 2,
            borderColor: 'var(--mantine-color-dark-5)',
          }}
        >
          <IconFlask2 size={32} color="var(--mantine-color-dark-3)" />
          <Text size="lg" fw={500} c="dark.1" mt="md" mb="xs">
            No ad tests yet
          </Text>
          <Text size="sm" c="dark.3">
            Start one from a product or from a recommendation on your home
            dashboard.
          </Text>
        </Paper>
      ) : (
        <Stack gap="xl">
          {groupByProduct(tests).map(({ productId, productName, rows }) => (
            <Stack key={productId} gap="sm">
              <Text size="xs" fw={600} c="dark.2" tt="uppercase" style={{ letterSpacing: 0.4 }}>
                {productName}
              </Text>
              <Stack gap="xs">
                {rows.map((t) => (
                  <AdTestCard key={t._id} test={t} />
                ))}
              </Stack>
            </Stack>
          ))}
        </Stack>
      )}
    </Container>
  )
}

function groupByProduct(
  tests: AdTestRow[],
): Array<{ productId: string; productName: string; rows: AdTestRow[] }> {
  const order: string[] = []
  const byId = new Map<string, { productName: string; rows: AdTestRow[] }>()
  for (const t of tests) {
    let group = byId.get(t.productId)
    if (!group) {
      group = { productName: t.productName, rows: [] }
      byId.set(t.productId, group)
      order.push(t.productId)
    }
    group.rows.push(t)
  }
  return order.map((id) => ({ productId: id, ...byId.get(id)! }))
}

function AdTestCard({ test }: { test: AdTestRow }) {
  const status = STATUS_META[test.status] ?? { label: test.status, color: 'gray' }

  return (
    <Link
      to="/studio/$productId"
      params={{ productId: test.productId }}
      search={{ adTestId: test._id }}
      style={{ textDecoration: 'none', display: 'block' }}
    >
      <Paper
        radius="md"
        p="md"
        withBorder
        style={{
          borderColor: 'var(--mantine-color-dark-6)',
          background: 'rgba(255,255,255,0.02)',
          transition: 'border-color 120ms ease, background-color 120ms ease',
        }}
        styles={{
          root: {
            '&:hover': {
              borderColor: 'var(--mantine-color-dark-4)',
              backgroundColor: 'rgba(255,255,255,0.04)',
            },
          },
        }}
      >
        <Group justify="space-between" wrap="nowrap" gap="md">
          <Stack gap={4} style={{ minWidth: 0 }}>
            <Group gap="xs" wrap="nowrap">
              <Text fw={600} c="white" truncate>
                {test.name}
              </Text>
              {test.winnerCount > 0 && (
                <Group gap={3} wrap="nowrap" c="yellow.5">
                  <IconTrophy size={13} />
                  <Text size="xs" fw={600}>
                    {test.winnerCount}
                  </Text>
                </Group>
              )}
            </Group>
            <Text size="xs" c="dark.3">
              {SOURCE_LABEL[test.source] ?? 'Custom'} ·{' '}
              {test.completedImageCount}/{test.plannedImageCount} creatives
              {test.failedImageCount > 0 ? ` · ${test.failedImageCount} failed` : ''} ·{' '}
              {relativeTime(test.updatedAt)}
            </Text>
          </Stack>
          <Group gap="xs" wrap="nowrap">
            {test.exportedAt && (
              <Badge color="gray" variant="light" size="sm">
                Exported
              </Badge>
            )}
            <Badge color={status.color} variant="light" size="sm">
              {status.label}
            </Badge>
          </Group>
        </Group>
      </Paper>
    </Link>
  )
}
