/**
 * Ad detail side-panel (Drawer) and shared content component.
 *
 * `<AdDetailPanel />` — Mantine Drawer, slides from right, ~520 px on desktop.
 * `<AdDetailContent />`  — the body (image, copy, actions, metadata). Reused by
 *   the full-page `/ads/:adId` route for shared-link access.
 */
import { useState, useCallback, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useConvexMutation, convexQuery } from '@convex-dev/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useMediaQuery } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import {
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Button,
  Center,
  CloseButton,
  Divider,
  Drawer,
  Group,
  Image,
  Loader,
  Menu,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core'
import {
  IconArrowLeft,
  IconArrowRight,
  IconBrandFacebook,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconDownload,
  IconStar,
  IconStarFilled,
  IconTrash,
  IconSparkles,
  IconWand,
} from '@tabler/icons-react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { downloadGeneratedImage, DOWNLOAD_FORMATS, type DownloadFormat } from '../../utils/downloadImage'
import { mapGenerationError } from '../../lib/billing/mapBillingError'
import { FacebookAdPreview } from './FacebookAdPreview'

// ─── Types ───────────────────────────────────────────────────────────────────

export type AdDetailPanelProps = {
  opened: boolean
  onClose: () => void
  adId: Id<'templateGenerations'> | null
  siblings?: Array<Id<'templateGenerations'>>
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getModeLabel(mode: string): string {
  switch (mode) {
    case 'exact': return 'Exact'
    case 'remix': return 'Remix'
    case 'variation': return 'Variation'
    case 'angle': return 'From Angle'
    default: return mode
  }
}

function getModeColor(mode: string): string {
  switch (mode) {
    case 'variation': return 'violet'
    case 'remix': return 'orange'
    case 'angle': return 'lime'
    default: return 'teal'
  }
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// ─── AdDetailContent (shared body) ──────────────────────────────────────────

export function AdDetailContent({
  adId,
  siblings,
  onSiblingNav,
  showBackLink,
}: {
  adId: Id<'templateGenerations'>
  siblings?: Array<Id<'templateGenerations'>>
  onSiblingNav?: (id: Id<'templateGenerations'>) => void
  showBackLink?: boolean
}) {
  const navigate = useNavigate()
  const [isDownloading, setIsDownloading] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  const { data: ad, isLoading } = useQuery(
    convexQuery(api.templateGenerations.getAdById, { adId }),
  )

  const toggleWinner = useConvexMutation(api.templateGenerations.toggleWinner)
  const toggleWinnerMutation = useMutation({ mutationFn: toggleWinner })

  const deleteGeneration = useConvexMutation(api.products.deleteGeneration)
  const deleteMutation = useMutation({ mutationFn: deleteGeneration })

  // Sibling navigation
  const currentIdx = siblings?.indexOf(adId) ?? -1
  const prevId = siblings && currentIdx > 0 ? siblings[currentIdx - 1] : null
  const nextId = siblings && currentIdx >= 0 && currentIdx < siblings.length - 1 ? siblings[currentIdx + 1] : null

  const handleDownload = useCallback(async (format: DownloadFormat) => {
    if (!ad?.outputUrl) return
    setIsDownloading(true)
    try {
      const name = `${ad.productName ?? 'ad'}-${ad.mode ?? 'generation'}`
      await downloadGeneratedImage(ad.outputUrl, name, format)
    } catch (err) {
      notifications.show({
        title: 'Download failed',
        message: err instanceof Error ? err.message : 'Could not download',
        color: 'red',
      })
    } finally {
      setIsDownloading(false)
    }
  }, [ad])

  const handleToggleWinner = useCallback(async () => {
    if (!ad) return
    try {
      await toggleWinnerMutation.mutateAsync({ generationId: ad._id })
    } catch {
      notifications.show({ title: 'Error', message: 'Could not toggle winner', color: 'red' })
    }
  }, [ad, toggleWinnerMutation])

  const handleDelete = useCallback(async () => {
    if (!ad) return
    try {
      await deleteMutation.mutateAsync({ generationId: ad._id })
      notifications.show({ title: 'Deleted', message: 'Ad removed.', color: 'green' })
      setDeleteConfirmOpen(false)
      // Navigate back if on the full page
      if (showBackLink && ad.productId) {
        navigate({ to: '/studio/$productId', params: { productId: ad.productId } })
      }
    } catch {
      notifications.show({ title: 'Error', message: 'Failed to delete', color: 'red' })
    }
  }, [ad, deleteMutation, navigate, showBackLink])

  // "Generate similar" — open the generate wizard prefilled from this creative
  // (same template/style) so the user can tweak and generate more like it. The
  // new creatives are flat (attached to the product, no test container).
  const handleGenerateSimilar = useCallback(() => {
    if (!ad?.productId) return
    navigate({
      to: '/studio/$productId',
      params: { productId: ad.productId },
      search: {
        compose: ad._id as string,
      },
    })
  }, [ad, navigate])

  // "Edit with custom prompt" — feed THIS image into a prompt-based edit. The
  // edited creative is flat (attached to the product, no test container).
  const handleEditWithCustomPrompt = useCallback(() => {
    if (!ad?.productId) return
    navigate({
      to: '/studio/$productId',
      params: { productId: ad.productId },
      search: {
        editAd: ad._id as string,
      },
    })
  }, [ad, navigate])

  // ─── Loading / empty states ────────────────────────────────────────────────

  if (isLoading) {
    return (
      <Box py="xl" ta="center">
        <Loader size="md" color="brand" />
      </Box>
    )
  }

  if (!ad) {
    return (
      <Box py="xl" ta="center">
        <Text c="dark.2">Ad not found or not authorized.</Text>
      </Box>
    )
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <Stack gap="lg" pb="xl">
      {/* Back link (full page only) */}
      {showBackLink && ad.productId && (
        <Anchor
          size="sm"
          c="dark.2"
          onClick={() => navigate({ to: '/studio/$productId', params: { productId: ad.productId! } })}
          style={{ cursor: 'pointer' }}
        >
          <Group gap={4}>
            <IconArrowLeft size={14} />
            <Text size="sm">Back to {ad.productName ?? 'product'}</Text>
          </Group>
        </Anchor>
      )}

      {/* Image preview */}
      <Box>
        {ad.outputUrl ? (
          <Image
            src={ad.outputUrl}
            alt="Generated ad"
            radius="md"
            fit="contain"
            style={{ border: '1px solid var(--mantine-color-dark-5)' }}
          />
        ) : (
          <Box
            py={80}
            ta="center"
            style={{
              background: 'var(--mantine-color-dark-6)',
              borderRadius: 'var(--mantine-radius-md)',
            }}
          >
            <Text c="dark.3">No image available</Text>
          </Box>
        )}
      </Box>

      {/* Prev / Next navigation */}
      {siblings && siblings.length > 1 && onSiblingNav && (
        <Group justify="center" gap="sm">
          <ActionIcon
            variant="subtle"
            color="gray"
            disabled={!prevId}
            onClick={() => prevId && onSiblingNav(prevId)}
            aria-label="Previous ad"
          >
            <IconChevronLeft size={18} />
          </ActionIcon>
          <Text size="xs" c="dark.2">
            {currentIdx + 1} of {siblings.length}
          </Text>
          <ActionIcon
            variant="subtle"
            color="gray"
            disabled={!nextId}
            onClick={() => nextId && onSiblingNav(nextId)}
            aria-label="Next ad"
          >
            <IconChevronRight size={18} />
          </ActionIcon>
        </Group>
      )}

      <Divider color="dark.5" />

      {/* Primary actions */}
      <Group grow gap="sm">
        <Button
          variant="light"
          color="brand"
          leftSection={<IconSparkles size={16} />}
          onClick={handleGenerateSimilar}
        >
          Generate similar
        </Button>
        <Button
          variant="light"
          color="violet"
          leftSection={<IconWand size={16} />}
          onClick={handleEditWithCustomPrompt}
          disabled={!ad.outputUrl}
        >
          Edit with custom prompt
        </Button>
      </Group>

      {/* Secondary actions */}
      <Group gap="xs">
        <Menu position="top" withinPortal shadow="md">
          <Menu.Target>
            <Tooltip label="Download">
              <ActionIcon
                variant="subtle"
                color="gray"
                size="lg"
                loading={isDownloading}
                disabled={!ad.outputUrl}
                aria-label="Download ad"
              >
                <IconDownload size={18} />
              </ActionIcon>
            </Tooltip>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>Download as</Menu.Label>
            {DOWNLOAD_FORMATS.map((f) => (
              <Menu.Item key={f.value} onClick={() => handleDownload(f.value)}>
                {f.label}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
        <Tooltip label={ad.isWinner ? 'Unmark winner' : 'Mark as winner'}>
          <ActionIcon
            variant="subtle"
            color={ad.isWinner ? 'yellow' : 'gray'}
            size="lg"
            onClick={handleToggleWinner}
            loading={toggleWinnerMutation.isPending}
            aria-label="Toggle winner"
          >
            {ad.isWinner ? <IconStarFilled size={18} /> : <IconStar size={18} />}
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Delete">
          <ActionIcon
            variant="subtle"
            color="red"
            size="lg"
            onClick={() => setDeleteConfirmOpen(true)}
            aria-label="Delete ad"
          >
            <IconTrash size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {/* Facebook preview + copy pairing removed for now — the CopyPairingSection
          component below is intact and just needs re-wiring to bring it back. */}

      <Divider color="dark.5" />

      {/* Read-only metadata */}
      <Stack gap="xs">
        <Text size="xs" tt="uppercase" fw={700} c="dark.2">Details</Text>
        {ad.mode && (
          <Group gap="xs">
            <Text size="sm" c="dark.2" w={100}>Mode</Text>
            <Badge size="sm" variant="dot" color={getModeColor(ad.mode)}>
              {getModeLabel(ad.mode)}
            </Badge>
          </Group>
        )}
        {ad.aspectRatio && (
          <Group gap="xs">
            <Text size="sm" c="dark.2" w={100}>Ratio</Text>
            <Badge size="sm" variant="light" color="brand">{ad.aspectRatio}</Badge>
          </Group>
        )}
        {ad.angleSeed && (
          <Group gap="xs" align="flex-start">
            <Text size="sm" c="dark.2" w={100}>Angle</Text>
            <Text size="sm" c="dark.0" style={{ flex: 1 }}>{ad.angleSeed.title}</Text>
          </Group>
        )}
        {ad.templateSnapshot?.name && (
          <Group gap="xs">
            <Text size="sm" c="dark.2" w={100}>Template</Text>
            <Text size="sm" c="dark.0">{ad.templateSnapshot.name}</Text>
          </Group>
        )}
        {ad.dynamicPrompt && (
          <Group gap="xs" align="flex-start">
            <Text size="sm" c="dark.2" w={100}>Prompt</Text>
            <Text size="xs" c="dark.1" style={{ flex: 1 }} lineClamp={4}>
              {ad.dynamicPrompt}
            </Text>
          </Group>
        )}
        {ad.productImageUrl && (
          <Group gap="xs">
            <Text size="sm" c="dark.2" w={100}>Source</Text>
            <Image src={ad.productImageUrl} alt="Source product" w={40} h={40} radius="sm" fit="cover" />
          </Group>
        )}
        <Group gap="xs">
          <Text size="sm" c="dark.2" w={100}>Created</Text>
          <Text size="sm" c="dark.1">{formatTimestamp(ad._creationTime)}</Text>
        </Group>
      </Stack>

      {/* Delete confirmation modal */}
      <Modal
        opened={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Delete Ad"
        centered
        size="sm"
      >
        <Text size="sm" c="dark.1" mb="lg">
          Are you sure you want to delete this ad? This cannot be undone.
        </Text>
        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" color="gray" onClick={() => setDeleteConfirmOpen(false)}>
            Cancel
          </Button>
          <Button color="red" onClick={handleDelete} loading={deleteMutation.isPending}>
            Delete
          </Button>
        </Group>
      </Modal>
    </Stack>
  )
}

// ─── Copy pairing (Facebook preview + Copy Bank) ─────────────────────────────

type CopyPick = { setId: Id<'copySets'>; index: number; text: string }

/**
 * Pairs this creative with copy from the product's Copy Bank. The user picks a
 * headline / primary text / description, sees the live Facebook preview, and
 * saves the pairing (→ a "saved ad"). All three picks must come from the same
 * copy set (the backend pairing is single-set).
 */
function CopyPairingSection({
  generationId,
  productId,
  productName,
  outputUrl,
  aspectRatio,
  selectedCopySetId,
  selectedHeadlineIndex,
  selectedPrimaryTextIndex,
  selectedDescriptionIndex,
}: {
  generationId: Id<'templateGenerations'>
  productId: Id<'products'>
  productName: string
  outputUrl: string
  aspectRatio: string
  selectedCopySetId?: Id<'copySets'>
  selectedHeadlineIndex?: number
  selectedPrimaryTextIndex?: number
  selectedDescriptionIndex?: number
}) {
  const { data: copySets, isLoading } = useQuery(
    convexQuery(api.copyBank.listCopySets, { productId }),
  )

  const pairMutation = useConvexMutation(api.copyBank.pairCopyWithGeneration)
  const { mutateAsync: pairCopy, isPending: saving } = useMutation({
    mutationFn: pairMutation,
  })

  const [headline, setHeadline] = useState<CopyPick | null>(null)
  const [primary, setPrimary] = useState<CopyPick | null>(null)
  const [description, setDescription] = useState<CopyPick | null>(null)

  // Load the creative's saved pairing into the picker once copy sets arrive.
  useEffect(() => {
    if (!copySets || !selectedCopySetId) return
    const set = copySets.find((s) => s._id === selectedCopySetId)
    if (!set) return
    const pick = (
      list: Array<{ variantIndex: number; text: string }>,
      idx?: number,
    ): CopyPick | null => {
      if (idx === undefined) return null
      const m = list.find((x) => x.variantIndex === idx)
      return m ? { setId: set._id, index: m.variantIndex, text: m.text } : null
    }
    setHeadline(pick(set.headlines, selectedHeadlineIndex))
    setPrimary(pick(set.primaryTexts, selectedPrimaryTextIndex))
    setDescription(pick(set.descriptions, selectedDescriptionIndex))
  }, [
    copySets,
    selectedCopySetId,
    selectedHeadlineIndex,
    selectedPrimaryTextIndex,
    selectedDescriptionIndex,
  ])

  // Picks must all share one copy set. Selecting from a different set clears the
  // others so the resulting pairing is internally consistent.
  const choose = (field: 'headline' | 'primary' | 'description', c: CopyPick) => {
    const cur =
      field === 'headline' ? headline : field === 'primary' ? primary : description
    const isSame = cur && cur.setId === c.setId && cur.index === c.index
    const setter =
      field === 'headline'
        ? setHeadline
        : field === 'primary'
          ? setPrimary
          : setDescription
    if (isSame) {
      setter(null)
      return
    }
    setter(c)
    // Clear other-field picks that belong to a different copy set.
    if (field !== 'headline' && headline && headline.setId !== c.setId) setHeadline(null)
    if (field !== 'primary' && primary && primary.setId !== c.setId) setPrimary(null)
    if (field !== 'description' && description && description.setId !== c.setId) {
      setDescription(null)
    }
  }

  const chosenSetId =
    headline?.setId ?? primary?.setId ?? description?.setId
  const chosenSet = copySets?.find((s) => s._id === chosenSetId)
  const cta = chosenSet?.recommendedCtaButton

  const handleSave = async () => {
    const setId = headline?.setId ?? primary?.setId ?? description?.setId
    try {
      await pairCopy({
        generationId,
        copySetId: setId,
        headlineIndex:
          headline && headline.setId === setId ? headline.index : undefined,
        primaryTextIndex:
          primary && primary.setId === setId ? primary.index : undefined,
        descriptionIndex:
          description && description.setId === setId ? description.index : undefined,
      })
      notifications.show({
        color: 'green',
        message: 'Ad saved — creative paired with copy.',
      })
    } catch (err) {
      notifications.show({
        color: 'red',
        message: err instanceof Error ? err.message : 'Could not save pairing.',
      })
    }
  }

  const headlines = (copySets ?? []).flatMap((s) =>
    s.headlines.map((h) => ({ setId: s._id, index: h.variantIndex, text: h.text })),
  )
  const primaries = (copySets ?? []).flatMap((s) =>
    s.primaryTexts.map((p) => ({ setId: s._id, index: p.variantIndex, text: p.text })),
  )
  const descriptions = (copySets ?? []).flatMap((s) =>
    s.descriptions.map((d) => ({ setId: s._id, index: d.variantIndex, text: d.text })),
  )

  const hasAnyCopy =
    headlines.length > 0 || primaries.length > 0 || descriptions.length > 0

  return (
    <Stack gap="md">
      <Group gap={6} align="center">
        <IconBrandFacebook size={16} color="var(--mantine-color-blue-5)" />
        <Text size="sm" fw={600} c="dark.0">
          Facebook preview
        </Text>
      </Group>

      <Center>
        <FacebookAdPreview
          imageUrl={outputUrl}
          aspectRatio={aspectRatio}
          pageName={productName}
          headline={headline?.text}
          primaryText={primary?.text}
          description={description?.text}
          cta={cta}
          width={360}
          headlinePlaceholder="Choose a headline"
          primaryTextPlaceholder="Choose primary text"
        />
      </Center>

      {isLoading ? (
        <Box py="md" ta="center">
          <Loader size="sm" color="gray" />
        </Box>
      ) : !hasAnyCopy ? (
        <Text size="xs" c="dark.3">
          No copy yet. Generate copy from the product's Ad copy tab, then pair it
          with this creative here.
        </Text>
      ) : (
        <Stack gap="sm">
          {headlines.length > 0 && (
            <CopyPickGroup
              label="Headline"
              picks={headlines}
              selected={headline}
              onPick={(c) => choose('headline', c)}
            />
          )}
          {primaries.length > 0 && (
            <CopyPickGroup
              label="Primary text"
              picks={primaries}
              selected={primary}
              onPick={(c) => choose('primary', c)}
            />
          )}
          {descriptions.length > 0 && (
            <CopyPickGroup
              label="Description"
              picks={descriptions}
              selected={description}
              onPick={(c) => choose('description', c)}
            />
          )}
        </Stack>
      )}

      <Button
        color="brand"
        leftSection={<IconCheck size={16} />}
        loading={saving}
        disabled={!headline && !primary && !description}
        onClick={handleSave}
      >
        Save this ad
      </Button>
    </Stack>
  )
}

function CopyPickGroup({
  label,
  picks,
  selected,
  onPick,
}: {
  label: string
  picks: CopyPick[]
  selected: CopyPick | null
  onPick: (c: CopyPick) => void
}) {
  return (
    <Box>
      <Text size="xs" tt="uppercase" fw={700} c="dark.2" mb={6}>
        {label}
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
        {picks.map((c) => {
          const isSelected =
            !!selected && selected.setId === c.setId && selected.index === c.index
          return (
            <Paper
              key={`${c.setId}:${c.index}`}
              radius="sm"
              p="xs"
              withBorder
              onClick={() => onPick(c)}
              style={{
                cursor: 'pointer',
                borderColor: isSelected
                  ? 'var(--mantine-color-brand-5)'
                  : 'var(--mantine-color-dark-5)',
                borderWidth: isSelected ? 2 : 1,
                background: isSelected
                  ? 'var(--canvas, #f4f6f8)'
                  : 'var(--surface, #ffffff)',
                transition: 'border-color 120ms ease, background-color 120ms ease',
              }}
            >
              <Group gap={4} wrap="nowrap" align="flex-start">
                <Text size="xs" c="dark.0" style={{ flex: 1, whiteSpace: 'pre-wrap' }} lineClamp={3}>
                  {c.text}
                </Text>
                {isSelected && (
                  <IconCheck size={14} color="var(--mantine-color-brand-5)" style={{ flexShrink: 0 }} />
                )}
              </Group>
            </Paper>
          )
        })}
      </SimpleGrid>
    </Box>
  )
}

// ─── AdDetailPanel (Drawer wrapper) ─────────────────────────────────────────

export function AdDetailPanel({ opened, onClose, adId, siblings }: AdDetailPanelProps) {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [currentAdId, setCurrentAdId] = useState<Id<'templateGenerations'> | null>(null)

  // Track the active ad — prefer explicit sibling-nav, fall back to prop
  const activeId = currentAdId ?? adId

  // Sync with parent prop when drawer opens with a new ad
  const handleOpen = () => {
    setCurrentAdId(null)
  }

  const handleClose = () => {
    setCurrentAdId(null)
    onClose()
  }

  const handleSiblingNav = (id: Id<'templateGenerations'>) => {
    setCurrentAdId(id)
  }

  // Fetch ad for breadcrumb header
  const { data: ad } = useQuery({
    ...convexQuery(api.templateGenerations.getAdById, activeId ? { adId: activeId } : 'skip'),
    enabled: !!activeId,
  })

  const siblingIdx = activeId && siblings ? siblings.indexOf(activeId) : -1

  return (
    <Drawer
      opened={opened}
      onClose={handleClose}
      position="right"
      size={isMobile ? '100%' : 520}
      withCloseButton={false}
      padding={0}
      styles={{
        body: { height: '100%', display: 'flex', flexDirection: 'column' },
        content: { backgroundColor: 'var(--mantine-color-dark-7)' },
      }}
    >
      {/* Header strip */}
      <Group
        justify="space-between"
        px="md"
        py="sm"
        style={{ borderBottom: '1px solid var(--mantine-color-dark-5)', flexShrink: 0 }}
      >
        <Group gap={6}>
          <IconChevronLeft size={14} style={{ color: 'var(--mantine-color-dark-2)' }} />
          <Text size="sm" c="dark.2" lineClamp={1}>
            {ad?.productName ?? 'Product'}
            {siblingIdx >= 0 ? ` / Ad #${siblingIdx + 1}` : ''}
          </Text>
        </Group>
        <CloseButton onClick={handleClose} aria-label="Close panel" />
      </Group>

      {/* Scrollable body */}
      <Box px="md" py="md" style={{ flex: 1, overflowY: 'auto' }}>
        {activeId && (
          <AdDetailContent
            adId={activeId}
            siblings={siblings}
            onSiblingNav={handleSiblingNav}
            showBackLink={false}
          />
        )}
      </Box>
    </Drawer>
  )
}
