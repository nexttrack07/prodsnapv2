/**
 * Test-level Copy Bank panel (issue #37) — rendered inside the Ad Test review
 * screen. The buyer picks which fields they want (headlines / primary texts /
 * descriptions) and how many of each, generates a set, then edits, copies,
 * deletes, or sets a platform CTA button. Copy is generated at the Ad Test
 * level (stored in adTestCopySets), never auto-attached per image.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { convexQuery, useConvexMutation } from '@convex-dev/react-query'
import { useAction } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { META_CTA_BUTTONS } from '../../../convex/lib/adTestValidators'
import {
  Badge,
  Box,
  Button,
  CopyButton,
  Group,
  NumberInput,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  ActionIcon,
  Tooltip,
  Loader,
} from '@mantine/core'
import {
  IconCheck,
  IconCopy,
  IconPencil,
  IconTrash,
  IconSparkles,
  IconX,
} from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'

type CopySet = Doc<'adTestCopySets'>
type CopyField = 'headlines' | 'primaryTexts' | 'descriptions'

const FIELD_LABEL: Record<CopyField, string> = {
  headlines: 'Headlines',
  primaryTexts: 'Primary texts',
  descriptions: 'Descriptions',
}

const CTA_OPTIONS = META_CTA_BUTTONS.map((value) => ({
  value,
  label: value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
}))

// ─── Main panel ────────────────────────────────────────────────────────────────

export function CopyBankPanel({ adTestId }: { adTestId: Id<'adTests'> }) {
  const { data: copySets, isLoading } = useQuery(
    convexQuery(api.adTests.listCopySets, { adTestId }),
  )

  // Request controls — sensible defaults so a first-time buyer can just hit go.
  const [includeHeadlines, setIncludeHeadlines] = useState(true)
  const [headlineCount, setHeadlineCount] = useState(5)
  const [includePrimaryTexts, setIncludePrimaryTexts] = useState(true)
  const [primaryTextCount, setPrimaryTextCount] = useState(3)
  const [includeDescriptions, setIncludeDescriptions] = useState(false)
  const [descriptionCount, setDescriptionCount] = useState(2)
  const [generating, setGenerating] = useState(false)

  const generateCopySet = useAction(api.adTests.generateCopySet)

  const nothingSelected =
    !includeHeadlines && !includePrimaryTexts && !includeDescriptions
  const totalRequested =
    (includeHeadlines ? headlineCount : 0) +
    (includePrimaryTexts ? primaryTextCount : 0) +
    (includeDescriptions ? descriptionCount : 0)

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      await generateCopySet({
        adTestId,
        request: {
          includeHeadlines,
          headlineCount,
          includePrimaryTexts,
          primaryTextCount,
          includeDescriptions,
          descriptionCount,
        },
      })
      notifications.show({
        title: 'Copy generated',
        message: 'New suggestions added to the Copy Bank.',
        color: 'green',
      })
    } catch (err) {
      notifications.show({
        title: 'Could not generate copy',
        message: err instanceof Error ? err.message : 'Please try again.',
        color: 'red',
      })
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Paper
      p="lg"
      radius="lg"
      withBorder
      style={{ borderColor: 'var(--mantine-color-dark-5)' }}
    >
      <Group gap="xs" mb="xs">
        <IconSparkles size={16} color="var(--mantine-color-blue-4)" />
        <Text fw={600} c="white" size="sm">Copy Bank</Text>
      </Group>
      <Text size="xs" c="dark.3" mb="md">
        Generate platform-ready copy for this test. Pick the fields and counts —
        suggestions are stored with the test, never auto-attached to an image.
      </Text>

      {/* ── Request controls ──────────────────────────────────────────────── */}
      <Stack gap="sm" mb="md">
        <FieldRow
          label="Headlines"
          include={includeHeadlines}
          onToggle={setIncludeHeadlines}
          count={headlineCount}
          onCount={setHeadlineCount}
        />
        <FieldRow
          label="Primary texts"
          include={includePrimaryTexts}
          onToggle={setIncludePrimaryTexts}
          count={primaryTextCount}
          onCount={setPrimaryTextCount}
        />
        <FieldRow
          label="Descriptions"
          include={includeDescriptions}
          onToggle={setIncludeDescriptions}
          count={descriptionCount}
          onCount={setDescriptionCount}
        />
      </Stack>

      <Button
        size="sm"
        leftSection={<IconSparkles size={15} />}
        loading={generating}
        disabled={nothingSelected || totalRequested === 0}
        onClick={handleGenerate}
      >
        {copySets && copySets.length > 0 ? 'Generate more copy' : 'Generate copy'}
      </Button>

      {/* ── Generated sets ────────────────────────────────────────────────── */}
      {isLoading ? (
        <Box py="md" ta="center">
          <Loader size="xs" color="blue" />
        </Box>
      ) : copySets && copySets.length > 0 ? (
        <Stack gap="md" mt="lg">
          {copySets.map((set) => (
            <CopySetView key={set._id} set={set} />
          ))}
        </Stack>
      ) : null}
    </Paper>
  )
}

// ─── Request field row ──────────────────────────────────────────────────────────

function FieldRow({
  label,
  include,
  onToggle,
  count,
  onCount,
}: {
  label: string
  include: boolean
  onToggle: (v: boolean) => void
  count: number
  onCount: (v: number) => void
}) {
  return (
    <Group justify="space-between" wrap="nowrap">
      <Switch
        size="sm"
        label={label}
        checked={include}
        onChange={(e) => onToggle(e.currentTarget.checked)}
        styles={{ label: { color: 'var(--mantine-color-dark-1)' } }}
      />
      <NumberInput
        size="xs"
        w={80}
        min={0}
        max={20}
        clampBehavior="strict"
        value={count}
        onChange={(v) => onCount(typeof v === 'number' ? v : 0)}
        disabled={!include}
        aria-label={`${label} count`}
      />
    </Group>
  )
}

// ─── One generated copy set ──────────────────────────────────────────────────────

function CopySetView({ set }: { set: CopySet }) {
  const deleteCopySet = useConvexMutation(api.adTests.deleteCopySet)
  const setCopySetCta = useConvexMutation(api.adTests.setCopySetCta)

  const fields: CopyField[] = ['headlines', 'primaryTexts', 'descriptions']
  const created = new Date(set.createdAt).toLocaleString()

  const handleCta = async (value: string | null) => {
    try {
      await setCopySetCta({
        copySetId: set._id,
        recommendedCtaButton: value ?? undefined,
      })
    } catch {
      notifications.show({ title: 'Error', message: 'Could not set CTA', color: 'red' })
    }
  }

  const handleDelete = async () => {
    try {
      await deleteCopySet({ copySetId: set._id })
    } catch {
      notifications.show({ title: 'Error', message: 'Could not delete', color: 'red' })
    }
  }

  return (
    <Paper
      p="md"
      radius="md"
      withBorder
      style={{ borderColor: 'var(--mantine-color-dark-6)' }}
    >
      <Group justify="space-between" mb="sm" wrap="nowrap">
        <Text size="xs" c="dark.3">{created}</Text>
        <Tooltip label="Delete set" withArrow position="left">
          <ActionIcon size="sm" variant="subtle" color="red" onClick={handleDelete} aria-label="Delete copy set">
            <IconTrash size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {fields.map((field) =>
        set[field].length > 0 ? (
          <Box key={field} mb="sm">
            <Text size="xs" fw={600} c="dark.1" mb={4} tt="uppercase">
              {FIELD_LABEL[field]}
            </Text>
            <Stack gap={4}>
              {set[field].map((s) => (
                <SuggestionRow
                  key={s.variantIndex}
                  copySetId={set._id}
                  field={field}
                  variantIndex={s.variantIndex}
                  text={s.text}
                />
              ))}
            </Stack>
          </Box>
        ) : null,
      )}

      {/* CTA — a platform button recommendation, not prose. */}
      <Group gap="xs" mt="sm" align="center">
        <Text size="xs" fw={600} c="dark.1" tt="uppercase">CTA button</Text>
        <Select
          size="xs"
          w={170}
          data={CTA_OPTIONS}
          value={set.recommendedCtaButton ?? null}
          placeholder="None"
          clearable
          onChange={handleCta}
          aria-label="CTA button"
        />
        {set.recommendedCtaButton && (
          <Badge size="sm" variant="light" color="blue">
            {set.recommendedCtaButton}
          </Badge>
        )}
      </Group>
    </Paper>
  )
}

// ─── Editable / copyable suggestion ──────────────────────────────────────────────

function SuggestionRow({
  copySetId,
  field,
  variantIndex,
  text,
}: {
  copySetId: Id<'adTestCopySets'>
  field: CopyField
  variantIndex: number
  text: string
}) {
  const updateSuggestion = useConvexMutation(api.adTests.updateCopySuggestion)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === text) {
      setEditing(false)
      setDraft(text)
      return
    }
    setSaving(true)
    try {
      await updateSuggestion({ copySetId, field, variantIndex, text: trimmed })
      setEditing(false)
    } catch (err) {
      notifications.show({
        title: 'Could not save',
        message: err instanceof Error ? err.message : 'Please try again.',
        color: 'red',
      })
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <Group gap={4} wrap="nowrap" align="center">
        <TextInput
          size="xs"
          style={{ flex: 1 }}
          value={draft}
          autoFocus
          disabled={saving}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') {
              setEditing(false)
              setDraft(text)
            }
          }}
        />
        <ActionIcon size="sm" variant="subtle" color="green" onClick={save} loading={saving} aria-label="Save">
          <IconCheck size={14} />
        </ActionIcon>
        <ActionIcon
          size="sm"
          variant="subtle"
          color="gray"
          onClick={() => {
            setEditing(false)
            setDraft(text)
          }}
          aria-label="Cancel"
        >
          <IconX size={14} />
        </ActionIcon>
      </Group>
    )
  }

  return (
    <Group
      gap={4}
      wrap="nowrap"
      align="flex-start"
      style={{
        padding: '4px 8px',
        borderRadius: 'var(--mantine-radius-sm)',
        backgroundColor: 'var(--mantine-color-dark-6)',
      }}
    >
      <Text size="xs" c="dark.0" style={{ flex: 1, whiteSpace: 'pre-wrap' }}>
        {text}
      </Text>
      <CopyButton value={text}>
        {({ copied, copy }) => (
          <Tooltip label={copied ? 'Copied' : 'Copy'} withArrow position="top">
            <ActionIcon size="sm" variant="subtle" color={copied ? 'green' : 'gray'} onClick={copy} aria-label="Copy">
              {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
      <Tooltip label="Edit" withArrow position="top">
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => setEditing(true)} aria-label="Edit">
          <IconPencil size={13} />
        </ActionIcon>
      </Tooltip>
    </Group>
  )
}
