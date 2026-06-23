/**
 * Ad Test review — the per-test workspace shown at /studio/$productId?adTestId=
 *
 * Layout is built around the core feature: pick a creative + the copy you want
 * (each suggestion is its own card), preview the combination as a real Facebook
 * feed ad, and save that pairing. Three card grids — Creatives, Headlines,
 * Primary text — feed a sticky "ad builder" bar with a "Preview as Facebook ad"
 * action. Winners, copy generation, export, and performance notes hang off the
 * same screen.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { convexQuery, useConvexMutation } from '@convex-dev/react-query'
import { useAction } from 'convex/react'
import { useNavigate } from '@tanstack/react-router'
import {
  ActionIcon,
  AspectRatio,
  Badge,
  Box,
  Button,
  Center,
  Checkbox,
  Group,
  Image,
  Loader,
  Modal,
  NumberInput,
  Paper,
  Popover,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core'
import {
  IconArrowLeft,
  IconStar,
  IconStarFilled,
  IconMaximize,
  IconPlus,
  IconBrandFacebook,
  IconCheck,
  IconSparkles,
  IconPencil,
  IconMoodSmile,
  IconX,
} from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { downloadZipFromUrl } from '../../utils/exportAdTest'
import { FacebookAdPreview } from './FacebookAdPreview'
import { PerformanceNotesPanel } from './PerformanceNotesPanel'

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

// A copy card's identity: which set it came from + its stable variant index.
type CopyPick = { setId: Id<'adTestCopySets'>; index: number; text: string }

type CopyRequest = {
  includeHeadlines: boolean
  headlineCount: number
  includePrimaryTexts: boolean
  primaryTextCount: number
  includeDescriptions: boolean
  descriptionCount: number
}

export function AdTestReviewView({
  adTestId,
  productName,
  hasPaidPlan,
  onBack,
  onGenerate,
  onOpenAd,
}: {
  adTestId: Id<'adTests'>
  productName: string
  /** When false, the export button shows an upgrade prompt instead of being simply disabled. */
  hasPaidPlan: boolean
  onBack: () => void
  /** Open the generate wizard scoped to this test (creatives attach to it). */
  onGenerate: () => void
  onOpenAd: (id: Id<'templateGenerations'>) => void
}) {
  const { data, isLoading } = useQuery(
    convexQuery(api.adTests.getById, { adTestId }),
  )
  const { data: copySets } = useQuery(
    convexQuery(api.adTests.listCopySets, { adTestId }),
  )

  const toggleWinnerMutation = useConvexMutation(api.templateGenerations.toggleWinner)
  const { mutate: toggleWinner } = useMutation({ mutationFn: toggleWinnerMutation })
  const pairMutation = useConvexMutation(api.adTests.pairCopyWithGeneration)
  const { mutateAsync: pairCopy } = useMutation({ mutationFn: pairMutation })
  const updateCopyMutation = useConvexMutation(api.adTests.updateCopySuggestion)
  const { mutateAsync: updateCopy } = useMutation({ mutationFn: updateCopyMutation })
  const renameMutation = useConvexMutation(api.adTests.renameAdTest)
  const { mutateAsync: renameAdTest } = useMutation({ mutationFn: renameMutation })

  const navigate = useNavigate()
  const exportTestSet = useAction(api.adTestExport.exportTestSet)
  const generateCopySet = useAction(api.adTests.generateCopySet)
  const [exporting, setExporting] = useState(false)
  const [generatingCopy, setGeneratingCopy] = useState(false)

  // ── Ad-builder selection state ───────────────────────────────────────────
  const [selectedCreativeId, setSelectedCreativeId] =
    useState<Id<'templateGenerations'> | null>(null)
  const [selectedHeadline, setSelectedHeadline] = useState<CopyPick | null>(null)
  const [selectedPrimary, setSelectedPrimary] = useState<CopyPick | null>(null)
  const [selectedDescription, setSelectedDescription] = useState<CopyPick | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Flatten every copy set's suggestions into individual cards.
  const headlineCards = useMemo<CopyPick[]>(
    () =>
      (copySets ?? []).flatMap((s) =>
        s.headlines.map((h) => ({ setId: s._id, index: h.variantIndex, text: h.text })),
      ),
    [copySets],
  )
  const primaryCards = useMemo<CopyPick[]>(
    () =>
      (copySets ?? []).flatMap((s) =>
        s.primaryTexts.map((p) => ({ setId: s._id, index: p.variantIndex, text: p.text })),
      ),
    [copySets],
  )
  const descriptionCards = useMemo<CopyPick[]>(
    () =>
      (copySets ?? []).flatMap((s) =>
        s.descriptions.map((d) => ({ setId: s._id, index: d.variantIndex, text: d.text })),
      ),
    [copySets],
  )

  const handleExport = async () => {
    if (!hasPaidPlan) {
      navigate({ to: '/pricing' })
      return
    }
    setExporting(true)
    try {
      const { url, filename, imageCount } = await exportTestSet({ adTestId })
      await downloadZipFromUrl(url, filename)
      notifications.show({
        title: 'Export ready',
        message: `Test set exported (${imageCount} image${imageCount !== 1 ? 's' : ''}).`,
        color: 'green',
      })
    } catch (err) {
      notifications.show({
        title: 'Export failed',
        message: err instanceof Error ? err.message : 'Please try again.',
        color: 'red',
      })
    } finally {
      setExporting(false)
    }
  }

  const handleGenerateCopy = async (req: CopyRequest, emoji: boolean) => {
    setGeneratingCopy(true)
    try {
      await generateCopySet({ adTestId, request: req, emoji })
      notifications.show({ color: 'green', message: 'Copy generated.' })
    } catch (err) {
      notifications.show({
        color: 'red',
        message: err instanceof Error ? err.message : 'Could not generate copy.',
      })
    } finally {
      setGeneratingCopy(false)
    }
  }

  if (isLoading) {
    return (
      <Center mih="50vh">
        <Loader color="brand" />
      </Center>
    )
  }
  if (!data) {
    return (
      <Box py={60} ta="center">
        <Text size="sm" c="dark.3">Ad Test not found.</Text>
        <Button variant="subtle" size="xs" mt="md" onClick={onBack}>
          Back
        </Button>
      </Box>
    )
  }

  const { adTest, generations } = data
  const { plannedImageCount, completedImageCount, winnerCount, status, name } = adTest

  const selectedCreative =
    generations.find((g) => g._id === selectedCreativeId) ?? null

  // Resolve the CTA from whichever copy set the chosen copy belongs to.
  const chosenSetId =
    selectedHeadline?.setId ?? selectedPrimary?.setId ?? selectedDescription?.setId ?? undefined
  const chosenSet = (copySets ?? []).find((s) => s._id === chosenSetId)
  const cta = chosenSet?.recommendedCtaButton

  const canPreview = !!selectedCreative

  const handleSavePairing = async () => {
    if (!selectedCreative) return
    const setId =
      selectedHeadline?.setId ?? selectedPrimary?.setId ?? selectedDescription?.setId
    setSaving(true)
    try {
      await pairCopy({
        generationId: selectedCreative._id,
        copySetId: setId,
        headlineIndex:
          selectedHeadline && selectedHeadline.setId === setId
            ? selectedHeadline.index
            : undefined,
        primaryTextIndex:
          selectedPrimary && selectedPrimary.setId === setId
            ? selectedPrimary.index
            : undefined,
        descriptionIndex:
          selectedDescription && selectedDescription.setId === setId
            ? selectedDescription.index
            : undefined,
      })
      notifications.show({ color: 'green', message: 'Ad saved — creative paired with copy.' })
      setPreviewOpen(false)
    } catch (err) {
      notifications.show({
        color: 'red',
        message: err instanceof Error ? err.message : 'Could not save pairing.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Stack gap="xl">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
        <Group gap="sm" align="flex-start">
          <ActionIcon variant="subtle" color="gray" size="lg" mt={2} onClick={onBack} aria-label="Back">
            <IconArrowLeft size={18} />
          </ActionIcon>
          <Box>
            <Group gap="xs" mb={4} align="center">
              <EditableTitle
                value={name}
                onSave={(n) => renameAdTest({ adTestId, name: n })}
              />
              <Badge size="sm" variant="light" color={STATUS_COLOR[status] ?? 'gray'}>
                {STATUS_LABEL[status] ?? status}
              </Badge>
            </Group>
            <Group gap="xs" wrap="wrap">
              <Text size="sm" c="dark.2">
                {completedImageCount}/{plannedImageCount} creatives
              </Text>
              {winnerCount > 0 && (
                <Group gap={4}>
                  <IconStarFilled size={12} color="var(--mantine-color-yellow-5)" />
                  <Text size="sm" c="yellow.4">
                    {winnerCount} winner{winnerCount !== 1 ? 's' : ''}
                  </Text>
                </Group>
              )}
            </Group>
          </Box>
        </Group>

        <Group gap="sm">
          <Button size="sm" color="brand" leftSection={<IconPlus size={16} />} onClick={onGenerate}>
            {plannedImageCount > 0 ? 'Generate more' : 'Generate creatives'}
          </Button>
          <Tooltip
            label={
              !hasPaidPlan
                ? 'Upgrade to a paid plan to export'
                : completedImageCount === 0
                  ? 'Generate at least one creative to export'
                  : 'Download images + manifest.csv + copy_bank.csv'
            }
            withArrow
            position="left"
          >
            <Button
              size="sm"
              variant={hasPaidPlan ? 'filled' : 'default'}
              color="blue"
              loading={exporting}
              disabled={hasPaidPlan && completedImageCount === 0}
              onClick={handleExport}
            >
              {hasPaidPlan ? 'Export test set' : '🔒 Upgrade to export'}
            </Button>
          </Tooltip>
        </Group>
      </Group>

      {/* ── Ad builder bar ──────────────────────────────────────────────────── */}
      <Paper
        radius="md"
        p="md"
        withBorder
        style={{
          borderColor: 'var(--mantine-color-dark-5)',
          background:
            'linear-gradient(135deg, rgba(24,119,242,0.10), rgba(255,255,255,0.02))',
          position: 'sticky',
          top: 8,
          zIndex: 3,
          backdropFilter: 'blur(6px)',
        }}
      >
        <Group justify="space-between" wrap="wrap" gap="md">
          <Group gap="lg" wrap="wrap">
            <PickSummary label="Creative" value={selectedCreative ? '1 selected' : null} />
            <PickSummary label="Headline" value={selectedHeadline?.text ?? null} />
            <PickSummary label="Primary text" value={selectedPrimary?.text ?? null} />
          </Group>
          <Button
            color="blue"
            leftSection={<IconBrandFacebook size={18} />}
            disabled={!canPreview}
            onClick={() => {
              // Default to the first headline/primary text so the preview is
              // never empty when copy exists — the user can still swap cards.
              if (!selectedHeadline && headlineCards.length > 0) {
                setSelectedHeadline(headlineCards[0])
              }
              if (!selectedPrimary && primaryCards.length > 0) {
                setSelectedPrimary(primaryCards[0])
              }
              if (!selectedDescription && descriptionCards.length > 0) {
                setSelectedDescription(descriptionCards[0])
              }
              setPreviewOpen(true)
            }}
          >
            Preview as Facebook ad
          </Button>
        </Group>
        {!canPreview && (
          <Text size="xs" c="dark.3" mt="xs">
            Select a creative (and optionally a headline + primary text) to build your ad.
          </Text>
        )}
      </Paper>

      {/* ── Creatives ───────────────────────────────────────────────────────── */}
      <Section
        title="Creatives"
        count={generations.length}
        action={
          <Button size="xs" variant="light" color="brand" leftSection={<IconPlus size={14} />} onClick={onGenerate}>
            Generate creatives
          </Button>
        }
      >
        {generations.length === 0 ? (
          <EmptyState
            text="No creatives yet. Generate ad creatives from your template library."
            cta="Generate creatives"
            onClick={onGenerate}
          />
        ) : (
          <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="md">
            {generations.map((gen) => (
              <CreativeCard
                key={gen._id}
                gen={gen}
                selected={selectedCreativeId === gen._id}
                onSelect={() => {
                  setSelectedCreativeId((cur) => (cur === gen._id ? null : gen._id))
                  // Pre-load this creative's saved copy pairing into the builder.
                  if (selectedCreativeId !== gen._id) preloadPairing(gen)
                }}
                onExpand={() => onOpenAd(gen._id)}
                onToggleWinner={() =>
                  toggleWinner(
                    { generationId: gen._id },
                    {
                      onError: () =>
                        notifications.show({ color: 'red', message: 'Could not update winner' }),
                    },
                  )
                }
              />
            ))}
          </SimpleGrid>
        )}
      </Section>

      {/* ── Copy: headlines + primary text ──────────────────────────────────── */}
      <Section
        title="Headlines"
        count={headlineCards.length}
        action={<CopyGenerator onGenerate={handleGenerateCopy} loading={generatingCopy} />}
      >
        {headlineCards.length === 0 ? (
          <Paper
            radius="lg"
            p="xl"
            withBorder
            ta="center"
            style={{ borderStyle: 'dashed', borderWidth: 2, borderColor: 'var(--mantine-color-dark-5)' }}
          >
            <Stack align="center" gap="sm">
              <Text size="sm" c="dark.3" maw={460}>
                No copy yet. Choose what to generate — headlines, primary text,
                descriptions — how many of each, and whether to include emoji.
              </Text>
              <CopyGenerator onGenerate={handleGenerateCopy} loading={generatingCopy} />
            </Stack>
          </Paper>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm">
            {headlineCards.map((c) => (
              <CopyCard
                key={`${c.setId}:${c.index}`}
                text={c.text}
                selected={selectedHeadline?.setId === c.setId && selectedHeadline.index === c.index}
                onSelect={() =>
                  setSelectedHeadline((cur) =>
                    cur && cur.setId === c.setId && cur.index === c.index ? null : c,
                  )
                }
                onSave={(text) =>
                  updateCopy({ copySetId: c.setId, field: 'headlines', variantIndex: c.index, text })
                }
              />
            ))}
          </SimpleGrid>
        )}
      </Section>

      {primaryCards.length > 0 && (
        <Section title="Primary text" count={primaryCards.length}>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm">
            {primaryCards.map((c) => (
              <CopyCard
                key={`${c.setId}:${c.index}`}
                text={c.text}
                lines={4}
                emoji
                selected={selectedPrimary?.setId === c.setId && selectedPrimary.index === c.index}
                onSelect={() =>
                  setSelectedPrimary((cur) =>
                    cur && cur.setId === c.setId && cur.index === c.index ? null : c,
                  )
                }
                onSave={(text) =>
                  updateCopy({ copySetId: c.setId, field: 'primaryTexts', variantIndex: c.index, text })
                }
              />
            ))}
          </SimpleGrid>
        </Section>
      )}

      {descriptionCards.length > 0 && (
        <Section title="Descriptions" count={descriptionCards.length}>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm">
            {descriptionCards.map((c) => (
              <CopyCard
                key={`${c.setId}:${c.index}`}
                text={c.text}
                lines={3}
                emoji
                selected={selectedDescription?.setId === c.setId && selectedDescription.index === c.index}
                onSelect={() =>
                  setSelectedDescription((cur) =>
                    cur && cur.setId === c.setId && cur.index === c.index ? null : c,
                  )
                }
                onSave={(text) =>
                  updateCopy({ copySetId: c.setId, field: 'descriptions', variantIndex: c.index, text })
                }
              />
            ))}
          </SimpleGrid>
        </Section>
      )}

      {/* ── Performance notes ───────────────────────────────────────────────── */}
      <PerformanceNotesPanel adTestId={adTestId} />

      {/* ── Facebook preview modal ──────────────────────────────────────────── */}
      <Modal
        opened={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Facebook ad preview"
        centered
        size="auto"
      >
        <Stack align="center" gap="lg">
          <FacebookAdPreview
            imageUrl={selectedCreative?.outputUrl}
            aspectRatio={selectedCreative?.aspectRatio ?? '1:1'}
            pageName={productName}
            headline={selectedHeadline?.text}
            primaryText={selectedPrimary?.text}
            description={selectedDescription?.text}
            cta={cta}
          />
          <Group justify="center" w="100%">
            <Button variant="default" onClick={() => setPreviewOpen(false)}>
              Close
            </Button>
            <Button
              color="brand"
              leftSection={<IconCheck size={16} />}
              loading={saving}
              onClick={handleSavePairing}
            >
              Save this ad
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )

  // Pre-fill the builder from a creative's persisted pairing when it's selected.
  // If the creative isn't paired yet, KEEP whatever copy the user has already
  // picked — don't clear it (that wiped the headline/primary text right before
  // previewing).
  function preloadPairing(gen: (typeof generations)[number]) {
    if (!gen.selectedCopySetId) return
    const set = (copySets ?? []).find((s) => s._id === gen.selectedCopySetId)
    if (!set) return
    const hl =
      gen.selectedHeadlineIndex !== undefined
        ? set.headlines.find((h) => h.variantIndex === gen.selectedHeadlineIndex)
        : undefined
    const pt =
      gen.selectedPrimaryTextIndex !== undefined
        ? set.primaryTexts.find((p) => p.variantIndex === gen.selectedPrimaryTextIndex)
        : undefined
    const ds =
      gen.selectedDescriptionIndex !== undefined
        ? set.descriptions.find((d) => d.variantIndex === gen.selectedDescriptionIndex)
        : undefined
    setSelectedHeadline(
      hl ? { setId: set._id, index: hl.variantIndex, text: hl.text } : null,
    )
    setSelectedPrimary(
      pt ? { setId: set._id, index: pt.variantIndex, text: pt.text } : null,
    )
    setSelectedDescription(
      ds ? { setId: set._id, index: ds.variantIndex, text: ds.text } : null,
    )
  }
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title,
  count,
  action,
  children,
}: {
  title: string
  count: number
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <Stack gap="sm">
      <Group justify="space-between" align="center">
        <Group gap="xs" align="center">
          <Title order={3} fz={16} fw={600} c="white">{title}</Title>
          {count > 0 && (
            <Badge size="sm" variant="light" color="dark">{count}</Badge>
          )}
        </Group>
        {action}
      </Group>
      {children}
    </Stack>
  )
}

function PickSummary({ label, value }: { label: string; value: string | null }) {
  return (
    <Box style={{ minWidth: 0, maxWidth: 240 }}>
      <Text size="10px" tt="uppercase" fw={600} c="dark.3" style={{ letterSpacing: 0.4 }}>
        {label}
      </Text>
      <Text size="sm" c={value ? 'white' : 'dark.4'} lineClamp={1}>
        {value ?? 'None'}
      </Text>
    </Box>
  )
}

function EmptyState({
  text,
  cta,
  onClick,
  loading,
}: {
  text: string
  cta: string
  onClick: () => void
  loading?: boolean
}) {
  return (
    <Paper
      radius="lg"
      p="xl"
      withBorder
      ta="center"
      style={{ borderStyle: 'dashed', borderWidth: 2, borderColor: 'var(--mantine-color-dark-5)' }}
    >
      <Stack align="center" gap="sm">
        <Text size="sm" c="dark.3" maw={440}>{text}</Text>
        <Button color="brand" leftSection={<IconPlus size={16} />} loading={loading} onClick={onClick}>
          {cta}
        </Button>
      </Stack>
    </Paper>
  )
}

// ─── Creative card ────────────────────────────────────────────────────────────

function CreativeCard({
  gen,
  selected,
  onSelect,
  onExpand,
  onToggleWinner,
}: {
  gen: {
    _id: Id<'templateGenerations'>
    status: string
    outputUrl?: string
    aspectRatio?: string
    isWinner?: boolean
    currentStep?: string
    selectedCopySetId?: Id<'adTestCopySets'>
  }
  selected: boolean
  onSelect: () => void
  onExpand: () => void
  onToggleWinner: () => void
}) {
  const ratio = ASPECT_RATIO_VALUE[gen.aspectRatio ?? '1:1'] ?? 1
  const isComplete = gen.status === 'complete' && !!gen.outputUrl
  const isFailed = gen.status === 'failed'
  const isPaired = !!gen.selectedCopySetId

  return (
    <Paper
      radius="md"
      withBorder
      onClick={isComplete ? onSelect : undefined}
      style={{
        overflow: 'hidden',
        cursor: isComplete ? 'pointer' : 'default',
        borderColor: selected ? 'var(--mantine-color-brand-5)' : 'var(--mantine-color-dark-6)',
        borderWidth: selected ? 2 : 1,
        position: 'relative',
        transition: 'border-color 120ms ease',
      }}
    >
      <AspectRatio ratio={ratio} style={{ background: 'var(--mantine-color-dark-7)' }}>
        {isComplete ? (
          <Image src={gen.outputUrl} alt="Ad creative" style={{ objectFit: 'cover' }} />
        ) : isFailed ? (
          <Center>
            <Text size="xs" c="red.4">Failed</Text>
          </Center>
        ) : (
          <Center>
            <Stack align="center" gap={6}>
              <Loader size="sm" color="brand" />
              <Text size="10px" c="dark.3" ta="center" px="xs" lineClamp={2}>
                {gen.currentStep ?? 'Generating…'}
              </Text>
            </Stack>
          </Center>
        )}
      </AspectRatio>

      {/* Top-right badges */}
      <Group gap={4} style={{ position: 'absolute', top: 6, right: 6 }}>
        {isPaired && (
          <Badge size="xs" variant="filled" color="teal">Paired</Badge>
        )}
        {selected && (
          <Badge size="xs" variant="filled" color="brand" leftSection={<IconCheck size={9} />}>
            Selected
          </Badge>
        )}
      </Group>

      {/* Bottom actions on complete */}
      {isComplete && (
        <Group
          gap={4}
          justify="flex-end"
          style={{
            position: 'absolute',
            bottom: 6,
            right: 6,
          }}
        >
          <ActionIcon
            size="sm"
            variant="filled"
            color="dark"
            onClick={(e) => {
              e.stopPropagation()
              onToggleWinner()
            }}
            aria-label="Toggle winner"
          >
            {gen.isWinner ? (
              <IconStarFilled size={14} color="var(--mantine-color-yellow-5)" />
            ) : (
              <IconStar size={14} />
            )}
          </ActionIcon>
          <ActionIcon
            size="sm"
            variant="filled"
            color="dark"
            onClick={(e) => {
              e.stopPropagation()
              onExpand()
            }}
            aria-label="Open details"
          >
            <IconMaximize size={14} />
          </ActionIcon>
        </Group>
      )}
    </Paper>
  )
}

// ─── Copy card ────────────────────────────────────────────────────────────────

// ─── Copy generator (configurable) ────────────────────────────────────────────

function CopyGenerator({
  onGenerate,
  loading,
}: {
  onGenerate: (req: CopyRequest, emoji: boolean) => Promise<void>
  loading: boolean
}) {
  const [open, setOpen] = useState(false)
  const [inclH, setInclH] = useState(true)
  const [cH, setCH] = useState<number | string>(5)
  const [inclP, setInclP] = useState(true)
  const [cP, setCP] = useState<number | string>(3)
  const [inclD, setInclD] = useState(true)
  const [cD, setCD] = useState<number | string>(2)
  const [emoji, setEmoji] = useState(false)

  const num = (v: number | string) => (typeof v === 'number' ? v : parseInt(v, 10) || 0)
  const total = (inclH ? num(cH) : 0) + (inclP ? num(cP) : 0) + (inclD ? num(cD) : 0)

  const submit = async () => {
    await onGenerate(
      {
        includeHeadlines: inclH,
        headlineCount: num(cH),
        includePrimaryTexts: inclP,
        primaryTextCount: num(cP),
        includeDescriptions: inclD,
        descriptionCount: num(cD),
      },
      emoji,
    )
    setOpen(false)
  }

  return (
    <Popover opened={open} onChange={setOpen} position="bottom-end" withArrow shadow="md" width={300}>
      <Popover.Target>
        <Button
          size="xs"
          variant="light"
          color="grape"
          leftSection={<IconSparkles size={14} />}
          onClick={() => setOpen((o) => !o)}
        >
          Generate copy
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="sm">
          <Text size="xs" c="dark.2" fw={600}>
            What should we write?
          </Text>
          <FieldRow label="Headlines" checked={inclH} onCheck={setInclH} count={cH} onCount={setCH} />
          <FieldRow label="Primary text" checked={inclP} onCheck={setInclP} count={cP} onCount={setCP} />
          <FieldRow label="Descriptions" checked={inclD} onCheck={setInclD} count={cD} onCount={setCD} />
          <Switch
            label="Include emoji"
            checked={emoji}
            onChange={(e) => setEmoji(e.currentTarget.checked)}
            size="sm"
            color="grape"
          />
          <Button color="grape" loading={loading} disabled={total === 0} onClick={submit}>
            Generate {total} item{total === 1 ? '' : 's'}
          </Button>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}

function FieldRow({
  label,
  checked,
  onCheck,
  count,
  onCount,
}: {
  label: string
  checked: boolean
  onCheck: (v: boolean) => void
  count: number | string
  onCount: (v: number | string) => void
}) {
  return (
    <Group justify="space-between" wrap="nowrap">
      <Checkbox
        label={label}
        checked={checked}
        onChange={(e) => onCheck(e.currentTarget.checked)}
        size="sm"
      />
      <NumberInput
        value={count}
        onChange={onCount}
        min={1}
        max={10}
        disabled={!checked}
        size="xs"
        w={64}
        clampBehavior="strict"
        hideControls={false}
      />
    </Group>
  )
}

// Common ad-copy emoji palette.
const EMOJIS = [
  '🔥', '✨', '💧', '🚀', '⭐️', '✅', '🎉', '💯', '👇', '🛒', '😍', '🙌',
  '💪', '🌿', '☀️', '🏆', '🎯', '💥', '👀', '❤️', '🙏', '😎', '📣', '⚡️',
  '🎁', '👉', '💎', '🤝',
]

function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover opened={open} onChange={setOpen} position="bottom-start" withArrow shadow="md">
      <Popover.Target>
        <Tooltip label="Add emoji" withArrow>
          <ActionIcon variant="subtle" color="gray" onClick={() => setOpen((o) => !o)} aria-label="Add emoji">
            <IconMoodSmile size={18} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown p="xs">
        <SimpleGrid cols={7} spacing={2}>
          {EMOJIS.map((e) => (
            <ActionIcon
              key={e}
              variant="subtle"
              color="gray"
              onClick={() => onPick(e)}
              style={{ fontSize: 17 }}
              aria-label={`Insert ${e}`}
            >
              {e}
            </ActionIcon>
          ))}
        </SimpleGrid>
      </Popover.Dropdown>
    </Popover>
  )
}

function CopyCard({
  text,
  selected,
  onSelect,
  onSave,
  lines = 2,
  emoji = false,
}: {
  text: string
  selected: boolean
  onSelect: () => void
  onSave: (text: string) => Promise<unknown>
  lines?: number
  emoji?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  // Sync external edits in only while not actively editing.
  useEffect(() => {
    if (!editing) setDraft(text)
  }, [text, editing])

  const insertEmoji = (e: string) => {
    const el = ref.current
    if (!el) {
      setDraft((d) => d + e)
      return
    }
    const start = el.selectionStart ?? draft.length
    const end = el.selectionEnd ?? draft.length
    const next = draft.slice(0, start) + e + draft.slice(end)
    setDraft(next)
    requestAnimationFrame(() => {
      el.focus()
      const pos = start + e.length
      el.setSelectionRange(pos, pos)
    })
  }

  const cancel = () => {
    setEditing(false)
    setDraft(text)
  }

  const save = async () => {
    const trimmed = draft.replace(/[ \t]+$/gm, '').trim()
    if (!trimmed || trimmed === text) {
      cancel()
      return
    }
    setSaving(true)
    try {
      await onSave(trimmed)
      setEditing(false)
    } catch (err) {
      notifications.show({
        color: 'red',
        message: err instanceof Error ? err.message : 'Could not save',
      })
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <Paper
        radius="md"
        p="sm"
        withBorder
        style={{ borderColor: 'var(--mantine-color-brand-5)', borderWidth: 2 }}
      >
        <Textarea
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          autosize
          minRows={lines}
          maxRows={12}
          autoFocus
          styles={{ input: { background: 'var(--mantine-color-dark-7)' } }}
        />
        <Group justify="space-between" mt="xs">
          {emoji ? <EmojiPicker onPick={insertEmoji} /> : <span />}
          <Group gap={4}>
            <Button size="compact-sm" variant="subtle" color="gray" onClick={cancel}>
              Cancel
            </Button>
            <Button size="compact-sm" color="brand" loading={saving} onClick={save}>
              Save
            </Button>
          </Group>
        </Group>
      </Paper>
    )
  }

  return (
    <Paper
      radius="md"
      p="sm"
      withBorder
      onClick={onSelect}
      style={{
        cursor: 'pointer',
        borderColor: selected ? 'var(--mantine-color-brand-5)' : 'var(--mantine-color-dark-6)',
        borderWidth: selected ? 2 : 1,
        background: selected ? 'rgba(84,116,180,0.10)' : 'rgba(255,255,255,0.02)',
        transition: 'border-color 120ms ease, background-color 120ms ease',
        position: 'relative',
      }}
    >
      <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
        <Text size="sm" c="dark.0" style={{ whiteSpace: 'pre-wrap' }} lineClamp={lines}>
          {text}
        </Text>
        <Group gap={2} wrap="nowrap" style={{ flexShrink: 0 }}>
          {selected && <IconCheck size={16} color="var(--mantine-color-brand-5)" />}
          <ActionIcon
            size="sm"
            variant="subtle"
            color="gray"
            onClick={(e) => {
              e.stopPropagation()
              setEditing(true)
            }}
            aria-label="Edit copy"
          >
            <IconPencil size={13} />
          </ActionIcon>
        </Group>
      </Group>
    </Paper>
  )
}

function EditableTitle({
  value,
  onSave,
}: {
  value: string
  onSave: (name: string) => Promise<unknown>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  const cancel = () => {
    setEditing(false)
    setDraft(value)
  }

  const save = async () => {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === value) {
      cancel()
      return
    }
    setSaving(true)
    try {
      await onSave(trimmed)
      setEditing(false)
    } catch (err) {
      notifications.show({
        color: 'red',
        message: err instanceof Error ? err.message : 'Could not rename',
      })
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <Group gap={4} wrap="nowrap">
        <TextInput
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          autoFocus
          size="sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') cancel()
          }}
          styles={{ input: { fontSize: 18, fontWeight: 600 } }}
        />
        <ActionIcon color="brand" variant="filled" loading={saving} onClick={save} aria-label="Save name">
          <IconCheck size={16} />
        </ActionIcon>
        <ActionIcon color="gray" variant="subtle" onClick={cancel} aria-label="Cancel rename">
          <IconX size={16} />
        </ActionIcon>
      </Group>
    )
  }

  return (
    <Group gap={4} align="center" wrap="nowrap">
      <Title order={2} fz="xl" fw={600} c="white">{value}</Title>
      <Tooltip label="Rename test" withArrow>
        <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => setEditing(true)} aria-label="Rename test">
          <IconPencil size={15} />
        </ActionIcon>
      </Tooltip>
    </Group>
  )
}
