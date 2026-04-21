import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useAction } from 'convex/react'
import { useConvexMutation, convexQuery } from '@convex-dev/react-query'
import { useState } from 'react'
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
  Indicator,
  Chip,
} from '@mantine/core'
import { IconUpload, IconRefresh, IconTrash } from '@tabler/icons-react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

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
  category?: string
  subcategory?: string
  sceneTypes?: string[]
  moods?: string[]
  ingestError?: string
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

  async function handleFiles(files: FileList | File[] | null) {
    if (!files) return
    const list = Array.from(files)
    if (list.length === 0) return

    setInFlight((n) => n + list.length)
    let ok = 0
    let failed = 0

    await Promise.all(
      list.map(async (file) => {
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
          notifications.show({
            title: file.name,
            message: err instanceof Error ? err.message : 'Upload failed',
            color: 'red',
          })
        } finally {
          setInFlight((n) => n - 1)
        }
      }),
    )

    if (ok > 0) {
      notifications.show({
        title: 'Upload complete',
        message: `Uploaded ${ok} file${ok === 1 ? '' : 's'}`,
        color: 'green',
      })
    }
    if (failed === 0 && ok === 0) {
      notifications.show({
        title: 'Upload failed',
        message: 'No files uploaded',
        color: 'red',
      })
    }
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
  const retryMutation = useMutation({ mutationFn: useConvexMutation(api.templates.retryTemplateIngest) })
  const deleteMutation = useMutation({ mutationFn: useConvexMutation(api.templates.deleteTemplate) })

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
      <Title order={2} size="lg" fw={600} c="white" mb="md">
        Library
      </Title>
      <Box
        style={{
          columns: '3',
          columnGap: '1rem',
        }}
      >
        {rows
          .slice()
          .sort((a, b) => b._creationTime - a._creationTime)
          .map((t) => (
            <Paper
              key={t._id}
              radius="lg"
              withBorder
              mb="md"
              style={{
                breakInside: 'avoid',
                overflow: 'hidden',
                borderColor: 'var(--mantine-color-dark-5)',
                backgroundColor: 'var(--mantine-color-dark-7)',
                transition: 'border-color 200ms ease, box-shadow 200ms ease',
              }}
              styles={{
                root: {
                  '&:hover': {
                    borderColor: 'var(--mantine-color-dark-4)',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
                  },
                },
              }}
            >
              <AspectRatio ratio={getAspectRatioValue(t.aspectRatio)}>
                <Box pos="relative" bg="dark.6" w="100%" h="100%">
                  <Image src={t.thumbnailUrl} alt="" fit="cover" h="100%" w="100%" loading="lazy" />
                  <StatusBadge status={t.status} />
                </Box>
              </AspectRatio>
              <Box p="md">
                <Group gap={8} wrap="wrap" mb={8}>
                  {t.category && (
                    <Badge size="xs" variant="light" color="gray" tt="uppercase">
                      {t.category}
                    </Badge>
                  )}
                  {t.subcategory && (
                    <Badge size="xs" variant="light" color="gray">
                      {t.subcategory}
                    </Badge>
                  )}
                  <Text size="xs" c="dark.3">
                    {t.aspectRatio} · {t.width}×{t.height}
                  </Text>
                </Group>
                {(t.sceneTypes?.length || t.moods?.length) ? (
                  <Chip.Group multiple>
                    <Group gap={4} wrap="wrap" mb={8}>
                      {t.sceneTypes?.map((s) => (
                        <Chip
                          key={`s-${s}`}
                          size="xs"
                          variant="light"
                          color="brand"
                          checked={false}
                          styles={{
                            label: {
                              cursor: 'default',
                              paddingLeft: 8,
                              paddingRight: 8,
                            },
                          }}
                        >
                          {s}
                        </Chip>
                      ))}
                      {t.moods?.map((m) => (
                        <Chip
                          key={`m-${m}`}
                          size="xs"
                          variant="light"
                          color="violet"
                          checked={false}
                          styles={{
                            label: {
                              cursor: 'default',
                              paddingLeft: 8,
                              paddingRight: 8,
                            },
                          }}
                        >
                          {m}
                        </Chip>
                      ))}
                    </Group>
                  </Chip.Group>
                ) : null}
                {t.status === 'failed' && t.ingestError && (
                  <Text size="xs" c="red.7" lineClamp={2} mb={8}>
                    {t.ingestError}
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
          ))}
      </Box>
    </Box>
  )
}

function StatusBadge({ status }: { status: TemplateRow['status'] }) {
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
  return (
    <Badge
      pos="absolute"
      top={8}
      right={8}
      size="xs"
      variant="filled"
      color={colorMap[status]}
      tt="uppercase"
    >
      {labelMap[status]}
    </Badge>
  )
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
