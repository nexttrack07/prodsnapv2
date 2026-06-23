/**
 * Ad tests on the product detail page. Lists this product's ad tests (the
 * container that holds a test's creatives + copy) and opens one for review.
 * Previously ad tests were unreachable from the product page — you could only
 * land on one via a ?adTestId= deep link — so generating a test felt like it
 * went nowhere. This is the entry point into the per-test workspace.
 */
import { useQuery } from 'convex/react'
import {
  AspectRatio,
  Badge,
  Box,
  Button,
  Center,
  Group,
  Image,
  Loader,
  Paper,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { IconFlask2, IconPhoto, IconPlus, IconTrophy } from '@tabler/icons-react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'

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

export function AdTestsSection({
  productId,
  onOpenTest,
  onNewTest,
  creditsExhausted,
}: {
  productId: Id<'products'>
  onOpenTest: (adTestId: Id<'adTests'>) => void
  onNewTest: () => void
  creditsExhausted?: boolean
}) {
  const tests = useQuery(api.adTests.listForProduct, { productId })

  return (
    <Stack gap="md" mb="xl">
      <Group justify="space-between" align="center">
        <Group gap="xs" align="center">
          <IconFlask2 size={20} color="var(--mantine-color-brand-5)" />
          <Title order={3} fz={18} c="white" fw={600}>
            Ad tests
          </Title>
          {tests && tests.length > 0 && (
            <Badge color="dark" variant="light" size="sm">
              {tests.length}
            </Badge>
          )}
        </Group>
        <Button
          size="sm"
          color="brand"
          leftSection={<IconPlus size={16} />}
          onClick={onNewTest}
          disabled={creditsExhausted}
        >
          New ad test
        </Button>
      </Group>

      {tests === undefined ? (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} h={92} radius="md" />
          ))}
        </SimpleGrid>
      ) : tests.length === 0 ? (
        <Paper
          radius="lg"
          p="xl"
          withBorder
          style={{
            borderStyle: 'dashed',
            borderWidth: 2,
            borderColor: 'var(--mantine-color-dark-5)',
          }}
        >
          <Group justify="space-between" wrap="wrap" gap="md">
            <Box>
              <Text fw={500} c="dark.0">
                No ad tests yet
              </Text>
              <Text size="sm" c="dark.3" maw={460}>
                An ad test groups several creatives and copy variants so you can
                generate, compare, and pick winners in one place.
              </Text>
            </Box>
            <Button
              color="brand"
              leftSection={<IconPlus size={16} />}
              onClick={onNewTest}
              disabled={creditsExhausted}
            >
              New ad test
            </Button>
          </Group>
        </Paper>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
          {tests.map((t) => (
            <AdTestCard key={t._id} test={t} onOpen={() => onOpenTest(t._id)} />
          ))}
        </SimpleGrid>
      )}
    </Stack>
  )
}

type TestRow = NonNullable<
  ReturnType<typeof useQuery<typeof api.adTests.listForProduct>>
>[number]

function AdTestCard({ test, onOpen }: { test: TestRow; onOpen: () => void }) {
  const status = STATUS_META[test.status] ?? { label: test.status, color: 'gray' }

  return (
    <Paper
      radius="md"
      withBorder
      onClick={onOpen}
      style={{
        cursor: 'pointer',
        overflow: 'hidden',
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
      <CreativeMosaic urls={test.previewUrls} pending={test.pendingCount} />

      <Stack gap={6} p="md">
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Text fw={600} c="white" truncate style={{ minWidth: 0 }}>
            {test.name}
          </Text>
          <Badge color={status.color} variant="light" size="sm">
            {status.label}
          </Badge>
        </Group>
        <Group gap="xs" wrap="nowrap">
          <Text size="xs" c="dark.3">
            {SOURCE_LABEL[test.source] ?? 'Custom'} ·{' '}
            {test.completedImageCount}/{test.plannedImageCount} creatives ·{' '}
            {relativeTime(test.updatedAt)}
          </Text>
          {test.winnerCount > 0 && (
            <Group gap={3} wrap="nowrap" c="yellow.5">
              <IconTrophy size={12} />
              <Text size="xs" fw={600}>
                {test.winnerCount}
              </Text>
            </Group>
          )}
        </Group>
      </Stack>
    </Paper>
  )
}

// A compact 2×2 photo mosaic of a test's creatives (winners first), preserving
// the gallery feel while organizing creatives by test. Falls back to a
// placeholder for a draft / still-generating test.
function CreativeMosaic({ urls, pending }: { urls: string[]; pending: number }) {
  if (urls.length === 0) {
    return (
      <Center h={150} style={{ background: 'var(--mantine-color-dark-7)' }}>
        <Stack align="center" gap={6}>
          {pending > 0 ? (
            <>
              <Loader size="sm" color="brand" />
              <Text size="xs" c="dark.3">
                Generating {pending}…
              </Text>
            </>
          ) : (
            <>
              <IconPhoto size={26} color="var(--mantine-color-dark-3)" />
              <Text size="xs" c="dark.4">
                No creatives yet
              </Text>
            </>
          )}
        </Stack>
      </Center>
    )
  }

  if (urls.length === 1) {
    return (
      <AspectRatio ratio={16 / 9} style={{ background: 'var(--mantine-color-dark-7)' }}>
        <Image src={urls[0]} alt="" style={{ objectFit: 'cover' }} />
      </AspectRatio>
    )
  }

  return (
    <SimpleGrid cols={2} spacing={2} style={{ background: 'var(--mantine-color-dark-7)' }}>
      {urls.slice(0, 4).map((u, i) => (
        <AspectRatio key={i} ratio={1}>
          <Image src={u} alt="" style={{ objectFit: 'cover' }} />
        </AspectRatio>
      ))}
    </SimpleGrid>
  )
}
