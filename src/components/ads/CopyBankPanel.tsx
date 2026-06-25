/**
 * Product-level Copy Bank.
 *
 * Layout is two distinct surfaces:
 *   1. A split-out "Generate ad copy" control card — pick which fields you want
 *      (headlines / primary texts / descriptions) and how many of each.
 *   2. The generated copy, grouped by set, with every individual piece rendered
 *      as its own card (copy / edit inline / delete) plus a per-set CTA button.
 *
 * Copy is generated at the PRODUCT level (stored in copySets), never
 * auto-attached per image — the buyer pairs a piece with a creative later in the
 * ad detail panel.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { convexQuery, useConvexMutation } from '@convex-dev/react-query'
import { useAction } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { META_CTA_BUTTONS } from '../../../convex/lib/adTestValidators'
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Center,
  CopyButton,
  Divider,
  Group,
  Loader,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import {
  IconCheck,
  IconCopy,
  IconPencil,
  IconSparkles,
  IconTrash,
} from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'

type CopySet = Doc<'copySets'>
type CopyField = 'headlines' | 'primaryTexts' | 'descriptions'

const FIELDS: {
  key: CopyField
  label: string
  hint: string
  cols: Record<string, number>
}[] = [
  {
    key: 'headlines',
    label: 'Headlines',
    hint: 'Short, punchy — the hook',
    cols: { base: 1, xs: 2, lg: 3 },
  },
  {
    key: 'primaryTexts',
    label: 'Primary texts',
    hint: 'The main body above the image',
    cols: { base: 1, lg: 2 },
  },
  {
    key: 'descriptions',
    label: 'Descriptions',
    hint: 'The link description under the headline',
    cols: { base: 1, lg: 2 },
  },
]

const CTA_OPTIONS = META_CTA_BUTTONS.map((value) => ({
  value,
  label: value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase()),
}))

const BORDER = '1px solid var(--border, #e6e8eb)'

function relativeTime(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

// ─── Main panel ──────────────────────────────────────────────────────────────

export function CopyBankPanel({ productId }: { productId: Id<'products'> }) {
  const { data: copySets, isLoading } = useQuery(
    convexQuery(api.copyBank.listCopySets, { productId }),
  )
  const hasSets = !!copySets && copySets.length > 0

  return (
    <Stack gap="lg">
      <GenerateCopyCard productId={productId} hasSets={hasSets} />

      {isLoading ? (
        <Center py="xl">
          <Loader size="sm" color="gray" />
        </Center>
      ) : hasSets ? (
        <Stack gap={40}>
          {copySets!.map((set) => (
            <CopySetGroup key={set._id} set={set} />
          ))}
        </Stack>
      ) : (
        <EmptyCopyState />
      )}
    </Stack>
  )
}

// ─── Generate control card (split out) ───────────────────────────────────────

function GenerateCopyCard({
  productId,
  hasSets,
}: {
  productId: Id<'products'>
  hasSets: boolean
}) {
  const [includeHeadlines, setIncludeHeadlines] = useState(true)
  const [headlineCount, setHeadlineCount] = useState(5)
  const [includePrimaryTexts, setIncludePrimaryTexts] = useState(true)
  const [primaryTextCount, setPrimaryTextCount] = useState(3)
  const [includeDescriptions, setIncludeDescriptions] = useState(false)
  const [descriptionCount, setDescriptionCount] = useState(2)
  const [generating, setGenerating] = useState(false)

  const generateCopySet = useAction(api.copyBank.generateCopySet)

  const totalRequested =
    (includeHeadlines ? headlineCount : 0) +
    (includePrimaryTexts ? primaryTextCount : 0) +
    (includeDescriptions ? descriptionCount : 0)
  const nothingSelected = totalRequested === 0

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      await generateCopySet({
        productId,
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
        message: 'New suggestions added to your Copy Bank.',
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

  const controls: Array<{
    field: (typeof FIELDS)[number]
    include: boolean
    onToggle: (v: boolean) => void
    count: number
    onCount: (v: number) => void
  }> = [
    {
      field: FIELDS[0],
      include: includeHeadlines,
      onToggle: setIncludeHeadlines,
      count: headlineCount,
      onCount: setHeadlineCount,
    },
    {
      field: FIELDS[1],
      include: includePrimaryTexts,
      onToggle: setIncludePrimaryTexts,
      count: primaryTextCount,
      onCount: setPrimaryTextCount,
    },
    {
      field: FIELDS[2],
      include: includeDescriptions,
      onToggle: setIncludeDescriptions,
      count: descriptionCount,
      onCount: setDescriptionCount,
    },
  ]

  return (
    <Paper
      p="lg"
      radius="md"
      style={{
        background: 'var(--surface, #ffffff)',
        border: BORDER,
        boxShadow: 'var(--mantine-shadow-xs)',
      }}
    >
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <ThemeIcon size={36} radius="md" variant="light" color="brand">
          <IconSparkles size={18} />
        </ThemeIcon>
        <Box>
          <Text fw={700} size="md" c="dark.0">
            Generate ad copy
          </Text>
          <Text size="xs" c="dark.3">
            Platform-ready copy for this product — pick the fields and how many
            of each.
          </Text>
        </Box>
      </Group>

      <Box
        mt="md"
        px="md"
        style={{
          background: 'var(--surface-muted, #f7f8fa)',
          border: BORDER,
          borderRadius: 4,
        }}
      >
        {controls.map(({ field, include, onToggle, count, onCount }, i) => (
          <Box key={field.key}>
            {i > 0 && <Divider color="gray.2" />}
            <Group justify="space-between" wrap="nowrap" gap="md" py="sm">
              <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                <Switch
                  size="sm"
                  checked={include}
                  onChange={(e) => onToggle(e.currentTarget.checked)}
                  aria-label={field.label}
                />
                <Box
                  style={{
                    opacity: include ? 1 : 0.5,
                    transition: 'opacity 120ms',
                    minWidth: 0,
                  }}
                >
                  <Text fw={600} size="sm" c="dark.0">
                    {field.label}
                  </Text>
                  <Text size="xs" c="dark.3">
                    {field.hint}
                  </Text>
                </Box>
              </Group>
              <NumberInput
                size="sm"
                w={76}
                min={1}
                max={20}
                clampBehavior="strict"
                value={count}
                onChange={(v) => onCount(typeof v === 'number' ? v : 1)}
                disabled={!include}
                aria-label={`${field.label} count`}
              />
            </Group>
          </Box>
        ))}
      </Box>

      <Group justify="space-between" mt="md" wrap="nowrap">
        <Text size="xs" c="dark.3">
          {nothingSelected
            ? 'Select at least one field'
            : `${totalRequested} ${totalRequested === 1 ? 'piece' : 'pieces'} this run`}
        </Text>
        <Button
          color="brand"
          leftSection={<IconSparkles size={16} />}
          loading={generating}
          disabled={nothingSelected}
          onClick={handleGenerate}
        >
          {hasSets ? 'Generate more' : 'Generate copy'}
        </Button>
      </Group>
    </Paper>
  )
}

// ─── One generated set: slim header + a grid of piece cards ───────────────────

function CopySetGroup({ set }: { set: CopySet }) {
  const deleteCopySet = useConvexMutation(api.copyBank.deleteCopySet)
  const setCopySetCta = useConvexMutation(api.copyBank.setCopySetCta)

  const total =
    set.headlines.length + set.primaryTexts.length + set.descriptions.length

  const handleCta = async (value: string | null) => {
    try {
      await setCopySetCta({
        copySetId: set._id,
        recommendedCtaButton: value ?? undefined,
      })
    } catch {
      notifications.show({
        title: 'Error',
        message: 'Could not set CTA',
        color: 'red',
      })
    }
  }

  const handleDeleteSet = async () => {
    try {
      await deleteCopySet({ copySetId: set._id })
    } catch {
      notifications.show({
        title: 'Error',
        message: 'Could not delete',
        color: 'red',
      })
    }
  }

  return (
    <Box>
      <Group justify="space-between" wrap="wrap" gap="sm" mb="md">
        <Group gap="xs" wrap="nowrap">
          <Text size="sm" fw={600} c="dark.1">
            Generated {relativeTime(set.createdAt)}
          </Text>
          <Badge size="sm" variant="light" color="gray" radius="sm">
            {total} {total === 1 ? 'piece' : 'pieces'}
          </Badge>
        </Group>
        <Group gap="xs" wrap="nowrap">
          <Select
            size="xs"
            w={184}
            placeholder="Add a CTA button"
            data={CTA_OPTIONS}
            value={set.recommendedCtaButton ?? null}
            clearable
            onChange={handleCta}
            aria-label="CTA button"
          />
          <Tooltip label="Delete this set" withArrow position="left">
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={handleDeleteSet}
              aria-label="Delete copy set"
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <Stack gap="lg">
        {FIELDS.map(({ key, label, cols }) =>
          set[key].length > 0 ? (
            <Box key={key}>
              <Text
                size="xs"
                fw={700}
                c="dark.3"
                tt="uppercase"
                mb="xs"
                style={{ letterSpacing: '0.04em' }}
              >
                {label}
              </Text>
              <SimpleGrid cols={cols} spacing="sm">
                {set[key].map((s) => (
                  <CopyPieceCard
                    key={s.variantIndex}
                    copySetId={set._id}
                    field={key}
                    variantIndex={s.variantIndex}
                    text={s.text}
                  />
                ))}
              </SimpleGrid>
            </Box>
          ) : null,
        )}
      </Stack>
    </Box>
  )
}

// ─── One copy piece — its own card with inline edit / copy / delete ───────────

function CopyPieceCard({
  copySetId,
  field,
  variantIndex,
  text,
}: {
  copySetId: Id<'copySets'>
  field: CopyField
  variantIndex: number
  text: string
}) {
  const updateSuggestion = useConvexMutation(api.copyBank.updateCopySuggestion)
  const deleteSuggestion = useConvexMutation(api.copyBank.deleteCopySuggestion)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text)
  const [saving, setSaving] = useState(false)
  const [hovered, setHovered] = useState(false)

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

  const remove = async () => {
    try {
      await deleteSuggestion({ copySetId, field, variantIndex })
    } catch {
      notifications.show({
        title: 'Error',
        message: 'Could not delete',
        color: 'red',
      })
    }
  }

  return (
    <Paper
      p="sm"
      radius="md"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'var(--surface, #ffffff)',
        border: `1px solid ${
          hovered && !editing
            ? 'var(--mantine-color-dark-4)'
            : 'var(--border, #e6e8eb)'
        }`,
        boxShadow: hovered && !editing ? 'var(--mantine-shadow-sm)' : 'none',
        transition: 'border-color 120ms, box-shadow 120ms',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {editing ? (
        <Stack gap="xs">
          <Textarea
            autosize
            minRows={2}
            maxRows={8}
            value={draft}
            autoFocus
            disabled={saving}
            onChange={(e) => setDraft(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save()
              if (e.key === 'Escape') {
                setEditing(false)
                setDraft(text)
              }
            }}
          />
          <Group gap="xs" justify="flex-end">
            <Button
              size="compact-sm"
              variant="default"
              onClick={() => {
                setEditing(false)
                setDraft(text)
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              size="compact-sm"
              color="brand"
              onClick={save}
              loading={saving}
              leftSection={<IconCheck size={14} />}
            >
              Save
            </Button>
          </Group>
        </Stack>
      ) : (
        <>
          <Text
            size="sm"
            c="dark.0"
            style={{ flex: 1, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}
          >
            {text}
          </Text>
          <Group
            gap={2}
            justify="flex-end"
            mt="xs"
            style={{
              opacity: hovered ? 1 : 0.5,
              transition: 'opacity 120ms',
            }}
          >
            <CopyButton value={text}>
              {({ copied, copy }) => (
                <Tooltip
                  label={copied ? 'Copied' : 'Copy'}
                  withArrow
                  position="top"
                >
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color={copied ? 'green' : 'gray'}
                    onClick={copy}
                    aria-label="Copy"
                  >
                    {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
            <Tooltip label="Edit" withArrow position="top">
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                onClick={() => {
                  setDraft(text)
                  setEditing(true)
                }}
                aria-label="Edit"
              >
                <IconPencil size={14} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Delete" withArrow position="top">
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                onClick={remove}
                aria-label="Delete"
              >
                <IconTrash size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </>
      )}
    </Paper>
  )
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyCopyState() {
  return (
    <Paper
      p="xl"
      radius="md"
      style={{
        background: 'var(--surface-muted, #f7f8fa)',
        border: '1px dashed var(--border, #e6e8eb)',
      }}
    >
      <Stack align="center" gap={6} py="md">
        <ThemeIcon size={40} radius="xl" variant="light" color="gray">
          <IconSparkles size={20} />
        </ThemeIcon>
        <Text fw={600} c="dark.1" size="sm">
          No copy yet
        </Text>
        <Text size="xs" c="dark.3" ta="center" maw={340}>
          Generate your first set above — headlines, primary texts and
          descriptions you can pair with any creative.
        </Text>
      </Stack>
    </Paper>
  )
}
