import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useAction } from 'convex/react'
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
  Chip,
} from '@mantine/core'
import { IconUpload, IconRefresh, IconTrash, IconChecks, IconX } from '@tabler/icons-react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

// Batch upload settings
const UPLOAD_BATCH_SIZE = 3
const BATCH_DELAY_MS = 2000

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
  const { data: templates } = useQuery(
    convexQuery(api.templates.listAll, {}),
  ) as { data: TemplateRow[] | undefined }

  const rows = templates ?? []
  const counts = {
    total: rows.length,
    published: rows.filter((r) => r.status === 'published').length,
    pending: rows.filter((r) => r.status === 'pending' || r.status === 'ingesting').length,
    failed: rows.filter((r) => r.status === 'failed').length,
  }

  return (
    <Container size="lg" py={40}>
      <Paper
        radius="xl"
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
            <StatPill label="Total" value={counts.total} />
            <StatPill label="Published" value={counts.published} color="teal" />
            <StatPill label="Ingesting" value={counts.pending} color="brand" />
            <StatPill label="Failed" value={counts.failed} color="red" />
          </Group>
        </Group>
      </Paper>

      <UploadArea />

      <TemplatesTable rows={rows} />
    </Container>
  )
}

function UploadArea() {
  const uploadTemplate = useAction(api.r2.uploadTemplateImage)
  const createTemplate = useConvexMutation(api.templates.createTemplate)
  const [inFlight, setInFlight] = useState(0)
  const [dragging, setDragging] = useState(false)
  const notificationIdRef = useRef<string | null>(null)

  async function handleFiles(files: FileList | File[] | null) {
    if (!files) return
    const list = Array.from(files)
    if (list.length === 0) return

    const total = list.length
    let completed = 0
    let ok = 0
    let failed = 0

    setInFlight(total)

    // Show initial progress notification
    const notifId = `upload-progress-${Date.now()}`
    notificationIdRef.current = notifId
    notifications.show({
      id: notifId,
      title: 'Uploading templates',
      message: `Processing 0/${total}...`,
      loading: true,
      autoClose: false,
      withCloseButton: false,
    })

    // Process files in batches to avoid rate limiting
    const batches: File[][] = []
    for (let i = 0; i < list.length; i += UPLOAD_BATCH_SIZE) {
      batches.push(list.slice(i, i + UPLOAD_BATCH_SIZE))
    }

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex]

      // Process batch in parallel
      await Promise.all(
        batch.map(async (file) => {
          try {
            if (!file.type.startsWith('image/')) throw new Error('Not an image')
            if (file.size > 20 * 1024 * 1024) throw new Error('Over 20 MB')
            const { width, height } = await measureImage(file)
            const base64 = await fileToBase64(file)
            const upload = await uploadTemplate({
              name: file.name,
              contentType: file.type,
              base64,
              width,
              height,
            })
            await createTemplate({
              imageUrl: upload.imageUrl,
              thumbnailUrl: upload.thumbnailUrl,
              aspectRatio: upload.aspectRatio,
              width: upload.width,
              height: upload.height,
            })
            ok++
          } catch (err) {
            failed++
            console.error(`Upload failed for ${file.name}:`, err)
          } finally {
            completed++
            setInFlight(total - completed)
            // Update progress notification
            notifications.update({
              id: notifId,
              title: 'Uploading templates',
              message: `Processing ${completed}/${total}... (${ok} uploaded, ${failed} failed)`,
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

    // Show final notification
    if (failed === 0 && ok > 0) {
      notifications.update({
        id: notifId,
        title: 'Upload complete',
        message: `Successfully uploaded ${ok} template${ok === 1 ? '' : 's'}. Tagging in progress...`,
        color: 'green',
        loading: false,
        autoClose: 5000,
        withCloseButton: true,
      })
    } else if (ok > 0 && failed > 0) {
      notifications.update({
        id: notifId,
        title: 'Upload partially complete',
        message: `Uploaded ${ok} template${ok === 1 ? '' : 's'}, ${failed} failed. Tagging in progress...`,
        color: 'yellow',
        loading: false,
        autoClose: 5000,
        withCloseButton: true,
      })
    } else {
      notifications.update({
        id: notifId,
        title: 'Upload failed',
        message: `All ${total} uploads failed`,
        color: 'red',
        loading: false,
        autoClose: 5000,
        withCloseButton: true,
      })
    }

    notificationIdRef.current = null
  }

  return (
    <Paper
      component="label"
      radius="xl"
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
        radius="xl"
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
        Multiple images OK. 1:1, 4:5, 9:16, or 16:9 (±5%). Up to 20 MB each.
      </Text>
    </Paper>
  )
}

function measureImage(file: File): Promise<{ width: number; height: number }> {
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

function TemplatesTable({ rows }: { rows: TemplateRow[] }) {
  const [selectedIds, setSelectedIds] = useState<Set<Id<'adTemplates'>>>(new Set())
  const [isRetagging, setIsRetagging] = useState(false)

  // Track templates being retagged for progress notification
  const [retaggingIds, setRetaggingIds] = useState<Set<Id<'adTemplates'>>>(new Set())
  const retagNotifIdRef = useRef<string | null>(null)
  const retagTotalRef = useRef<number>(0)

  const retryMutation = useMutation({ mutationFn: useConvexMutation(api.templates.retryTemplateIngest) })
  const retryBatchMutation = useMutation({ mutationFn: useConvexMutation(api.templates.retryTemplatesBatch) })
  const deleteMutation = useMutation({ mutationFn: useConvexMutation(api.templates.deleteTemplate) })

  const sortedRows = rows.slice().sort((a, b) => b._creationTime - a._creationTime)
  const failedCount = rows.filter((r) => r.status === 'failed').length

  // Track retagging progress and update notification
  useEffect(() => {
    if (retaggingIds.size === 0 || !retagNotifIdRef.current) return

    // Count status of tracked templates
    const tracked = rows.filter((r) => retaggingIds.has(r._id))
    const total = retagTotalRef.current

    // Detailed status breakdown
    const ingesting = tracked.filter((r) => r.status === 'ingesting').length
    const pending = tracked.filter((r) => r.status === 'pending').length
    const succeeded = tracked.filter((r) => r.status === 'published').length
    const failed = tracked.filter((r) => r.status === 'failed').length
    const completed = succeeded + failed
    const processing = ingesting + pending

    // All done?
    if (processing === 0 && completed === total) {
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
    } else {
      // Still in progress - show detailed status
      let statusText = ''
      if (ingesting > 0) {
        statusText = `Analyzing ${ingesting} image${ingesting === 1 ? '' : 's'}...`
      } else if (pending > 0) {
        statusText = `Queued: ${pending}`
      }

      notifications.update({
        id: retagNotifIdRef.current,
        title: `Tagging: ${completed}/${total} done`,
        message: statusText || 'Processing...',
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

  async function retagSelected() {
    if (selectedIds.size === 0) return
    setIsRetagging(true)

    const idsToRetag = Array.from(selectedIds)
    const notifId = `retag-progress-${Date.now()}`

    // Start tracking immediately before the mutation
    setRetaggingIds(new Set(idsToRetag))
    retagNotifIdRef.current = notifId
    retagTotalRef.current = idsToRetag.length

    notifications.show({
      id: notifId,
      title: `Tagging: 0/${idsToRetag.length} done`,
      message: `Queuing ${idsToRetag.length} template${idsToRetag.length === 1 ? '' : 's'}...`,
      loading: true,
      autoClose: false,
      withCloseButton: false,
    })

    try {
      await retryBatchMutation.mutateAsync({ ids: idsToRetag })

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

  if (rows.length === 0) {
    return (
      <Paper
        radius="xl"
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
          columns: '3',
          columnGap: '1rem',
        }}
      >
        {sortedRows.map((t) => {
          const isSelected = selectedIds.has(t._id)
          return (
            <Paper
              key={t._id}
              radius="lg"
              withBorder
              mb="md"
              style={{
                breakInside: 'avoid',
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
                  <Image src={t.thumbnailUrl} alt="" fit="cover" h="100%" w="100%" loading="lazy" />
                  <StatusBadge status={t.status} error={t.ingestError} />
                  {/* Selection checkbox */}
                  <Checkbox
                    checked={isSelected}
                    onChange={() => toggleSelect(t._id)}
                    pos="absolute"
                    top={8}
                    left={8}
                    size="sm"
                    styles={{
                      input: {
                        backgroundColor: 'rgba(0, 0, 0, 0.6)',
                        borderColor: 'rgba(255, 255, 255, 0.3)',
                        cursor: 'pointer',
                      },
                    }}
                  />
                </Box>
              </AspectRatio>
              <Box p="md">
                {/* Dimensions row */}
                <Group gap={8} wrap="wrap" mb={8}>
                  <Text size="xs" c="dark.3">
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
                    onClick={() => retryMutation.mutate({ id: t._id })}
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
                      if (confirm('Delete this template?')) deleteMutation.mutate({ id: t._id })
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
    </Box>
  )
}

function StatusBadge({ status, error }: { status: TemplateRow['status']; error?: string }) {
  const colorMap: Record<TemplateRow['status'], string> = {
    pending: 'yellow',
    ingesting: 'blue',
    published: 'teal',
    failed: 'red',
  }
  const labelMap: Record<TemplateRow['status'], string> = {
    pending: 'Pending',
    ingesting: 'Ingesting',
    published: 'Published',
    failed: 'Failed',
  }

  const badge = (
    <Badge
      pos="absolute"
      top={8}
      right={8}
      size="xs"
      variant="filled"
      color={colorMap[status]}
      tt="uppercase"
      style={{ cursor: status === 'failed' && error ? 'help' : 'default' }}
    >
      {labelMap[status]}
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
      radius="xl"
      px="sm"
    >
      <Group gap={6}>
        <Text size="xs" c="dark.2">{label}</Text>
        <Text size="xs" fw={700}>{value}</Text>
      </Group>
    </Badge>
  )
}

function getAspectRatioValue(ar: string): number {
  switch (ar) {
    case '1:1': return 1
    case '4:5': return 4 / 5
    case '9:16': return 9 / 16
    case '16:9': return 16 / 9
    default: return 1
  }
}

/** Check if template has new structured tags */
function hasStructuredTags(t: TemplateRow): boolean {
  return !!(t.productCategory || t.primaryColor || t.imageStyle || t.setting || t.composition || t.textAmount)
}

/** Check if template has legacy tags (old system) */
function hasLegacyTags(t: TemplateRow): boolean {
  return !!(t.category || t.sceneTypes?.length || t.moods?.length)
}
