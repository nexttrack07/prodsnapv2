import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useRef, useCallback, useEffect } from 'react'
import { useQuery as useConvexQuery, useMutation as useConvexMutationHook } from 'convex/react'
import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { useConvex } from 'convex/react'
import { useMediaQuery } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { Masonry } from 'masonic'
import {
  ActionIcon,
  AspectRatio,
  Badge,
  Box,
  Button,
  Center,
  Container,
  Drawer,
  Group,
  Image,
  Loader,
  Menu,
  Modal,
  Paper,
  Select,
  Skeleton,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core'
import {
  IconSearch,
  IconX,
  IconSparkles,
  IconArrowLeft,
  IconArrowRight,
  IconBookmark,
  IconBookmarkFilled,
  IconCheck,
  IconDownload,
  IconPhoto,
  IconUpload,
  IconTrash,
  IconEye,
  IconEyeOff,
  IconClock,
} from '@tabler/icons-react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { capitalizeWords } from '../utils/strings'
import { useCustomTemplateUpload } from '../utils/customTemplateUpload'
import { TemplateBrowser } from '../components/templates/TemplateBrowser'

type TemplatesSearch = { preview?: string }

// Shared shape for the preview/use drawer. Browse templates carry the full
// metadata; custom "My Templates" uploads only carry the core fields, so every
// metadata field is optional.
type DrawerTemplate = {
  _id: Id<'adTemplates'>
  imageUrl: string
  thumbnailUrl: string
  aspectRatio: string
  name?: string
  productCategory?: string
  imageStyle?: string
  setting?: string
  composition?: string
  angleType?: string
}

export const Route = createFileRoute('/templates')({
  validateSearch: (search: Record<string, unknown>): TemplatesSearch => {
    if (typeof search.preview === 'string' && search.preview.length > 0) {
      return { preview: search.preview }
    }
    return {}
  },
  component: TemplatesBrowsePage,
})

const ANGLE_TYPE_META: Record<string, { color: string; label: string }> = {
  comparison: { color: 'blue', label: 'Comparison' },
  'curiosity-narrative': { color: 'grape', label: 'Curiosity' },
  'social-proof': { color: 'lime', label: 'Social proof' },
  'problem-callout': { color: 'orange', label: 'Problem callout' },
}

function angleTypeColor(type: string): string {
  return ANGLE_TYPE_META[type]?.color ?? 'gray'
}

function angleTypeLabel(type: string): string {
  return ANGLE_TYPE_META[type]?.label ?? type
}

function getAspectRatioValue(ar?: string): number {
  switch (ar) {
    case '4:5':
      return 4 / 5
    case '9:16':
      return 9 / 16
    case '16:9':
      return 16 / 9
    default:
      return 1
  }
}

function TemplatesBrowsePage() {
  const [activeTab, setActiveTab] = useState<string | null>('browse')
  const isMobile = useMediaQuery('(max-width: 768px)')
  const navigate = useNavigate()
  const convex = useConvex()

  // ── Bookmark / saves state ────────────────────────────────────────────────
  const products = useConvexQuery(api.products.listProducts, {})
  const savesData = useConvexQuery(api.productInspirations.listMyTemplateSaves, {})
  const saveTemplateMutation = useConvexMutationHook(api.productInspirations.saveTemplateAsInspiration)
  const removeInspirationMutation = useConvexMutationHook(api.productInspirations.removeInspiration)

  // Build a map: templateId -> array of { productId, inspirationId }
  const savedTemplateMap = new Map<
    string,
    Array<{ productId: Id<'products'>; inspirationId: Id<'productInspirations'> }>
  >()
  for (const save of savesData?.saves ?? []) {
    const arr = savedTemplateMap.get(save.templateId as string) ?? []
    arr.push({ productId: save.productId, inspirationId: save.inspirationId })
    savedTemplateMap.set(save.templateId as string, arr)
  }

  // Optimistic state: track pending saves/removes to show instant feedback
  const [optimisticSaves, setOptimisticSaves] = useState<
    Set<string> // "templateId:productId"
  >(new Set())
  const [optimisticRemoves, setOptimisticRemoves] = useState<
    Set<string>
  >(new Set())

  function isTemplateSavedToProduct(
    templateId: Id<'adTemplates'>,
    productId: Id<'products'>,
  ): boolean {
    const key = `${templateId}:${productId}`
    if (optimisticRemoves.has(key)) return false
    if (optimisticSaves.has(key)) return true
    const saves = savedTemplateMap.get(templateId as string) ?? []
    return saves.some((s) => s.productId === productId)
  }

  function isTemplateSavedAnywhere(templateId: Id<'adTemplates'>): boolean {
    // Check optimistic state
    for (const key of optimisticSaves) {
      if (key.startsWith(`${templateId}:`)) return true
    }
    const saves = savedTemplateMap.get(templateId as string) ?? []
    const nonRemoved = saves.filter(
      (s) => !optimisticRemoves.has(`${templateId}:${s.productId}`),
    )
    return nonRemoved.length > 0
  }

  async function handleToggleSave(
    templateId: Id<'adTemplates'>,
    productId: Id<'products'>,
    productName: string,
  ) {
    const key = `${templateId}:${productId}`
    const isSaved = isTemplateSavedToProduct(templateId, productId)

    if (isSaved) {
      // Remove — find the inspirationId
      const saves = savedTemplateMap.get(templateId as string) ?? []
      const existing = saves.find((s) => s.productId === productId)
      if (!existing) return
      setOptimisticRemoves((prev) => new Set(prev).add(key))
      try {
        await removeInspirationMutation({ inspirationId: existing.inspirationId })
        notifications.show({ message: `Removed from ${productName}`, color: 'gray', autoClose: 3000 })
      } catch {
        notifications.show({ title: 'Error', message: 'Failed to remove', color: 'red' })
      } finally {
        setOptimisticRemoves((prev) => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
      }
    } else {
      // Save
      setOptimisticSaves((prev) => new Set(prev).add(key))
      try {
        await saveTemplateMutation({ productId, templateId })
        notifications.show({ message: `Saved to ${productName}`, color: 'green', autoClose: 3000 })
      } catch {
        notifications.show({ title: 'Error', message: 'Failed to save', color: 'red' })
      } finally {
        setOptimisticSaves((prev) => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
      }
    }
  }

  // ── Preview / use drawer ─────────────────────────────────────────────────
  const [previewTemplate, setPreviewTemplate] = useState<DrawerTemplate | null>(
    null,
  )

  // Auto-open preview when arriving with ?preview=<templateId> (e.g. from the
  // home "Start from a proven format" shelf). Fetch the template by id directly
  // rather than scanning the loaded browse pages — the home shelf and the
  // browse grid use different queries/orderings, so the clicked template often
  // isn't in the first page and the preview would silently never open.
  const { preview: previewIdFromUrl } = Route.useSearch()
  const previewedById = useConvexQuery(
    api.templates.getViewableById,
    previewIdFromUrl
      ? { id: previewIdFromUrl as Id<'adTemplates'> }
      : 'skip',
  )
  const lastConsumedPreviewId = useRef<string | null>(null)
  useEffect(() => {
    if (!previewIdFromUrl) {
      // URL cleared (e.g. drawer closed) — allow the same id to re-open later.
      lastConsumedPreviewId.current = null
      return
    }
    if (lastConsumedPreviewId.current === previewIdFromUrl) return
    if (previewedById) {
      setPreviewTemplate(previewedById)
      lastConsumedPreviewId.current = previewIdFromUrl
    }
  }, [previewIdFromUrl, previewedById])

  return (
    <Container size="xl" py="md">
      {/* Header */}
      <Group justify="space-between" align="flex-end" mb="lg" wrap="wrap" gap="md">
        <Box>
          <Title order={1} fz="xl" fw={600} c="white">
            Templates
          </Title>
          <Text size="sm" c="dark.2">
            {activeTab === 'browse'
              ? 'Hand-picked, high-performing ad templates from real brands'
              : 'Your uploaded templates'}
          </Text>
        </Box>
      </Group>

      {/* Tab switcher */}
      <Tabs
        value={activeTab}
        onChange={setActiveTab}
        mb="lg"
        styles={{
          tab: {
            color: 'var(--mantine-color-dark-2)',
            '&[data-active]': {
              color: 'white',
              borderColor: 'var(--mantine-color-brand-5)',
            },
          },
          list: {
            borderBottom: '1px solid var(--mantine-color-dark-6)',
          },
        }}
      >
        <Tabs.List>
          <Tabs.Tab value="browse" leftSection={<IconPhoto size={14} />}>
            Browse
          </Tabs.Tab>
          <Tabs.Tab value="my-templates" leftSection={<IconUpload size={14} />}>
            My Templates
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="browse" pt="lg">
          <TemplateBrowser
            renderItem={(t) => (
              <TemplateTile
                template={t}
                onClick={() => setPreviewTemplate(t)}
                isSaved={isTemplateSavedAnywhere(t._id)}
                products={products ?? []}
                isTemplateSavedToProduct={isTemplateSavedToProduct}
                onToggleSave={handleToggleSave}
              />
            )}
          />
        </Tabs.Panel>

        <Tabs.Panel value="my-templates" pt="lg">
          <MyTemplatesPanel
            isMobile={!!isMobile}
            onUseTemplate={setPreviewTemplate}
          />
        </Tabs.Panel>
      </Tabs>

      {/* Preview / use drawer — slides in from the right (Jira/Slack style) and
          holds the "use this template" flow as an inline wizard. */}
      <TemplateDrawer
        template={previewTemplate}
        onClose={() => {
          setPreviewTemplate(null)
          // Strip ?preview=<id> so re-clicking the same tile from home
          // remounts cleanly and the auto-open effect fires again.
          if (previewIdFromUrl) {
            navigate({ to: '/templates', search: {}, replace: true })
          }
        }}
        onSelectProduct={(productId) => {
          const tpl = previewTemplate
          setPreviewTemplate(null)
          if (!tpl) return
          navigate({
            to: '/studio/$productId',
            params: { productId },
            search: { compose: 'true', template: tpl._id },
          })
        }}
      />
    </Container>
  )
}

// ── My Templates Panel ───────────────────────────────────────────────────────

type CustomTemplate = {
  _id: Id<'adTemplates'>
  _creationTime: number
  imageUrl: string
  thumbnailUrl: string
  name?: string
  aspectRatio: '1:1' | '4:5' | '9:16' | '16:9'
  visibility: 'private' | 'pending' | 'public'
  status: string
  ownerUserId: string
  width: number
  height: number
}

function MyTemplatesPanel({
  isMobile,
  onUseTemplate,
}: {
  isMobile: boolean
  onUseTemplate: (template: DrawerTemplate) => void
}) {
  const [uploadName, setUploadName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Id<'adTemplates'> | null>(null)
  const [pendingAction, setPendingAction] = useState<Id<'adTemplates'> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const myTemplates = useConvexQuery(
    api.customTemplates.listMyCustomTemplates,
    {},
  ) as CustomTemplate[] | undefined

  const { uploadCustomTemplate, isUploading } = useCustomTemplateUpload()

  const requestPublic = useConvexMutationHook(
    api.customTemplates.requestPublicTemplate,
  )
  const makePrivate = useConvexMutationHook(
    api.customTemplates.makeTemplatePrivate,
  )
  const deleteTemplate = useConvexMutationHook(
    api.customTemplates.deleteCustomTemplate,
  )

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset so the same file can be re-selected after an error
    e.target.value = ''
    try {
      await uploadCustomTemplate(file, uploadName)
      notifications.show({
        title: 'Template uploaded',
        message: 'Your template has been saved.',
        color: 'green',
        autoClose: 4000,
      })
      setUploadName('')
    } catch (err) {
      notifications.show({
        title: 'Upload failed',
        message: err instanceof Error ? err.message : 'Something went wrong.',
        color: 'red',
        autoClose: 6000,
      })
    }
  }

  async function handleRequestPublic(templateId: Id<'adTemplates'>) {
    setPendingAction(templateId)
    try {
      await requestPublic({ templateId })
      notifications.show({
        title: 'Request submitted',
        message: 'An admin will review your template before it goes public.',
        color: 'yellow',
        autoClose: 5000,
      })
    } catch (err) {
      notifications.show({
        title: 'Error',
        message: err instanceof Error ? err.message : 'Something went wrong.',
        color: 'red',
      })
    } finally {
      setPendingAction(null)
    }
  }

  async function handleMakePrivate(templateId: Id<'adTemplates'>) {
    setPendingAction(templateId)
    try {
      await makePrivate({ templateId })
      notifications.show({
        message: 'Template set to private.',
        color: 'gray',
        autoClose: 3000,
      })
    } catch (err) {
      notifications.show({
        title: 'Error',
        message: err instanceof Error ? err.message : 'Something went wrong.',
        color: 'red',
      })
    } finally {
      setPendingAction(null)
    }
  }

  async function handleDelete(templateId: Id<'adTemplates'>) {
    setPendingAction(templateId)
    try {
      await deleteTemplate({ templateId })
      notifications.show({
        message: 'Template deleted.',
        color: 'gray',
        autoClose: 3000,
      })
    } catch (err) {
      notifications.show({
        title: 'Error',
        message: err instanceof Error ? err.message : 'Something went wrong.',
        color: 'red',
      })
    } finally {
      setPendingAction(null)
      setDeleteTarget(null)
    }
  }

  function visibilityBadge(visibility: CustomTemplate['visibility']) {
    if (visibility === 'public') {
      return (
        <Badge size="xs" color="green" variant="light" leftSection={<IconEye size={10} />}>
          Public
        </Badge>
      )
    }
    if (visibility === 'pending') {
      return (
        <Badge size="xs" color="yellow" variant="light" leftSection={<IconClock size={10} />}>
          Pending review
        </Badge>
      )
    }
    return (
      <Badge size="xs" color="gray" variant="light" leftSection={<IconEyeOff size={10} />}>
        Private
      </Badge>
    )
  }

  return (
    <>
      {/* Upload control */}
      <Paper
        radius="md"
        p="md"
        mb="lg"
        style={{
          border: '1px solid var(--mantine-color-dark-6)',
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        <Stack gap="sm">
          <Text size="sm" fw={500} c="white">
            Upload a template
          </Text>
          <Group gap="sm" wrap="wrap" align="flex-end">
            <TextInput
              placeholder="Template name (optional)"
              value={uploadName}
              onChange={(e) => setUploadName(e.currentTarget.value)}
              size="sm"
              style={{ flex: 1, minWidth: 180 }}
            />
            <Button
              size="sm"
              leftSection={<IconUpload size={14} />}
              loading={isUploading}
              onClick={() => fileInputRef.current?.click()}
            >
              Choose image
            </Button>
          </Group>
          <Text size="xs" c="dark.3">
            Accepted: JPEG, PNG, WebP · Max 20 MB
          </Text>
        </Stack>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          style={{ display: 'none' }}
          onChange={handleFileChosen}
        />
      </Paper>

      {/* Grid */}
      {myTemplates === undefined ? (
        <Box
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
            gap: 12,
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} h={200} radius="sm" />
          ))}
        </Box>
      ) : myTemplates.length === 0 ? (
        <Paper
          radius="lg"
          p={60}
          ta="center"
          withBorder
          style={{
            borderStyle: 'dashed',
            borderWidth: 2,
            borderColor: 'var(--mantine-color-dark-5)',
            background:
              'linear-gradient(135deg, rgba(84, 116, 180, 0.05) 0%, rgba(0, 0, 0, 0) 60%)',
          }}
        >
          <IconPhoto size={32} color="var(--mantine-color-dark-3)" />
          <Text size="lg" fw={500} c="dark.1" mt="sm" mb="xs">
            No custom templates yet
          </Text>
          <Text size="sm" c="dark.3">
            Upload your own ad as a template to generate from it.
          </Text>
        </Paper>
      ) : (
        <Box
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile
              ? 'repeat(2, 1fr)'
              : 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 12,
          }}
        >
          {myTemplates.map((t) => {
            const aspectRatioCss =
              t.aspectRatio === '4:5'
                ? '4/5'
                : t.aspectRatio === '9:16'
                  ? '9/16'
                  : t.aspectRatio === '16:9'
                    ? '16/9'
                    : '1/1'
            const isActing = pendingAction === t._id

            return (
              <Paper
                key={t._id}
                radius="sm"
                style={{
                  overflow: 'hidden',
                  border: '1px solid var(--mantine-color-dark-6)',
                  backgroundColor: 'var(--mantine-color-dark-7)',
                }}
              >
                <UnstyledButton
                  onClick={() => onUseTemplate(t)}
                  w="100%"
                  style={{ display: 'block' }}
                  aria-label={`Use ${t.name ?? 'template'}`}
                >
                  <Box style={{ aspectRatio: aspectRatioCss, position: 'relative' }}>
                    <Image
                      src={t.thumbnailUrl}
                      alt={t.name ?? 'Custom template'}
                      fit="cover"
                      h="100%"
                      w="100%"
                      style={{ display: 'block' }}
                    />
                  </Box>
                </UnstyledButton>
                <Box p="xs">
                  <Group justify="space-between" align="center" gap="xs" wrap="nowrap">
                    <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                      <Text size="xs" fw={500} c="white" lineClamp={1}>
                        {t.name ?? 'Untitled'}
                      </Text>
                      {visibilityBadge(t.visibility)}
                    </Stack>
                    <Menu shadow="md" width={200} position="bottom-end" withinPortal>
                      <Menu.Target>
                        <Button
                          size="compact-xs"
                          variant="subtle"
                          color="gray"
                          loading={isActing}
                          px={6}
                        >
                          •••
                        </Button>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item
                          leftSection={<IconSparkles size={14} />}
                          onClick={() => onUseTemplate(t)}
                        >
                          Use this template
                        </Menu.Item>
                        <Menu.Divider />
                        {t.visibility === 'private' && (
                          <Menu.Item
                            leftSection={<IconEye size={14} />}
                            onClick={() => handleRequestPublic(t._id)}
                          >
                            Request to publicize
                          </Menu.Item>
                        )}
                        {t.visibility === 'pending' && (
                          <Menu.Item
                            leftSection={<IconEyeOff size={14} />}
                            onClick={() => handleMakePrivate(t._id)}
                          >
                            Withdraw request
                          </Menu.Item>
                        )}
                        {t.visibility === 'public' && (
                          <Menu.Item
                            leftSection={<IconEyeOff size={14} />}
                            onClick={() => handleMakePrivate(t._id)}
                          >
                            Make private
                          </Menu.Item>
                        )}
                        <Menu.Divider />
                        <Menu.Item
                          color="red"
                          leftSection={<IconTrash size={14} />}
                          onClick={() => setDeleteTarget(t._id)}
                        >
                          Delete
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Group>
                </Box>
              </Paper>
            )
          })}
        </Box>
      )}

      {/* Delete confirm modal */}
      <Modal
        opened={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete template?"
        size="sm"
        centered
        radius="md"
      >
        <Stack gap="md">
          <Text size="sm" c="dark.1">
            This will permanently delete the template and its stored image. This cannot be undone.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="subtle" color="gray" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={pendingAction === deleteTarget}
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}

// ── Template Tile ────────────────────────────────────────────────────────────

function TemplateTile({
  template,
  onClick,
  isSaved,
  products,
  isTemplateSavedToProduct,
  onToggleSave,
}: {
  template: {
    _id: Id<'adTemplates'>
    imageUrl: string
    thumbnailUrl: string
    aspectRatio: string
    productCategory?: string
    angleType?: string
  }
  onClick: () => void
  isSaved: boolean
  products: Array<{ _id: Id<'products'>; name: string; imageUrl?: string; category?: string }>
  isTemplateSavedToProduct: (
    templateId: Id<'adTemplates'>,
    productId: Id<'products'>,
  ) => boolean
  onToggleSave: (
    templateId: Id<'adTemplates'>,
    productId: Id<'products'>,
    productName: string,
  ) => void
}) {
  const navigate = useNavigate()

  const aspectRatioCss =
    template.aspectRatio === '4:5'
      ? '4/5'
      : template.aspectRatio === '9:16'
        ? '9/16'
        : '1/1'

  // Download the full-resolution template via fetch+blob so we get a real
  // file save (rather than the browser opening the R2 URL inline). Uses the
  // R2 public URL — works because the bucket has public-read.
  async function handleDownload(e: React.MouseEvent) {
    e.stopPropagation()
    try {
      const res = await fetch(template.imageUrl)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/jpeg' ? 'jpg' : 'png'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `template-${template._id}.${ext}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Template download failed:', err)
      notifications.show({
        title: 'Download failed',
        message: "Couldn't download that template. Please try again.",
        color: 'red',
      })
    }
  }

  return (
    <Box pos="relative">
      <UnstyledButton
        onClick={onClick}
        w="100%"
        style={{
          borderRadius: 'var(--mantine-radius-sm)',
          overflow: 'hidden',
          backgroundColor: 'var(--mantine-color-dark-7)',
          display: 'block',
          transition: 'transform 150ms ease',
        }}
      >
        <Box style={{ aspectRatio: aspectRatioCss }}>
          <Image
            src={template.thumbnailUrl}
            alt="Template"
            fit="cover"
            h="100%"
            w="100%"
            style={{ display: 'block' }}
          />
        </Box>
      </UnstyledButton>

      {/* Download icon — top-right, next to bookmark */}
      <UnstyledButton
        pos="absolute"
        top={8}
        right={48}
        onClick={handleDownload}
        style={{
          zIndex: 2,
          width: 32,
          height: 32,
          borderRadius: '50%',
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 120ms ease, background-color 120ms ease',
          cursor: 'pointer',
        }}
        aria-label="Download template"
      >
        <IconDownload size={16} color="white" />
      </UnstyledButton>

      {/* Bookmark icon — top-right corner */}
      <Menu shadow="md" width={220} position="bottom-end" withinPortal>
        <Menu.Target>
          <UnstyledButton
            pos="absolute"
            top={8}
            right={8}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            style={{
              zIndex: 2,
              width: 32,
              height: 32,
              borderRadius: '50%',
              backgroundColor: 'rgba(0, 0, 0, 0.55)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'transform 120ms ease, background-color 120ms ease',
              cursor: 'pointer',
            }}
            aria-label="Save to product"
          >
            {isSaved ? (
              <IconBookmarkFilled size={16} color="var(--mantine-color-brand-4)" />
            ) : (
              <IconBookmark size={16} color="white" />
            )}
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>Save to product</Menu.Label>
          {products.length === 0 ? (
            <Menu.Item
              leftSection={<IconArrowRight size={14} />}
              onClick={() => navigate({ to: '/home' })}
            >
              Add a product first
            </Menu.Item>
          ) : (
            products.map((p) => {
              const saved = isTemplateSavedToProduct(template._id, p._id)
              return (
                <Menu.Item
                  key={p._id}
                  leftSection={
                    saved ? (
                      <IconCheck size={14} color="var(--mantine-color-green-5)" />
                    ) : undefined
                  }
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation()
                    onToggleSave(template._id, p._id, p.name)
                  }}
                >
                  <Text size="sm" fw={saved ? 600 : 400} lineClamp={1}>
                    {saved ? `Saved to ${p.name}` : `Save to ${p.name}`}
                  </Text>
                </Menu.Item>
              )
            })
          )}
        </Menu.Dropdown>
      </Menu>
    </Box>
  )
}

// ── Template Drawer (preview → choose product wizard) ───────────────────────

function TemplateDrawer({
  template,
  onClose,
  onSelectProduct,
}: {
  template: DrawerTemplate | null
  onClose: () => void
  onSelectProduct: (productId: string) => void
}) {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [step, setStep] = useState<'preview' | 'product'>('preview')

  // Reset to the first step whenever a different template is opened (or the
  // drawer is closed), so re-opening never lands mid-wizard.
  useEffect(() => {
    setStep('preview')
  }, [template?._id])

  return (
    <Drawer
      opened={!!template}
      onClose={onClose}
      position="right"
      size={isMobile ? '100%' : 460}
      title={
        step === 'product' ? (
          <Group gap="xs">
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={() => setStep('preview')}
              aria-label="Back to preview"
            >
              <IconArrowLeft size={18} />
            </ActionIcon>
            <Text fw={600}>Choose a product</Text>
          </Group>
        ) : (
          <Text fw={600}>Template preview</Text>
        )
      }
      styles={{ body: { padding: 'var(--mantine-spacing-md)' } }}
    >
      {template &&
        (step === 'preview' ? (
          <TemplatePreviewStep
            template={template}
            onUseTemplate={() => setStep('product')}
          />
        ) : (
          <ProductPickerStep
            template={template}
            onSelectProduct={onSelectProduct}
          />
        ))}
    </Drawer>
  )
}

function TemplatePreviewStep({
  template,
  onUseTemplate,
}: {
  template: DrawerTemplate
  onUseTemplate: () => void
}) {
  return (
    <Stack gap="md">
      <Box
        style={{
          borderRadius: 'var(--mantine-radius-md)',
          overflow: 'hidden',
          border: '1px solid var(--mantine-color-dark-5)',
        }}
      >
        <AspectRatio ratio={getAspectRatioValue(template.aspectRatio)}>
          <Image
            src={template.imageUrl}
            alt="Template preview"
            fit="contain"
            style={{ display: 'block' }}
          />
        </AspectRatio>
      </Box>

      {template.name && (
        <Text fw={600} c="white">
          {template.name}
        </Text>
      )}

      {/* Metadata */}
      <Group gap="xs" wrap="wrap">
        {template.productCategory && (
          <Badge variant="light" color="gray" size="sm">
            {capitalizeWords(template.productCategory)}
          </Badge>
        )}
        {template.imageStyle && (
          <Badge variant="light" color="teal" size="sm">
            {capitalizeWords(template.imageStyle)}
          </Badge>
        )}
        {template.setting && (
          <Badge variant="light" color="indigo" size="sm">
            {capitalizeWords(template.setting)}
          </Badge>
        )}
        {template.composition && (
          <Badge variant="light" color="violet" size="sm">
            {capitalizeWords(template.composition)}
          </Badge>
        )}
        {template.angleType && (
          <Badge
            variant="light"
            color={angleTypeColor(template.angleType)}
            size="sm"
          >
            {angleTypeLabel(template.angleType)}
          </Badge>
        )}
        <Badge variant="light" color="brand" size="sm">
          {template.aspectRatio}
        </Badge>
      </Group>

      <Button
        fullWidth
        size="md"
        color="brand"
        leftSection={<IconSparkles size={18} />}
        onClick={onUseTemplate}
      >
        Use this template
      </Button>
    </Stack>
  )
}

function ProductPickerStep({
  template,
  onSelectProduct,
}: {
  template: DrawerTemplate
  onSelectProduct: (productId: string) => void
}) {
  const products = useConvexQuery(api.products.listProducts, {})

  return (
    <Stack gap="md">
      {/* Wizard context — which template we're generating from */}
      <Group gap="sm" wrap="nowrap" align="center">
        <Box
          w={40}
          h={40}
          style={{
            borderRadius: 6,
            overflow: 'hidden',
            flexShrink: 0,
            border: '1px solid var(--mantine-color-dark-5)',
          }}
        >
          <Image src={template.thumbnailUrl} alt="" fit="cover" w={40} h={40} />
        </Box>
        <Text size="sm" c="dark.1">
          Pick the product to generate from this template.
        </Text>
      </Group>

      <Stack gap="sm">
        {products === undefined ? (
          <Center py="xl">
            <Loader size="sm" color="brand" />
          </Center>
        ) : products.length === 0 ? (
          <Stack gap="md" ta="center" py="lg">
            <Text size="sm" c="dark.1">
              No products yet. Upload one first.
            </Text>
            <Button
              component={Link}
              to="/studio"
              variant="light"
              color="brand"
              size="sm"
            >
              Go to Studio
            </Button>
          </Stack>
        ) : (
          products.map((product) => (
            <UnstyledButton
              key={product._id}
              onClick={() => onSelectProduct(product._id as string)}
              p="sm"
              style={{
                borderRadius: 'var(--mantine-radius-md)',
                border: '1px solid var(--mantine-color-dark-5)',
                backgroundColor: 'var(--mantine-color-dark-7)',
                transition: 'background-color 120ms ease',
              }}
              styles={{
                root: {
                  '&:hover': {
                    backgroundColor: 'var(--mantine-color-dark-6)',
                  },
                },
              }}
            >
              <Group gap="md" wrap="nowrap">
                {product.imageUrl ? (
                  <Box
                    w={48}
                    h={48}
                    style={{
                      borderRadius: 8,
                      overflow: 'hidden',
                      flexShrink: 0,
                      border: '1px solid var(--mantine-color-dark-5)',
                    }}
                  >
                    <Image
                      src={product.imageUrl}
                      alt={product.name}
                      fit="cover"
                      w={48}
                      h={48}
                    />
                  </Box>
                ) : (
                  <Box
                    w={48}
                    h={48}
                    bg="dark.6"
                    style={{
                      borderRadius: 8,
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <IconSparkles
                      size={20}
                      color="var(--mantine-color-dark-3)"
                    />
                  </Box>
                )}
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Text size="sm" fw={500} c="white" lineClamp={1}>
                    {product.name}
                  </Text>
                  {product.category && (
                    <Text size="xs" c="dark.2" lineClamp={1}>
                      {capitalizeWords(product.category)}
                    </Text>
                  )}
                </Box>
                <IconArrowRight
                  size={16}
                  color="var(--mantine-color-dark-3)"
                />
              </Group>
            </UnstyledButton>
          ))
        )}
      </Stack>
    </Stack>
  )
}
