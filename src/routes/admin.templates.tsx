import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useAction, usePaginatedQuery } from 'convex/react'
import { useConvexMutation, convexQuery } from '@convex-dev/react-query'
import { useState, useRef, useEffect } from 'react'
import { notifications } from '@mantine/notifications'
import {
  Container,
  Title,
  Text,
  Paper,
  Box,
  Group,
  Badge,
  Button,
  ThemeIcon,
  Image,
  Loader,
  Breadcrumbs,
  Anchor,
  AspectRatio,
  Checkbox,
  Tooltip,
  Modal,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconUpload, IconRefresh, IconTrash, IconX, IconLoader2, IconCheck, IconAlertTriangle, IconClock } from '@tabler/icons-react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { MAX_TEMPLATE_IMAGE_SIZE, getAspectRatioValue } from '../utils/constants'

// Batch upload settings
const UPLOAD_BATCH_SIZE = 3
const BATCH_DELAY_MS = 2000
// Initial page size for the admin grid; pagination loads more on demand.
const PAGE_SIZE = 24
// Max edge of the client-generated thumbnail (px). Smaller wins more on the
// admin grid + user-facing template picker; larger preserves quality.
const THUMBNAIL_MAX_EDGE = 512

export const Route = createFileRoute('/admin/templates')({
  component: AdminTemplatesPage,
})

interface TemplateRow {
  _id: Id<'adTemplates'>
  _creationTime: number
  imageUrl: string
  thumbnailUrl: string
  aspectRatio: string
  width: number
  height: number
  status: 'pending' | 'ingesting' | 'published' | 'failed'
  // New structured tags (one value per category)
  productCategory?: string
  primaryColor?: string
  imageStyle?: string
  setting?: string
  composition?: string
  textAmount?: string
  subcategory?: string
  // Legacy fields
  category?: string
  sceneTypes?: string[]
  moods?: string[]
  ingestError?: string
}

// Tag category colors for visual organization
const TAG_COLORS: Record<string, string> = {
  productCategory: 'blue',
  primaryColor: 'grape',
  imageStyle: 'teal',
  setting: 'orange',
  composition: 'cyan',
  textAmount: 'pink',
}

function AdminTemplatesPage() {
  const {
    results: rows,
    status: pageStatus,
    loadMore,
  } = usePaginatedQuery(
    api.templates.listPaginated,
    {},
    { initialNumItems: PAGE_SIZE },
  ) as {
    results: TemplateRow[]
    status: 'CanLoadMore' | 'LoadingFirstPage' | 'LoadingMore' | 'Exhausted'
    loadMore: (n: number) => void
  }

  const { data: counts } = useQuery(convexQuery(api.templates.getCounts, {}))

  return (
    <Container size="lg" py={40}>
      <Paper
        radius="lg"
        p="xl"
        mb="xl"
        style={{
          background: 'linear-gradient(135deg, rgba(84, 116, 180, 0.1) 0%, rgba(84, 116, 180, 0.03) 100%)',
          border: '1px solid var(--mantine-color-dark-5)',
        }}
      >
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
          <Box>
            <Breadcrumbs mb={8}>
              <Anchor component={Link} to="/admin" size="sm" c="dark.2">
                Admin
              </Anchor>
              <Text size="sm" c="dark.1">Templates</Text>
            </Breadcrumbs>
            <Title order={1} fz={30} fw={600} c="white">
              Templates
            </Title>
            <Text c="dark.2" mt={4}>
              Upload ad templates. The system auto-computes a CLIP embedding and visual tags for each.
            </Text>
          </Box>
          <Group gap="xs">
            <StatPill label="Total" value={counts?.total ?? 0} />
            <StatPill label="Published" value={counts?.published ?? 0} color="teal" />
            <StatPill label="Ingesting" value={counts?.pending ?? 0} color="brand" />
            <StatPill label="Failed" value={counts?.failed ?? 0} color="red" />
          </Group>
        </Group>
      </Paper>

      <UploadArea />

      <TemplatesTable
        rows={rows}
        pageStatus={pageStatus}
        loadMore={() => loadMore(PAGE_SIZE)}
      />
    </Container>
  )
}

function UploadArea() {
  const uploadTemplate = useAction(api.r2.uploadTemplateImage)
  const createTemplate = useConvexMutation(api.templates.createTemplate)
  const cleanupOrphan = useConvexMutation(api.templates.cleanupOrphanedUpload)
  const { data: existingHashes } = useQuery(convexQuery(api.templates.getExistingHashes, {}))
  const [inFlight, setInFlight] = useState(0)
  const [dragging, setDragging] = useState(false)

  async function handleFiles(files: FileList | File[] | null) {
    if (!files) return
    const list = Array.from(files)
    if (list.length === 0) return

    const notifId = `upload-progress-${crypto.randomUUID()}`

    notifications.show({
      id: notifId,
      title: 'Checking files',
      message: `Validating ${list.length} file${list.length === 1 ? '' : 's'}...`,
      loading: true,
      autoClose: false,
      withCloseButton: false,
    })

    // Preflight: validate type + size BEFORE the expensive hash compute, then
    // dedup. Failures here are recorded but don't bring down the batch.
    const existingHashSet = new Set(existingHashes ?? [])
    const filesToUpload: { file: File; hash: string }[] = []
    const duplicates: string[] = []
    const failedFiles: { name: string; error: string }[] = []

    for (const file of list) {
      if (!file.type.startsWith('image/')) {
        failedFiles.push({ name: file.name, error: 'Not an image' })
        continue
      }
      if (file.size > MAX_TEMPLATE_IMAGE_SIZE) {
        failedFiles.push({ name: file.name, error: 'Over 20 MB' })
        continue
      }
      let hash: string
      try {
        hash = await computeFileHash(file)
      } catch (err) {
        console.error(`Failed to hash ${file.name}:`, err)
        failedFiles.push({ name: file.name, error: 'Hash compute failed' })
        continue
      }
      if (existingHashSet.has(hash)) {
        duplicates.push(file.name)
        continue
      }
      filesToUpload.push({ file, hash })
      existingHashSet.add(hash)
    }

    // Nothing to upload — surface preflight failures + duplicates in the
    // final notification and return.
    if (filesToUpload.length === 0) {
      const parts: string[] = []
      if (duplicates.length > 0) {
        parts.push(`${duplicates.length} duplicate${duplicates.length === 1 ? '' : 's'} skipped`)
      }
      if (failedFiles.length > 0) {
        parts.push(`${failedFiles.length} failed preflight`)
      }
      const detail = formatFailureSummary(failedFiles)
      notifications.update({
        id: notifId,
        title: failedFiles.length > 0 ? 'No uploads' : 'No new templates',
        message: (
          <Box style={{ whiteSpace: 'pre-line' }}>
            {`${parts.join(', ')}.${detail}`}
          </Box>
        ),
        color: failedFiles.length > 0 ? 'red' : 'yellow',
        loading: false,
        autoClose: failedFiles.length > 0 ? 12000 : 5000,
        withCloseButton: true,
      })
      return
    }

    const total = filesToUpload.length
    let completed = 0
    let ok = 0
    // `failed` counts BATCH failures only, for the progress display.
    // Preflight failures are already in failedFiles; final notification uses
    // failedFiles.length so they're not lost.
    let failed = 0

    setInFlight(total)

    // Update notification to show upload starting
    const duplicateNote = duplicates.length > 0 ? ` (${duplicates.length} duplicate${duplicates.length === 1 ? '' : 's'} skipped)` : ''
    notifications.update({
      id: notifId,
      title: 'Uploading templates',
      message: `Processing 0/${total}...${duplicateNote}`,
      loading: true,
      autoClose: false,
    })

    // Process files in batches to avoid rate limiting
    const batches: { file: File; hash: string }[][] = []
    for (let i = 0; i < filesToUpload.length; i += UPLOAD_BATCH_SIZE) {
      batches.push(filesToUpload.slice(i, i + UPLOAD_BATCH_SIZE))
    }

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex]

      // Process batch in parallel. Type + size + hash already checked in
      // the preflight pass, so this loop only does the heavy work.
      await Promise.all(
        batch.map(async ({ file, hash }) => {
          try {
            const { width, height } = await measureImage(file)
            const base64 = await fileToBase64(file)
            const thumb = await generateThumbnail(file, width, height)
            const upload = await uploadTemplate({
              name: file.name,
              contentType: file.type,
              base64,
              width,
              height,
              thumbnailBase64: thumb?.base64,
              thumbnailContentType: thumb?.contentType,
            })
            try {
              await createTemplate({
                imageUrl: upload.imageUrl,
                thumbnailUrl: upload.thumbnailUrl,
                imageStorageKey: upload.imageStorageKey,
                thumbnailStorageKey: upload.thumbnailStorageKey,
                aspectRatio: upload.aspectRatio,
                width: upload.width,
                height: upload.height,
                contentHash: hash || undefined,
              })
              ok++
            } catch (err) {
              // R2 upload landed but the row insert failed. Roll back the R2
              // bytes so we don't leave an orphan that has no template row
              // (and therefore no admin recovery path).
              try {
                await cleanupOrphan({
                  imageStorageKey: upload.imageStorageKey,
                  thumbnailStorageKey: upload.thumbnailStorageKey,
                })
              } catch (cleanupErr) {
                console.error(
                  `Orphan cleanup failed for ${file.name}:`,
                  cleanupErr,
                )
              }
              throw err
            }
          } catch (err) {
            failed++
            const message = err instanceof Error ? err.message : String(err)
            failedFiles.push({ name: file.name, error: message })
            console.error(`Upload failed for ${file.name}:`, err)
          } finally {
            completed++
            setInFlight(total - completed)
            // Update progress notification
            notifications.update({
              id: notifId,
              title: 'Uploading templates',
              message: `Processing ${completed}/${total}... (${ok} uploaded, ${failed} failed)${duplicateNote}`,
              loading: true,
              autoClose: false,
            })
          }
        }),
      )

      // Wait between batches (except for the last one)
      if (batchIndex < batches.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS))
      }
    }

    // Show final notification. failedFiles includes both preflight failures
    // and batch failures, so use its length for the overall failure count.
    const totalFailed = failedFiles.length
    const skipMessage = duplicates.length > 0 ? ` ${duplicates.length} duplicate${duplicates.length === 1 ? '' : 's'} skipped.` : ''
    if (totalFailed === 0 && ok > 0) {
      notifications.update({
        id: notifId,
        title: 'Upload complete',
        message: `Successfully uploaded ${ok} template${ok === 1 ? '' : 's'}.${skipMessage} Tagging in progress...`,
        color: 'green',
        loading: false,
        autoClose: 5000,
        withCloseButton: true,
      })
    } else if (ok > 0 && totalFailed > 0) {
      const detail = formatFailureSummary(failedFiles)
      notifications.update({
        id: notifId,
        title: 'Upload partially complete',
        message: (
          <Box style={{ whiteSpace: 'pre-line' }}>
            {`Uploaded ${ok} template${ok === 1 ? '' : 's'}, ${totalFailed} failed.${skipMessage}${detail}\n\nTagging in progress...`}
          </Box>
        ),
        color: 'yellow',
        loading: false,
        autoClose: 12000,
        withCloseButton: true,
      })
    } else {
      const detail = formatFailureSummary(failedFiles)
      notifications.update({
        id: notifId,
        title: 'Upload failed',
        message: (
          <Box style={{ whiteSpace: 'pre-line' }}>
            {`All ${totalFailed} upload${totalFailed === 1 ? '' : 's'} failed.${detail}`}
          </Box>
        ),
        color: 'red',
        loading: false,
        autoClose: 12000,
        withCloseButton: true,
      })
    }
  }

  return (
    <Paper
      component="label"
      radius="lg"
      p={48}
      mb="xl"
      ta="center"
      withBorder
      style={{
        borderWidth: 2,
        borderStyle: 'dashed',
        cursor: 'pointer',
        borderColor: dragging ? 'var(--mantine-color-brand-5)' : 'var(--mantine-color-dark-4)',
        backgroundColor: dragging ? 'rgba(84, 116, 180, 0.1)' : 'var(--mantine-color-dark-7)',
        transition: 'border-color 200ms ease, background-color 200ms ease, transform 200ms ease',
        transform: dragging ? 'scale(1.01)' : 'scale(1)',
      }}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        handleFiles(e.dataTransfer.files)
      }}
    >
      <input
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(e.currentTarget.files)}
      />
      <ThemeIcon
        size={64}
        radius="lg"
        variant="gradient"
        gradient={{ from: 'brand.7', to: 'brand.5', deg: 135 }}
        mx="auto"
        mb="md"
        style={{ boxShadow: '0 4px 20px rgba(84, 116, 180, 0.25)' }}
      >
        <IconUpload size={28} />
      </ThemeIcon>
      <Text fw={600} size="lg" c="white">
        {inFlight > 0
          ? `Uploading ${inFlight} file${inFlight === 1 ? '' : 's'}…`
          : (
              <>
                Drop ad templates or <Text component="span" c="brand.4" inherit>browse</Text>
              </>
            )}
      </Text>
      <Text size="sm" c="dark.2" mt={8}>
        Multiple images OK. 1:1, 4:5, 9:16, or 16:9 (±12%). Up to 20 MB each.
      </Text>
    </Paper>
  )
}

async function measureImage(file: File): Promise<{ width: number; height: number }> {
  // createImageBitmap with imageOrientation: 'from-image' honors EXIF
  // rotation, so phone-camera JPEGs report post-rotation dimensions and the
  // aspect-ratio classifier doesn't misfire on orientation tag 6/8 images.
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: 'from-image',
      })
      const result = { width: bitmap.width, height: bitmap.height }
      bitmap.close()
      return result
    } catch {
      // Fall through to legacy path on browser quirks (Safari/Firefox have
      // historically had spotty createImageBitmap support for some formats).
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read image dimensions'))
    }
    img.src = url
  })
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '')
    reader.onerror = reject
  })
}

/**
 * Generate a max-512px-edge webp thumbnail in the browser via canvas. Returns
 * null when the source is already small enough or generation fails — caller
 * falls back to using the full image as the thumbnail.
 */
async function generateThumbnail(
  file: File,
  width: number,
  height: number,
): Promise<{ base64: string; contentType: string } | null> {
  const scale = Math.min(1, THUMBNAIL_MAX_EDGE / Math.max(width, height))
  if (scale === 1) return null
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))

  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new window.Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('Image decode failed'))
      i.src = url
    })

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, w, h)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.82),
    )
    if (!blob) return null

    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () =>
        resolve((reader.result as string).split(',')[1] ?? '')
      reader.onerror = () => reject(new Error('Thumbnail read failed'))
      reader.readAsDataURL(blob)
    })
    return { base64, contentType: blob.type || 'image/webp' }
  } catch (err) {
    console.warn('Thumbnail generation skipped:', err)
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Build a human-readable summary of which files failed and why for the
 * final upload notification. Caps to 5 lines so a 50-file batch with many
 * failures stays readable.
 */
function formatFailureSummary(
  files: Array<{ name: string; error: string }>,
): string {
  if (files.length === 0) return ''
  const shown = files.slice(0, 5)
  const lines = shown.map((f) => `• ${f.name} — ${f.error}`)
  if (files.length > 5) {
    lines.push(`…and ${files.length - 5} more`)
  }
  return '\n\n' + lines.join('\n')
}

/** Compute SHA-256 hash of file contents for duplicate detection */
async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

function TemplatesTable({
  rows,
  pageStatus,
  loadMore,
}: {
  rows: TemplateRow[]
  pageStatus: 'CanLoadMore' | 'LoadingFirstPage' | 'LoadingMore' | 'Exhausted'
  loadMore: () => void
}) {
  const [selectedIds, setSelectedIds] = useState<Set<Id<'adTemplates'>>>(new Set())
  const [isRetagging, setIsRetagging] = useState(false)
  const [bulkDeleteModalOpened, { open: openBulkDeleteModal, close: closeBulkDeleteModal }] = useDisclosure(false)
  const [deleteModalOpened, { open: openDeleteModal, close: closeDeleteModal }] = useDisclosure(false)
  const [templateToDelete, setTemplateToDelete] = useState<Id<'adTemplates'> | null>(null)

  // Track templates being retagged for progress notification.
  // With pagination, only templates currently in the loaded pages will be
  // tracked through processing. Templates that scroll off the loaded set
  // mid-retag will time out of the progress notifier — acceptable for now.
  const [retaggingIds, setRetaggingIds] = useState<Set<Id<'adTemplates'>>>(new Set())
  const retagNotifIdRef = useRef<string | null>(null)
  const retagTotalRef = useRef<number>(0)
  // Track which templates we've actually seen enter processing (pending/ingesting)
  // This prevents counting old "failed" status as completion
  const seenInProcessingRef = useRef<Set<Id<'adTemplates'>>>(new Set())

  const retryMutation = useMutation({ mutationFn: useConvexMutation(api.templates.retryTemplateIngest) })
  const retryBatchMutation = useMutation({ mutationFn: useConvexMutation(api.templates.retryTemplatesBatch) })
  const deleteMutation = useMutation({ mutationFn: useConvexMutation(api.templates.deleteTemplate) })

  // Server already returns rows newest-first via `.order('desc')`.
  const sortedRows = rows
  const failedCount = rows.filter((r) => r.status === 'failed').length

  // Track retagging progress and update notification
  useEffect(() => {
    if (retaggingIds.size === 0 || !retagNotifIdRef.current) return

    const total = retagTotalRef.current
    const tracked = rows.filter((r) => retaggingIds.has(r._id))

    // Track which templates have entered processing state (pending or ingesting)
    // Once seen in processing, we know their final status is from THIS re-tag run
    for (const t of tracked) {
      if (t.status === 'pending' || t.status === 'ingesting') {
        seenInProcessingRef.current.add(t._id)
      }
    }

    // Count templates that have been through processing
    const seenProcessing = seenInProcessingRef.current
    const processedTemplates = tracked.filter((t) => seenProcessing.has(t._id))

    // Status breakdown - ONLY count templates we've seen go through processing
    const ingesting = processedTemplates.filter((r) => r.status === 'ingesting').length
    const pending = processedTemplates.filter((r) => r.status === 'pending').length
    const succeeded = processedTemplates.filter((r) => r.status === 'published').length
    const failed = processedTemplates.filter((r) => r.status === 'failed').length
    const processing = ingesting + pending
    const completed = succeeded + failed

    // How many haven't entered processing yet?
    const waitingToStart = total - seenProcessing.size

    // All templates have been through processing and none are still processing?
    if (waitingToStart === 0 && processing === 0 && completed === total) {
      if (failed === 0) {
        notifications.update({
          id: retagNotifIdRef.current,
          title: 'Re-tagging complete',
          message: `Successfully tagged ${succeeded} template${succeeded === 1 ? '' : 's'}`,
          color: 'green',
          loading: false,
          autoClose: 5000,
          withCloseButton: true,
        })
      } else if (succeeded > 0) {
        notifications.update({
          id: retagNotifIdRef.current,
          title: 'Re-tagging partially complete',
          message: `${succeeded} succeeded, ${failed} failed`,
          color: 'yellow',
          loading: false,
          autoClose: 5000,
          withCloseButton: true,
        })
      } else {
        notifications.update({
          id: retagNotifIdRef.current,
          title: 'Re-tagging failed',
          message: `All ${failed} template${failed === 1 ? '' : 's'} failed`,
          color: 'red',
          loading: false,
          autoClose: 5000,
          withCloseButton: true,
        })
      }
      // Clear tracking
      setRetaggingIds(new Set())
      retagNotifIdRef.current = null
      retagTotalRef.current = 0
      seenInProcessingRef.current = new Set()
    } else {
      // Still in progress - show detailed status
      let statusText = ''
      if (waitingToStart > 0) {
        statusText = `Waiting for ${waitingToStart} to start...`
      } else if (ingesting > 0) {
        statusText = `Analyzing ${ingesting} image${ingesting === 1 ? '' : 's'}...`
      } else if (pending > 0) {
        statusText = `Queued: ${pending}`
      } else {
        statusText = 'Processing...'
      }

      notifications.update({
        id: retagNotifIdRef.current,
        title: `Tagging: ${completed}/${total} done`,
        message: statusText,
        loading: true,
        autoClose: false,
      })
    }
  }, [rows, retaggingIds])

  function toggleSelect(id: Id<'adTemplates'>) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function selectAll() {
    setSelectedIds(new Set(rows.map((r) => r._id)))
  }

  function deselectAll() {
    setSelectedIds(new Set())
  }

  function selectFailed() {
    setSelectedIds(new Set(rows.filter((r) => r.status === 'failed').map((r) => r._id)))
  }

  async function handleBulkDelete() {
    closeBulkDeleteModal()
    const ids = Array.from(selectedIds)
    let deleted = 0
    for (const id of ids) {
      try {
        await deleteMutation.mutateAsync({ id })
        deleted++
      } catch (err) {
        console.error(`Failed to delete ${id}:`, err)
      }
    }
    setSelectedIds(new Set())
    notifications.show({
      title: 'Templates deleted',
      message: `Deleted ${deleted} template${deleted === 1 ? '' : 's'}`,
      color: 'green',
    })
  }

  async function handleSingleDelete() {
    if (!templateToDelete) return
    closeDeleteModal()
    try {
      await deleteMutation.mutateAsync({ id: templateToDelete })
      notifications.show({
        title: 'Template deleted',
        message: 'Template has been removed',
        color: 'green',
      })
    } catch (err) {
      console.error(`Failed to delete ${templateToDelete}:`, err)
    }
    setTemplateToDelete(null)
  }

  async function retagSelected() {
    if (selectedIds.size === 0) return
    setIsRetagging(true)

    const idsToRetag = Array.from(selectedIds)
    const notifId = `retag-progress-${crypto.randomUUID()}`

    // Start tracking immediately before the mutation
    setRetaggingIds(new Set(idsToRetag))
    retagNotifIdRef.current = notifId
    retagTotalRef.current = idsToRetag.length
    seenInProcessingRef.current = new Set()  // Reset - track which templates enter processing

    notifications.show({
      id: notifId,
      title: `Tagging: 0/${idsToRetag.length} done`,
      message: `Queuing ${idsToRetag.length} template${idsToRetag.length === 1 ? '' : 's'}...`,
      loading: true,
      autoClose: false,
      withCloseButton: false,
    })

    try {
      const result = await retryBatchMutation.mutateAsync({ ids: idsToRetag })
      if (result.alreadyRunning > 0) {
        notifications.update({
          id: notifId,
          title: `Tagging: 0/${idsToRetag.length} done`,
          message: `${result.queued} queued, ${result.alreadyRunning} already in-flight…`,
          loading: true,
          autoClose: false,
        })
      }
      setSelectedIds(new Set())
    } catch (err) {
      notifications.update({
        id: notifId,
        title: 'Re-tag failed',
        message: err instanceof Error ? err.message : 'Failed to start re-tagging',
        color: 'red',
        loading: false,
        autoClose: 5000,
        withCloseButton: true,
      })
    } finally {
      setIsRetagging(false)
    }
  }

  if (pageStatus === 'LoadingFirstPage') {
    return (
      <Group justify="center" py={48}>
        <Loader size="md" color="brand" />
      </Group>
    )
  }

  if (rows.length === 0) {
    return (
      <Paper
        radius="lg"
        p={64}
        ta="center"
        withBorder
        style={{
          borderColor: 'var(--mantine-color-dark-5)',
          borderStyle: 'dashed',
          background: 'linear-gradient(180deg, rgba(84, 116, 180, 0.05) 0%, transparent 100%)',
        }}
      >
        <Text c="dark.2" size="lg">No templates yet. Drop some images above to seed the library.</Text>
      </Paper>
    )
  }

  return (
    <>
      {/* Bulk delete confirmation modal */}
      <Modal
        opened={bulkDeleteModalOpened}
        onClose={closeBulkDeleteModal}
        title="Delete templates?"
        centered
        styles={{
          header: { backgroundColor: 'var(--mantine-color-dark-7)' },
          body: { backgroundColor: 'var(--mantine-color-dark-7)' },
        }}
      >
        <Text size="sm" c="dark.1" mb="lg">
          Are you sure you want to delete {selectedIds.size} template{selectedIds.size === 1 ? '' : 's'}? This cannot be undone.
        </Text>
        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" color="gray" onClick={closeBulkDeleteModal}>
            Cancel
          </Button>
          <Button color="red" onClick={handleBulkDelete}>
            Delete {selectedIds.size} template{selectedIds.size === 1 ? '' : 's'}
          </Button>
        </Group>
      </Modal>

      {/* Single delete confirmation modal */}
      <Modal
        opened={deleteModalOpened}
        onClose={closeDeleteModal}
        title="Delete template?"
        centered
        styles={{
          header: { backgroundColor: 'var(--mantine-color-dark-7)' },
          body: { backgroundColor: 'var(--mantine-color-dark-7)' },
        }}
      >
        <Text size="sm" c="dark.1" mb="lg">
          Are you sure you want to delete this template? This cannot be undone.
        </Text>
        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" color="gray" onClick={closeDeleteModal}>
            Cancel
          </Button>
          <Button color="red" onClick={handleSingleDelete}>
            Delete
          </Button>
        </Group>
      </Modal>

      <Box>
      <Group justify="space-between" mb="md">
        <Title order={2} size="lg" fw={600} c="white">
          Library
        </Title>
        <Group gap="xs">
          {selectedIds.size > 0 && (
            <>
              <Badge size="md" variant="light" color="brand">
                {selectedIds.size} selected
              </Badge>
              <Button
                size="xs"
                variant="light"
                color="brand"
                leftSection={<IconRefresh size={14} />}
                onClick={retagSelected}
                loading={isRetagging}
              >
                Re-tag Selected
              </Button>
              <Button
                size="xs"
                variant="light"
                color="red"
                leftSection={<IconTrash size={14} />}
                onClick={openBulkDeleteModal}
              >
                Delete Selected
              </Button>
              <Button
                size="xs"
                variant="subtle"
                color="gray"
                leftSection={<IconX size={14} />}
                onClick={deselectAll}
              >
                Clear
              </Button>
            </>
          )}
          {selectedIds.size === 0 && (
            <>
              <Button size="xs" variant="subtle" color="gray" onClick={selectAll}>
                Select All
              </Button>
              {failedCount > 0 && (
                <Button size="xs" variant="light" color="red" onClick={selectFailed}>
                  Select Failed ({failedCount})
                </Button>
              )}
            </>
          )}
        </Group>
      </Group>
      <Box
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '1rem',
          alignItems: 'start',
        }}
      >
        {sortedRows.map((t: TemplateRow) => {
          const isSelected = selectedIds.has(t._id)
          return (
            <Paper
              key={t._id}
              radius="lg"
              withBorder
              style={{
                overflow: 'hidden',
                borderColor: isSelected ? 'var(--mantine-color-brand-5)' : 'var(--mantine-color-dark-5)',
                backgroundColor: 'var(--mantine-color-dark-7)',
                transition: 'border-color 200ms ease, box-shadow 200ms ease',
              }}
              styles={{
                root: {
                  '&:hover': {
                    borderColor: isSelected ? 'var(--mantine-color-brand-4)' : 'var(--mantine-color-dark-4)',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
                  },
                },
              }}
            >
              <AspectRatio ratio={getAspectRatioValue(t.aspectRatio)}>
                <Box pos="relative" bg="dark.6" w="100%" h="100%">
                  <Image src={t.thumbnailUrl} alt={`Template: ${t.aspectRatio}${t.productCategory ? ` - ${t.productCategory}` : ''}`} fit="cover" h="100%" w="100%" loading="lazy" />
                  <StatusBadge status={t.status} error={t.ingestError} />
                  {/* Selection checkbox */}
                  <Checkbox
                    checked={isSelected}
                    onChange={() => toggleSelect(t._id)}
                    pos="absolute"
                    top={8}
                    left={8}
                    size="sm"
                    aria-label={`Select template ${t.aspectRatio}`}
                    styles={{
                      input: {
                        backgroundColor: 'rgba(0, 0, 0, 0.6)',
                        borderColor: 'rgba(255, 255, 255, 0.5)',
                        cursor: 'pointer',
                      },
                    }}
                  />
                </Box>
              </AspectRatio>
              <Box p="md">
                {/* Dimensions row */}
                <Group gap={8} wrap="wrap" mb={8}>
                  <Text size="xs" c="dark.2">
                    {t.aspectRatio} · {t.width}×{t.height}
                  </Text>
                  {t.subcategory && (
                    <Badge size="xs" variant="outline" color="gray">
                      {t.subcategory}
                    </Badge>
                  )}
                </Group>
                {/* Structured tags - organized display */}
                {hasStructuredTags(t) ? (
                  <Group gap={4} wrap="wrap" mb={8}>
                    {t.productCategory && (
                      <Badge size="xs" variant="light" color={TAG_COLORS.productCategory} tt="capitalize">
                        {t.productCategory}
                      </Badge>
                    )}
                    {t.primaryColor && (
                      <Badge size="xs" variant="light" color={TAG_COLORS.primaryColor} tt="capitalize">
                        {t.primaryColor}
                      </Badge>
                    )}
                    {t.imageStyle && (
                      <Badge size="xs" variant="light" color={TAG_COLORS.imageStyle} tt="capitalize">
                        {t.imageStyle}
                      </Badge>
                    )}
                    {t.setting && (
                      <Badge size="xs" variant="light" color={TAG_COLORS.setting} tt="capitalize">
                        {t.setting}
                      </Badge>
                    )}
                    {t.composition && (
                      <Badge size="xs" variant="light" color={TAG_COLORS.composition} tt="capitalize">
                        {t.composition}
                      </Badge>
                    )}
                    {t.textAmount && (
                      <Badge size="xs" variant="light" color={TAG_COLORS.textAmount} tt="capitalize">
                        {t.textAmount}
                      </Badge>
                    )}
                  </Group>
                ) : hasLegacyTags(t) ? (
                  /* Legacy tags display for older templates */
                  <Group gap={4} wrap="wrap" mb={8}>
                    {t.category && (
                      <Badge size="xs" variant="light" color="gray" tt="uppercase">
                        {t.category}
                      </Badge>
                    )}
                    {t.sceneTypes?.map((s) => (
                      <Badge key={`s-${s}`} size="xs" variant="light" color="brand">
                        {s}
                      </Badge>
                    ))}
                    {t.moods?.map((m) => (
                      <Badge key={`m-${m}`} size="xs" variant="light" color="violet">
                        {m}
                      </Badge>
                    ))}
                  </Group>
                ) : null}
                {/* Show placeholder text for templates without tags */}
                {t.status === 'failed' && !hasStructuredTags(t) && !hasLegacyTags(t) && (
                  <Text size="xs" c="dark.4" fs="italic" mb={8}>
                    Tagging failed — click Re-tag to retry
                  </Text>
                )}
                {t.status === 'published' && !hasStructuredTags(t) && hasLegacyTags(t) && (
                  <Text size="xs" c="dark.4" fs="italic" mb={8}>
                    Legacy tags — re-tag for structured categories
                  </Text>
                )}
                <Group justify="flex-end" gap={8} mt={4}>
                  <Button
                    size="xs"
                    variant="light"
                    color="gray"
                    leftSection={<IconRefresh size={14} />}
                    onClick={() =>
                      retryMutation.mutate(
                        { id: t._id },
                        {
                          onSuccess: (result) => {
                            if (result?.skipped) {
                              notifications.show({
                                title: 'Already running',
                                message:
                                  'This template is already being analyzed — re-tag skipped.',
                                color: 'yellow',
                                autoClose: 3000,
                              })
                            }
                          },
                        },
                      )
                    }
                    loading={retryMutation.isPending}
                  >
                    Re-tag
                  </Button>
                  <Button
                    size="xs"
                    variant="light"
                    color="red"
                    leftSection={<IconTrash size={14} />}
                    onClick={() => {
                      setTemplateToDelete(t._id)
                      openDeleteModal()
                    }}
                    loading={deleteMutation.isPending}
                  >
                    Delete
                  </Button>
                </Group>
              </Box>
            </Paper>
          )
        })}
      </Box>
      {pageStatus !== 'Exhausted' && (
        <Group justify="center" mt="lg">
          <Button
            variant="light"
            color="brand"
            onClick={loadMore}
            loading={pageStatus === 'LoadingMore'}
          >
            Load more
          </Button>
        </Group>
      )}
    </Box>
    </>
  )
}

function StatusBadge({ status, error }: { status: TemplateRow['status']; error?: string }) {
  const config: Record<TemplateRow['status'], { color: string; icon: typeof IconCheck; label: string }> = {
    pending: { color: 'yellow', icon: IconClock, label: 'Pending' },
    ingesting: { color: 'blue', icon: IconLoader2, label: 'Ingesting' },
    published: { color: 'teal', icon: IconCheck, label: 'Published' },
    failed: { color: 'red', icon: IconAlertTriangle, label: 'Failed' },
  }
  const { color, icon: Icon, label } = config[status]
  const isAnimated = status === 'ingesting'

  const badge = (
    <Badge
      pos="absolute"
      top={8}
      right={8}
      size="xs"
      variant="filled"
      color={color}
      tt="uppercase"
      leftSection={<Icon size={10} style={isAnimated ? { animation: 'spin 1s linear infinite' } : undefined} />}
      style={{ cursor: status === 'failed' && error ? 'help' : 'default' }}
    >
      {label}
    </Badge>
  )

  // Wrap failed badge with tooltip showing error
  if (status === 'failed' && error) {
    return (
      <Tooltip
        label={error}
        multiline
        w={280}
        withArrow
        position="bottom"
        color="dark"
        events={{ hover: true, focus: true, touch: true }}
      >
        {badge}
      </Tooltip>
    )
  }

  return badge
}

function StatPill({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color?: string
}) {
  return (
    <Badge
      size="lg"
      variant="light"
      color={color || 'gray'}
      radius="lg"
      px="sm"
    >
      <Group gap={6}>
        <Text size="xs" c="dark.2">{label}</Text>
        <Text size="xs" fw={700}>{value}</Text>
      </Group>
    </Badge>
  )
}

/** Check if template has new structured tags */
function hasStructuredTags(t: TemplateRow): boolean {
  return !!(t.productCategory || t.primaryColor || t.imageStyle || t.setting || t.composition || t.textAmount)
}

/** Check if template has legacy tags (old system) */
function hasLegacyTags(t: TemplateRow): boolean {
  return !!(t.category || t.sceneTypes?.length || t.moods?.length)
}
