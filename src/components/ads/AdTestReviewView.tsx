/**
 * Ad Test review mode — shown in /studio/$productId?adTestId=...
 * Groups generated creatives by angle/prompt concept and placement,
 * with winner toggles and a back-to-gallery escape hatch.
 */
import { useQuery, useMutation } from '@tanstack/react-query'
import { convexQuery, useConvexMutation } from '@convex-dev/react-query'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import {
  Box,
  Group,
  Stack,
  Text,
  Title,
  Badge,
  Button,
  Paper,
  Image,
  ActionIcon,
  Loader,
  AspectRatio,
  Tooltip,
  Popover,
  Select,
} from '@mantine/core'
import {
  IconArrowLeft,
  IconStar,
  IconStarFilled,
  IconMaximize,
  IconLink,
} from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { CopyBankPanel } from './CopyBankPanel'

// ─── Constants ───────────────────────────────────────────────────────────────

const PLACEMENT_LABEL: Record<string, string> = {
  feed_square: 'Feed 1:1',
  feed_vertical: 'Feed 4:5',
  story_reel: 'Story 9:16',
  landscape: 'Landscape 16:9',
}

const ASPECT_RATIO_VALUE: Record<string, number> = {
  '1:1': 1,
  '4:5': 4 / 5,
  '9:16': 9 / 16,
  '16:9': 16 / 9,
}

const STATUS_COLOR: Record<string, string> = {
  draft: 'gray',
  generating: 'blue',
  ready: 'green',
  partially_failed: 'orange',
  failed: 'red',
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  generating: 'Generating…',
  ready: 'Ready',
  partially_failed: 'Partial',
  failed: 'Failed',
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AdTestReviewView({
  adTestId,
  hasPaidPlan,
  onBack,
  onOpenAd,
}: {
  adTestId: Id<'adTests'>
  /** When false, the export button shows an upgrade prompt instead of being simply disabled. */
  hasPaidPlan: boolean
  onBack: () => void
  onOpenAd: (id: Id<'templateGenerations'>) => void
}) {
  const { data, isLoading } = useQuery(
    convexQuery(api.adTests.getById, { adTestId }),
  )
  // Copy sets power the per-creative pairing control (optional pairing — buyers
  // may also test copy independently from creatives).
  const { data: copySets } = useQuery(
    convexQuery(api.adTests.listCopySets, { adTestId }),
  )

  const toggleWinnerMutation = useConvexMutation(api.templateGenerations.toggleWinner)
  const { mutate: toggleWinner } = useMutation({ mutationFn: toggleWinnerMutation })

  if (isLoading) {
    return (
      <Box py={60} ta="center">
        <Loader size="sm" color="blue" />
        <Text size="sm" c="dark.3" mt="sm">Loading test…</Text>
      </Box>
    )
  }

  if (!data) {
    return (
      <Box py={60} ta="center">
        <Text size="sm" c="dark.3">Ad Test not found.</Text>
        <Button variant="subtle" size="xs" mt="md" onClick={onBack}>
          Back to gallery
        </Button>
      </Box>
    )
  }

  const { adTest, generations } = data

  // Index prompt text → its position in adTest.prompts so labels stay stable
  // regardless of how many angle rows precede the prompt rows.
  const promptIndexByText = new Map((adTest.prompts ?? []).map((p, i) => [p, i]))

  // Group by angleKey for angle rows, or by prompt text for prompt rows.
  // Using adUnitIndex as the key would create one group per placement instead
  // of one group per prompt concept.
  const groups = new Map<string, typeof generations>()
  for (const gen of generations) {
    let key: string
    if (gen.angleKey) {
      key = gen.angleKey
    } else if (gen.dynamicPrompt) {
      key = `_prompt_text_${gen.dynamicPrompt}`
    } else {
      key = `_unknown_${gen._id}`
    }
    const bucket = groups.get(key) ?? []
    bucket.push(gen)
    groups.set(key, bucket)
  }

  const { plannedImageCount, completedImageCount, winnerCount, status, name, placements, angles } = adTest

  return (
    <Stack gap="lg">
      {/* ── Test header ─────────────────────────────────────────────────── */}
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
        <Group gap="sm" align="flex-start">
          <ActionIcon
            variant="subtle"
            color="gray"
            size="lg"
            mt={2}
            onClick={onBack}
            aria-label="Back to gallery"
          >
            <IconArrowLeft size={18} />
          </ActionIcon>

          <Box>
            <Group gap="xs" mb={4} align="center">
              <Title order={2} fz="xl" fw={600} c="white">{name}</Title>
              <Badge
                size="sm"
                variant="light"
                color={STATUS_COLOR[status] ?? 'gray'}
              >
                {STATUS_LABEL[status] ?? status}
              </Badge>
            </Group>

            <Group gap="xs" wrap="wrap">
              <Text size="sm" c="dark.2">
                {completedImageCount}/{plannedImageCount} generated
              </Text>

              {winnerCount > 0 && (
                <Group gap={4}>
                  <IconStarFilled size={12} color="var(--mantine-color-yellow-5)" />
                  <Text size="sm" c="yellow.4">
                    {winnerCount} winner{winnerCount !== 1 ? 's' : ''}
                  </Text>
                </Group>
              )}

              {placements.map((p) => (
                <Badge key={p} size="xs" variant="outline" color="dark.2">
                  {PLACEMENT_LABEL[p] ?? p}
                </Badge>
              ))}
            </Group>
          </Box>
        </Group>

        {/* Export — requires paid plan; wired fully in issue #38 */}
        <Tooltip
          label={hasPaidPlan ? 'Export coming in a future update' : 'Upgrade to a paid plan to export'}
          withArrow
          position="left"
        >
          <Button variant="default" size="sm" disabled>
            {hasPaidPlan ? 'Export test set' : '🔒 Export test set'}
          </Button>
        </Tooltip>
      </Group>

      {/* ── Copy Bank ─────────────────────────────────────────────────────── */}
      <CopyBankPanel adTestId={adTestId} />

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {groups.size === 0 && (
        <Paper
          p="xl"
          radius="lg"
          withBorder
          style={{ borderColor: 'var(--mantine-color-dark-5)' }}
          ta="center"
        >
          <Text size="sm" c="dark.3">
            No generations yet. Start generation from the test settings.
          </Text>
        </Paper>
      )}

      {/* ── Angle / prompt groups ─────────────────────────────────────────── */}
      {[...groups.entries()].map(([groupKey, groupGens]) => {
        const isPromptGroup = groupKey.startsWith('_prompt_text_')
        const angle = angles.find((a) => a.key === groupKey)
        let groupLabel: string
        if (isPromptGroup) {
          const promptText = groupKey.slice('_prompt_text_'.length)
          const idx = promptIndexByText.get(promptText)
          groupLabel = `Prompt ${idx !== undefined ? idx + 1 : '?'}`
        } else {
          groupLabel = angle?.title ?? groupKey
        }
        const groupDesc = angle?.description

        const groupCompleted = groupGens.filter((g) => g.status === 'complete').length
        const groupWinners = groupGens.filter((g) => g.isWinner).length

        return (
          <Paper
            key={groupKey}
            p="lg"
            radius="lg"
            withBorder
            style={{ borderColor: 'var(--mantine-color-dark-5)' }}
          >
            {/* Group label row */}
            <Group gap="sm" mb="md" align="flex-start">
              <Box style={{ flex: 1 }}>
                <Group gap="xs" mb={2}>
                  <Text fw={600} c="white" size="sm">{groupLabel}</Text>
                  <Text size="xs" c="dark.3">
                    {groupCompleted}/{groupGens.length} complete
                  </Text>
                  {groupWinners > 0 && (
                    <Group gap={4}>
                      <IconStarFilled size={11} color="var(--mantine-color-yellow-5)" />
                      <Text size="xs" c="yellow.4">{groupWinners}</Text>
                    </Group>
                  )}
                </Group>
                {groupDesc && (
                  <Text size="xs" c="dark.3" lineClamp={1}>{groupDesc}</Text>
                )}
              </Box>
            </Group>

            {/* Card row — one card per placement */}
            <Box
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--mantine-spacing-md)',
              }}
            >
              {groupGens.map((gen) => (
                <Box key={gen._id} style={{ width: 160 }}>
                  <AdTestGenerationCard
                    gen={gen}
                    copySets={copySets ?? []}
                    onToggleWinner={() =>
                      toggleWinner(
                        { generationId: gen._id },
                        {
                          onError: () =>
                            notifications.show({
                              title: 'Error',
                              message: 'Could not update winner',
                              color: 'red',
                            }),
                        },
                      )
                    }
                    onExpand={() => onOpenAd(gen._id)}
                  />
                </Box>
              ))}
            </Box>
          </Paper>
        )
      })}
    </Stack>
  )
}

// ─── Individual card ──────────────────────────────────────────────────────────

type GenRow = {
  _id: Id<'templateGenerations'>
  status: string
  outputUrl?: string
  placement?: string
  aspectRatio?: string
  isWinner?: boolean
  currentStep?: string
  adTestId?: Id<'adTests'>
  selectedCopySetId?: Id<'adTestCopySets'>
  selectedHeadlineIndex?: number
  selectedPrimaryTextIndex?: number
  selectedDescriptionIndex?: number
}

type CopySet = {
  _id: Id<'adTestCopySets'>
  headlines: { text: string; variantIndex: number }[]
  primaryTexts: { text: string; variantIndex: number }[]
  descriptions: { text: string; variantIndex: number }[]
}

function AdTestGenerationCard({
  gen,
  copySets,
  onToggleWinner,
  onExpand,
}: {
  gen: GenRow
  copySets: CopySet[]
  onToggleWinner: () => void
  onExpand: () => void
}) {
  const isComplete = gen.status === 'complete' && !!gen.outputUrl
  const isFailed = gen.status === 'failed'
  const isPending = !isComplete && !isFailed

  const arValue = gen.aspectRatio ? (ASPECT_RATIO_VALUE[gen.aspectRatio] ?? 1) : 1
  const placementLabel = gen.placement ? (PLACEMENT_LABEL[gen.placement] ?? gen.placement) : null

  return (
    <Stack gap={6}>
      <Box
        pos="relative"
        style={{
          borderRadius: 'var(--mantine-radius-sm)',
          overflow: 'hidden',
          backgroundColor: 'var(--mantine-color-dark-7)',
          boxShadow: gen.isWinner
            ? 'inset 0 0 0 2px var(--mantine-color-yellow-5)'
            : undefined,
        }}
      >
        <AspectRatio ratio={arValue}>
          {isComplete && gen.outputUrl ? (
            <Image
              src={gen.outputUrl}
              alt={placementLabel ?? 'Ad creative'}
              style={{ objectFit: 'cover', width: '100%', height: '100%' }}
            />
          ) : isPending ? (
            <Box
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <Loader size="xs" color="blue" />
              <Text size="xs" c="dark.3">{gen.currentStep ?? 'Generating…'}</Text>
            </Box>
          ) : (
            <Box
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text size="xs" c="red.4">Failed</Text>
            </Box>
          )}
        </AspectRatio>

        {/* Overlay actions — only shown when complete */}
        {isComplete && (
          <Group
            pos="absolute"
            bottom={4}
            right={4}
            gap={4}
            style={{ zIndex: 1 }}
          >
            <Tooltip label="View details" position="top" withArrow>
              <ActionIcon
                size="sm"
                variant="filled"
                color="dark"
                radius="sm"
                style={{ opacity: 0.85 }}
                onClick={onExpand}
                aria-label="View details"
              >
                <IconMaximize size={12} />
              </ActionIcon>
            </Tooltip>
            <Tooltip
              label={gen.isWinner ? 'Unmark winner' : 'Mark as winner'}
              position="top"
              withArrow
            >
              <ActionIcon
                size="sm"
                variant="filled"
                color={gen.isWinner ? 'yellow' : 'dark'}
                radius="sm"
                style={{ opacity: 0.85 }}
                onClick={onToggleWinner}
                aria-label={gen.isWinner ? 'Unmark winner' : 'Mark as winner'}
              >
                {gen.isWinner ? <IconStarFilled size={12} /> : <IconStar size={12} />}
              </ActionIcon>
            </Tooltip>
          </Group>
        )}
      </Box>

      {placementLabel && (
        <Text size="xs" c="dark.3" ta="center">{placementLabel}</Text>
      )}

      {/* Optional copy pairing — only meaningful once a creative is complete
          and the test has at least one Copy Bank set to pair from. */}
      {isComplete && copySets.length > 0 && (
        <CopyPairingControl gen={gen} copySets={copySets} />
      )}
    </Stack>
  )
}

// ─── Copy pairing control ──────────────────────────────────────────────────────

/** Truncates suggestion text so it fits a Select option label. */
function truncate(text: string, max = 48): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function suggestionOptions(
  suggestions: { text: string; variantIndex: number }[],
): { value: string; label: string }[] {
  return suggestions.map((s) => ({
    value: String(s.variantIndex),
    label: truncate(s.text),
  }))
}

/** Compact summary of a copy set's field counts, e.g. "5H · 3P". */
function copySetSummary(set: CopySet): string {
  const parts: string[] = []
  if (set.headlines.length) parts.push(`${set.headlines.length}H`)
  if (set.primaryTexts.length) parts.push(`${set.primaryTexts.length}P`)
  if (set.descriptions.length) parts.push(`${set.descriptions.length}D`)
  return parts.join(' · ') || 'Copy set'
}

function CopyPairingControl({
  gen,
  copySets,
}: {
  gen: GenRow
  copySets: CopySet[]
}) {
  const pairMutation = useConvexMutation(api.adTests.pairCopyWithGeneration)
  const { mutate: pair } = useMutation({
    mutationFn: pairMutation,
    onError: () =>
      notifications.show({
        title: 'Error',
        message: 'Could not update copy pairing',
        color: 'red',
      }),
  })

  const selectedSet = copySets.find((s) => s._id === gen.selectedCopySetId)
  const isPaired = !!selectedSet

  const toIndex = (v: string | null): number | undefined =>
    v === null ? undefined : Number(v)

  // Re-pair with the full current selection, overriding one field at a time so
  // the server always receives a complete, consistent pairing.
  const applyIndex = (
    field: 'headlineIndex' | 'primaryTextIndex' | 'descriptionIndex',
    value: string | null,
  ) => {
    if (!gen.selectedCopySetId) return
    pair({
      generationId: gen._id,
      copySetId: gen.selectedCopySetId,
      headlineIndex: gen.selectedHeadlineIndex,
      primaryTextIndex: gen.selectedPrimaryTextIndex,
      descriptionIndex: gen.selectedDescriptionIndex,
      [field]: toIndex(value),
    })
  }

  return (
    <Popover width={240} position="bottom" withArrow shadow="md">
      <Popover.Target>
        <Button
          variant={isPaired ? 'light' : 'subtle'}
          color={isPaired ? 'blue' : 'gray'}
          size="compact-xs"
          fullWidth
          leftSection={<IconLink size={12} />}
        >
          {isPaired ? 'Copy paired' : 'Pair copy'}
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <Select
            size="xs"
            label="Copy set"
            placeholder="None"
            clearable
            value={gen.selectedCopySetId ?? null}
            data={copySets.map((s) => ({
              value: s._id,
              label: copySetSummary(s),
            }))}
            onChange={(val) =>
              // Switching/clearing the set resets per-field selections.
              pair(
                val
                  ? { generationId: gen._id, copySetId: val as Id<'adTestCopySets'> }
                  : { generationId: gen._id },
              )
            }
          />

          {selectedSet && selectedSet.headlines.length > 0 && (
            <Select
              size="xs"
              label="Headline"
              placeholder="None"
              clearable
              value={
                gen.selectedHeadlineIndex !== undefined
                  ? String(gen.selectedHeadlineIndex)
                  : null
              }
              data={suggestionOptions(selectedSet.headlines)}
              onChange={(val) => applyIndex('headlineIndex', val)}
            />
          )}

          {selectedSet && selectedSet.primaryTexts.length > 0 && (
            <Select
              size="xs"
              label="Primary text"
              placeholder="None"
              clearable
              value={
                gen.selectedPrimaryTextIndex !== undefined
                  ? String(gen.selectedPrimaryTextIndex)
                  : null
              }
              data={suggestionOptions(selectedSet.primaryTexts)}
              onChange={(val) => applyIndex('primaryTextIndex', val)}
            />
          )}

          {selectedSet && selectedSet.descriptions.length > 0 && (
            <Select
              size="xs"
              label="Description"
              placeholder="None"
              clearable
              value={
                gen.selectedDescriptionIndex !== undefined
                  ? String(gen.selectedDescriptionIndex)
                  : null
              }
              data={suggestionOptions(selectedSet.descriptions)}
              onChange={(val) => applyIndex('descriptionIndex', val)}
            />
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}
