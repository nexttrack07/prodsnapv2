/**
 * WinnerNudge (issue #40) — the winner loop's call to action.
 *
 * Shown once a creative is marked a winner. It turns a win into the next unit
 * of work: create the next Ad Test from this winner, generate variations, try a
 * new angle, or log a lightweight performance note. Rendered inline (not a
 * transient toast) so the user can actually act on it — in the ad detail panel
 * and on the Ad Test review cards.
 */
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useConvexMutation } from '@convex-dev/react-query'
import { useNavigate } from '@tanstack/react-router'
import { notifications } from '@mantine/notifications'
import {
  Box,
  Button,
  Collapse,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core'
import {
  IconArrowRight,
  IconNote,
  IconStarFilled,
  IconTarget,
  IconWand,
} from '@tabler/icons-react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'

export type WinnerNudgeAd = {
  _id: Id<'templateGenerations'>
  productId?: Id<'products'> | null
  adTestId?: Id<'adTests'> | null
}

const PLATFORM_OPTIONS = [
  { value: 'meta', label: 'Meta' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'google', label: 'Google' },
  { value: 'other', label: 'Other' },
]

export function WinnerNudge({
  ad,
  variant = 'panel',
}: {
  ad: WinnerNudgeAd
  /** `panel` = full nudge (detail panel); `compact` = single "next test" button (cards). */
  variant?: 'panel' | 'compact'
}) {
  const navigate = useNavigate()
  const createNext = useConvexMutation(api.adTests.createNextAdTestFromWinner)
  const { mutateAsync: createNextTest, isPending: creating } = useMutation({
    mutationFn: createNext,
  })

  const goToNextTest = async () => {
    if (!ad.productId) return
    try {
      const adTestId = await createNextTest({ generationId: ad._id })
      navigate({
        to: '/studio/$productId',
        params: { productId: ad.productId },
        search: { adTestId },
      })
    } catch (err) {
      notifications.show({
        title: 'Could not create next test',
        message: err instanceof Error ? err.message : 'Please try again.',
        color: 'red',
      })
    }
  }

  if (variant === 'compact') {
    return (
      <Button
        size="compact-xs"
        variant="light"
        color="yellow"
        loading={creating}
        disabled={!ad.productId}
        leftSection={<IconArrowRight size={12} />}
        onClick={goToNextTest}
      >
        Next test
      </Button>
    )
  }

  return (
    <Paper
      radius="md"
      withBorder
      p="md"
      style={{
        borderColor: 'var(--mantine-color-yellow-9)',
        backgroundColor: 'var(--mantine-color-dark-6)',
        backgroundImage:
          'radial-gradient(circle at top left, rgba(250, 204, 21, 0.10), transparent 60%)',
      }}
    >
      <Group gap={6} mb="xs">
        <IconStarFilled size={14} color="var(--mantine-color-yellow-5)" />
        <Text size="sm" fw={600} c="white">
          Winner! What's next?
        </Text>
      </Group>

      <Stack gap="xs">
        <Button
          size="xs"
          color="brand"
          fullWidth
          justify="space-between"
          loading={creating}
          disabled={!ad.productId}
          leftSection={<IconArrowRight size={14} />}
          onClick={goToNextTest}
        >
          Create next Ad Test from this winner
        </Button>
        <Group grow gap="xs">
          <Button
            size="xs"
            variant="default"
            leftSection={<IconWand size={14} />}
            disabled={!ad.productId}
            onClick={() =>
              ad.productId &&
              navigate({
                to: '/studio/$productId',
                params: { productId: ad.productId },
                search: { editAd: ad._id },
              })
            }
          >
            Variations
          </Button>
          <Button
            size="xs"
            variant="default"
            leftSection={<IconTarget size={14} />}
            disabled={!ad.productId}
            onClick={() =>
              ad.productId &&
              navigate({
                to: '/studio/$productId/strategy',
                params: { productId: ad.productId },
              })
            }
          >
            New angle
          </Button>
        </Group>

        {ad.adTestId && (
          <PerformanceNoteForm adTestId={ad.adTestId} generationId={ad._id} />
        )}
      </Stack>
    </Paper>
  )
}

// ─── Inline performance note form ───────────────────────────────────────────────

function PerformanceNoteForm({
  adTestId,
  generationId,
}: {
  adTestId: Id<'adTests'>
  generationId?: Id<'templateGenerations'>
}) {
  const saveNote = useConvexMutation(api.adTests.savePerformanceNote)
  const { mutateAsync: save, isPending: saving } = useMutation({
    mutationFn: saveNote,
  })

  const [open, setOpen] = useState(false)
  const [platform, setPlatform] = useState<string | null>('meta')
  const [metricName, setMetricName] = useState('')
  const [metricValue, setMetricValue] = useState('')
  const [note, setNote] = useState('')

  const reset = () => {
    setMetricName('')
    setMetricValue('')
    setNote('')
  }

  const canSave =
    metricName.trim().length > 0 ||
    metricValue.trim().length > 0 ||
    note.trim().length > 0

  const handleSave = async () => {
    if (!canSave) return
    try {
      await save({
        adTestId,
        generationId,
        platform: (platform ?? undefined) as
          | 'meta'
          | 'tiktok'
          | 'google'
          | 'other'
          | undefined,
        metricName: metricName.trim() || undefined,
        metricValue: metricValue.trim() || undefined,
        note: note.trim() || undefined,
      })
      reset()
      setOpen(false)
      notifications.show({
        title: 'Note saved',
        message: 'Performance note added to this test.',
        color: 'green',
      })
    } catch (err) {
      notifications.show({
        title: 'Could not save note',
        message: err instanceof Error ? err.message : 'Please try again.',
        color: 'red',
      })
    }
  }

  return (
    <Box>
      <Button
        size="xs"
        variant="subtle"
        color="gray"
        leftSection={<IconNote size={14} />}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? 'Hide note' : 'Add performance note'}
      </Button>
      <Collapse expanded={open}>
        <Stack gap="xs" mt="xs">
          <Group grow gap="xs">
            <Select
              size="xs"
              label="Platform"
              data={PLATFORM_OPTIONS}
              value={platform}
              onChange={setPlatform}
              allowDeselect={false}
            />
            <TextInput
              size="xs"
              label="Metric"
              placeholder="ROAS"
              value={metricName}
              onChange={(e) => setMetricName(e.currentTarget.value)}
            />
            <TextInput
              size="xs"
              label="Value"
              placeholder="2.4"
              value={metricValue}
              onChange={(e) => setMetricValue(e.currentTarget.value)}
            />
          </Group>
          <Textarea
            size="xs"
            label="Note"
            placeholder="Why it won, audience, what to try next…"
            autosize
            minRows={2}
            value={note}
            onChange={(e) => setNote(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button
              size="xs"
              color="brand"
              loading={saving}
              disabled={!canSave}
              onClick={handleSave}
            >
              Save note
            </Button>
          </Group>
        </Stack>
      </Collapse>
    </Box>
  )
}
