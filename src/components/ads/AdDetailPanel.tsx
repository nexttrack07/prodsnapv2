/**
 * Ad detail side-panel (Drawer) and shared content component.
 *
 * `<AdDetailPanel />` — Mantine Drawer, slides from right, ~520 px on desktop.
 * `<AdDetailContent />`  — the body (image, copy, actions, metadata). Reused by
 *   the full-page `/ads/:adId` route for shared-link access.
 */
import { useState, useCallback } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useConvexMutation, convexQuery } from '@convex-dev/react-query'
import { useAction } from 'convex/react'
import { useNavigate } from '@tanstack/react-router'
import { useMediaQuery } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import {
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Button,
  CloseButton,
  Divider,
  Drawer,
  Group,
  Image,
  Loader,
  Modal,
  Paper,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core'
import {
  IconArrowLeft,
  IconArrowRight,
  IconChevronLeft,
  IconChevronRight,
  IconCopy,
  IconDownload,
  IconStar,
  IconStarFilled,
  IconTrash,
  IconSparkles,
  IconExternalLink,
  IconWand,
} from '@tabler/icons-react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { fetchDownloadAsset } from '../../utils/downloads'
import { mapGenerationError } from '../../lib/billing/mapBillingError'

// ─── Types ───────────────────────────────────────────────────────────────────

export type AdDetailPanelProps = {
  opened: boolean
  onClose: () => void
  adId: Id<'templateGenerations'> | null
  siblings?: Array<Id<'templateGenerations'>>
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugifyFilePart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'image'
}

function inferFileExtension(url: string, contentType?: string | null): string {
  if (contentType) {
    if (contentType.includes('png')) return 'png'
    if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg'
    if (contentType.includes('webp')) return 'webp'
  }
  try {
    const pathname = new URL(url).pathname
    const match = pathname.match(/\.([a-zA-Z0-9]+)$/)
    if (match?.[1]) return match[1].toLowerCase()
  } catch { /* ignore */ }
  return 'png'
}

async function downloadFile(url: string, fileBaseName: string) {
  const { base64, contentType } = await fetchDownloadAsset({ data: { url } })
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  const blob = new Blob([bytes], { type: contentType || 'application/octet-stream' })
  const ext = inferFileExtension(url, contentType)
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = `${slugifyFilePart(fileBaseName)}.${ext}`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

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
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function copyToClipboard(value: string, label: string) {
  navigator.clipboard
    .writeText(value)
    .then(() =>
      notifications.show({ title: 'Copied', message: label, color: 'green', autoClose: 1500 }),
    )
    .catch(() =>
      notifications.show({ title: 'Copy failed', message: 'Try selecting manually.', color: 'red' }),
    )
}

// ─── CopySection (lifted from studio page) ──────────────────────────────────

function CopySection({
  label,
  items,
  inline,
}: {
  label: string
  items: string[]
  inline?: boolean
}) {
  return (
    <Box>
      <Text size="xs" tt="uppercase" fw={700} c="dark.2" mb={6}>
        {label}
      </Text>
      <Stack gap="xs">
        {items.map((item, idx) => (
          <Group
            key={`${label}-${idx}`}
            gap="sm"
            justify="space-between"
            align="center"
            wrap="nowrap"
            style={{
              padding: '8px 12px',
              background: 'rgba(255,255,255,0.04)',
              borderRadius: 6,
            }}
          >
            <Text size={inline ? 'sm' : 'sm'} c="white" style={{ flex: 1, minWidth: 0 }}>
              {item}
            </Text>
            <Button
              size="compact-xs"
              variant="subtle"
              onClick={() => copyToClipboard(item, `${label.toLowerCase()} copied`)}
            >
              Copy
            </Button>
          </Group>
        ))}
      </Stack>
    </Box>
  )
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

  const writeAdCopy = useAction(api.adCopy.generateAdCopyForGeneration)
  const [writingCopy, setWritingCopy] = useState(false)
  const handleWriteCopy = useCallback(async () => {
    if (!adId) return
    setWritingCopy(true)
    try {
      await writeAdCopy({ generationId: adId })
    } catch (err) {
      notifications.show({
        title: 'Could not write copy',
        message: err instanceof Error ? err.message : 'Try again',
        color: 'red',
      })
    } finally {
      setWritingCopy(false)
    }
  }, [adId, writeAdCopy])

  // Sibling navigation
  const currentIdx = siblings?.indexOf(adId) ?? -1
  const prevId = siblings && currentIdx > 0 ? siblings[currentIdx - 1] : null
  const nextId = siblings && currentIdx >= 0 && currentIdx < siblings.length - 1 ? siblings[currentIdx + 1] : null

  const handleDownload = useCallback(async () => {
    if (!ad?.outputUrl) return
    setIsDownloading(true)
    try {
      const name = `${ad.productName ?? 'ad'}-${ad.mode ?? 'generation'}`
      await downloadFile(ad.outputUrl, name)
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

  const handleGenerateSimilar = useCallback(async () => {
    if (!ad?.productId) return
    // Navigate to the product page to use the GenerateWizard there
    notifications.show({
      title: 'Navigate to generate',
      message: 'Opening product studio to create similar ads.',
      color: 'blue',
      autoClose: 2000,
    })
    navigate({ to: '/studio/$productId', params: { productId: ad.productId } })
  }, [ad, navigate])

  const handleEditInCompose = useCallback(() => {
    if (!ad?.productId) return
    navigate({
      to: '/studio/$productId',
      params: { productId: ad.productId },
      search: { compose: ad._id as string },
    })
  }, [ad, navigate])

  const handleEditWithCustomPrompt = useCallback(() => {
    if (!ad?.productId) return
    navigate({
      to: '/studio/$productId',
      params: { productId: ad.productId },
      search: { editAd: ad._id as string },
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

      {/* Ad copy — opt-in. User clicks to generate, then can edit/regenerate. */}
      <Box>
        <Group justify="space-between" align="center" mb="xs">
          <Text size="sm" fw={600} c="white">
            Ad copy
          </Text>
          {ad.adCopy && (
            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              leftSection={<IconSparkles size={12} />}
              loading={writingCopy}
              onClick={handleWriteCopy}
            >
              Regenerate
            </Button>
          )}
        </Group>
        {ad.adCopy ? (
          <Stack gap="md">
            {ad.adCopy.headlines.length > 0 && (
              <CopySection label="Headlines" items={ad.adCopy.headlines} />
            )}
            {ad.adCopy.primaryTexts.length > 0 && (
              <CopySection label="Primary text" items={ad.adCopy.primaryTexts} />
            )}
            {ad.adCopy.ctas.length > 0 && (
              <CopySection label="CTAs" items={ad.adCopy.ctas} inline />
            )}
          </Stack>
        ) : (
          <Paper
            p="md"
            radius="md"
            withBorder
            style={{
              borderStyle: 'dashed',
              borderColor: 'var(--mantine-color-dark-5)',
              backgroundColor: 'var(--mantine-color-dark-7)',
            }}
          >
            <Stack gap="xs" align="center" ta="center">
              <Text size="sm" c="dark.2">
                No copy yet. Generate Facebook headlines, primary text, and CTAs
                tailored to this ad.
              </Text>
              <Button
                color="brand"
                size="sm"
                leftSection={<IconSparkles size={14} />}
                loading={writingCopy}
                onClick={handleWriteCopy}
              >
                Write ad copy
              </Button>
            </Stack>
          </Paper>
        )}
      </Box>

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
          color="gray"
          leftSection={<IconExternalLink size={16} />}
          onClick={handleEditInCompose}
        >
          Edit in compose
        </Button>
      </Group>
      <Button
        variant="light"
        color="violet"
        leftSection={<IconWand size={16} />}
        onClick={handleEditWithCustomPrompt}
        disabled={!ad.outputUrl}
        fullWidth
      >
        Edit with custom prompt
      </Button>

      {/* Secondary actions */}
      <Group gap="xs">
        <Tooltip label="Download">
          <ActionIcon
            variant="subtle"
            color="gray"
            size="lg"
            onClick={handleDownload}
            loading={isDownloading}
            disabled={!ad.outputUrl}
            aria-label="Download ad"
          >
            <IconDownload size={18} />
          </ActionIcon>
        </Tooltip>
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
            <Text size="sm" c="white" style={{ flex: 1 }}>{ad.angleSeed.title}</Text>
          </Group>
        )}
        {ad.templateSnapshot?.name && (
          <Group gap="xs">
            <Text size="sm" c="dark.2" w={100}>Template</Text>
            <Text size="sm" c="white">{ad.templateSnapshot.name}</Text>
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
