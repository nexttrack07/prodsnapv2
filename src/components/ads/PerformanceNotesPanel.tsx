/**
 * PerformanceNotesPanel (issue #40) — test-level performance notes in the Ad
 * Test review. Media buyers log lightweight results (CPA/CTR/ROAS, platform,
 * free-form observations) that persist in `adTestPerformanceNotes` and stay
 * visible as the test's history / context for future recommendations.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { convexQuery, useConvexMutation } from '@convex-dev/react-query'
import { useMutation } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import {
  Badge,
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
import { IconChartBar, IconNote } from '@tabler/icons-react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'

const PLATFORM_OPTIONS = [
  { value: 'meta', label: 'Meta' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'google', label: 'Google' },
  { value: 'other', label: 'Other' },
]

const PLATFORM_LABEL: Record<string, string> = {
  meta: 'Meta',
  tiktok: 'TikTok',
  google: 'Google',
  other: 'Other',
}

export function PerformanceNotesPanel({ adTestId }: { adTestId: Id<'adTests'> }) {
  const { data: notes } = useQuery(
    convexQuery(api.adTests.listPerformanceNotes, { adTestId }),
  )
  const saveNote = useConvexMutation(api.adTests.savePerformanceNote)
  const { mutateAsync: save, isPending: saving } = useMutation({
    mutationFn: saveNote,
  })

  const [open, setOpen] = useState(false)
  const [platform, setPlatform] = useState<string | null>('meta')
  const [metricName, setMetricName] = useState('')
  const [metricValue, setMetricValue] = useState('')
  const [note, setNote] = useState('')

  const canSave =
    metricName.trim().length > 0 ||
    metricValue.trim().length > 0 ||
    note.trim().length > 0

  const handleSave = async () => {
    if (!canSave) return
    try {
      await save({
        adTestId,
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
      setMetricName('')
      setMetricValue('')
      setNote('')
      setOpen(false)
      notifications.show({
        title: 'Note saved',
        message: 'Performance note added.',
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

  const hasNotes = !!notes && notes.length > 0

  return (
    <Paper
      p="lg"
      radius="lg"
      withBorder
      style={{ borderColor: 'var(--mantine-color-dark-5)' }}
    >
      <Group justify="space-between" align="center" mb="xs">
        <Group gap="xs">
          <IconChartBar size={16} color="var(--mantine-color-blue-4)" />
          <Text fw={600} c="white" size="sm">
            Performance notes
          </Text>
        </Group>
        <Button
          size="compact-xs"
          variant="subtle"
          color="gray"
          leftSection={<IconNote size={13} />}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Cancel' : 'Add note'}
        </Button>
      </Group>

      <Collapse expanded={open}>
        <Stack gap="xs" mb={hasNotes ? 'md' : 0}>
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

      {hasNotes ? (
        <Stack gap={6} mt={open ? 0 : 'xs'}>
          {notes.map((n) => (
            <Box
              key={n._id}
              style={{
                padding: '6px 10px',
                borderRadius: 'var(--mantine-radius-sm)',
                backgroundColor: 'var(--mantine-color-dark-6)',
              }}
            >
              <Group gap={6} align="center" mb={n.note ? 2 : 0} wrap="wrap">
                {n.platform && (
                  <Badge size="xs" variant="light" color="blue">
                    {PLATFORM_LABEL[n.platform] ?? n.platform}
                  </Badge>
                )}
                {(n.metricName || n.metricValue) && (
                  <Text size="xs" c="dark.0" fw={600}>
                    {n.metricName}
                    {n.metricName && n.metricValue ? ': ' : ''}
                    {n.metricValue}
                  </Text>
                )}
              </Group>
              {n.note && (
                <Text size="xs" c="dark.1">
                  {n.note}
                </Text>
              )}
            </Box>
          ))}
        </Stack>
      ) : (
        !open && (
          <Text size="xs" c="dark.3">
            No notes yet. Log CPA, CTR, ROAS, or observations after the test runs.
          </Text>
        )
      )}
    </Paper>
  )
}
