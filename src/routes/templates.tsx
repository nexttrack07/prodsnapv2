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
  AspectRatio,
  Badge,
  Box,
  Button,
  Center,
  Container,
  Group,
  Image,
  Loader,
  Menu,
  Modal,
  Paper,
  Select,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core'
import {
  IconSearch,
  IconX,
  IconSparkles,
  IconArrowRight,
  IconBookmark,
  IconBookmarkFilled,
  IconCheck,
  IconDownload,
} from '@tabler/icons-react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { capitalizeWords } from '../utils/strings'

type TemplatesSearch = { preview?: string }

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
    default:
      return 1
  }
}

function TemplatesBrowsePage() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const navigate = useNavigate()
  const convex = useConvex()

  // ── Filters ──────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<string | null>(null)
  const [filterImageStyle, setFilterImageStyle] = useState<string | null>(null)
  const [filterSetting, setFilterSetting] = useState<string | null>(null)
  const [filterAngleType, setFilterAngleType] = useState<string | null>(null)
  const [filterAspectRatio, setFilterAspectRatio] = useState<string | null>(null)

  const { data: filterOptions } = useQuery(
    convexQuery(api.products.listTemplateFilterOptions, {}),
  )

  const filterArgs = {
    search: search.trim() || undefined,
    productCategory: filterCategory ?? undefined,
    imageStyle: filterImageStyle ?? undefined,
    setting: filterSetting ?? undefined,
    angleType: filterAngleType ?? undefined,
    aspectRatio:
      (filterAspectRatio as '1:1' | '4:5' | '9:16' | undefined) ?? undefined,
  }
  const filtersActive =
    !!filterArgs.search ||
    !!filterArgs.productCategory ||
    !!filterArgs.imageStyle ||
    !!filterArgs.setting ||
    !!filterArgs.angleType ||
    !!filterArgs.aspectRatio

  function clearFilters() {
    setSearch('')
    setFilterCategory(null)
    setFilterImageStyle(null)
    setFilterSetting(null)
    setFilterAngleType(null)
    setFilterAspectRatio(null)
  }

  // ── Infinite query ─────────────────────────────────────────────────────────
  const {
    data: templatesData,
    isLoading: templatesLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: [
      'browseTemplates',
      filterArgs.search,
      filterArgs.productCategory,
      filterArgs.imageStyle,
      filterArgs.setting,
      filterArgs.angleType,
      filterArgs.aspectRatio,
    ],
    queryFn: async ({ pageParam }) => {
      return convex.query(api.products.listTemplates, {
        cursor: pageParam,
        limit: 24,
        ...filterArgs,
      })
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
  })

  const templates = templatesData?.pages.flatMap((page) => page.items) || []
  const totalCount = templates.length

  const observerRef = useRef<IntersectionObserver | null>(null)
  const loadMoreRef = useCallback(
    (node: HTMLDivElement | null) => {
      // Always disconnect first; bailing out during a fetch loses observation
      // when React calls the callback ref with the same node after dep changes.
      // The fetch-in-flight guard belongs INSIDE the intersection callback.
      if (observerRef.current) observerRef.current.disconnect()
      if (!node) return
      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
            fetchNextPage()
          }
        },
        { rootMargin: '400px' },
      )
      observerRef.current.observe(node)
    },
    [isFetchingNextPage, hasNextPage, fetchNextPage],
  )

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

  // ── Preview modal ──────────────────────────────────────────────────────────
  const [previewTemplate, setPreviewTemplate] = useState<
    (typeof templates)[number] | null
  >(null)
  const [productPickerOpen, setProductPickerOpen] = useState(false)

  // Auto-open preview when arriving with ?preview=<templateId> (from the
  // home shelf). Only fires once per id once the matching template is in
  // the loaded page.
  const { preview: previewIdFromUrl } = Route.useSearch()
  const lastConsumedPreviewId = useRef<string | null>(null)
  useEffect(() => {
    if (!previewIdFromUrl) return
    if (lastConsumedPreviewId.current === previewIdFromUrl) return
    const match = templates.find((t) => (t._id as string) === previewIdFromUrl)
    if (match) {
      setPreviewTemplate(match)
      lastConsumedPreviewId.current = previewIdFromUrl
    }
  }, [previewIdFromUrl, templates])

  return (
    <Container size="xl" py="md">
      {/* Header */}
      <Group justify="space-between" align="flex-end" mb="lg" wrap="wrap" gap="md">
        <Box>
          <Title order={1} fz="xl" fw={600} c="white">
            Templates
          </Title>
          <Text size="sm" c="dark.2">
            {templatesLoading
              ? 'Loading...'
              : `${totalCount}${hasNextPage ? '+' : ''} templates`}
          </Text>
        </Box>
      </Group>

      {/* Filters */}
      <Paper
        radius="md"
        p="md"
        mb="lg"
        style={{
          border: '1px solid var(--mantine-color-dark-6)',
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        <Group gap="sm" wrap="wrap" align="flex-end">
          <TextInput
            placeholder="Search templates..."
            leftSection={<IconSearch size={14} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            style={{ flex: 1, minWidth: 180 }}
            size="sm"
          />
          <Select
            placeholder="Category"
            data={
              filterOptions?.productCategories.map((v) => ({
                value: v,
                label: capitalizeWords(v),
              })) ?? []
            }
            value={filterCategory}
            onChange={setFilterCategory}
            clearable
            size="sm"
            w={isMobile ? '100%' : 150}
          />
          <Select
            placeholder="Image style"
            data={
              filterOptions?.imageStyles.map((v) => ({
                value: v,
                label: capitalizeWords(v),
              })) ?? []
            }
            value={filterImageStyle}
            onChange={setFilterImageStyle}
            clearable
            size="sm"
            w={isMobile ? '100%' : 150}
          />
          <Select
            placeholder="Setting"
            data={
              filterOptions?.settings.map((v) => ({
                value: v,
                label: capitalizeWords(v),
              })) ?? []
            }
            value={filterSetting}
            onChange={setFilterSetting}
            clearable
            size="sm"
            w={isMobile ? '100%' : 150}
          />
          <Select
            placeholder="Angle type"
            data={
              filterOptions?.angleTypes.map((v) => ({
                value: v,
                label: angleTypeLabel(v),
              })) ?? []
            }
            value={filterAngleType}
            onChange={setFilterAngleType}
            clearable
            size="sm"
            w={isMobile ? '100%' : 150}
          />
          <Select
            placeholder="Aspect ratio"
            data={[
              { value: '1:1', label: '1:1' },
              { value: '4:5', label: '4:5' },
              { value: '9:16', label: '9:16' },
            ]}
            value={filterAspectRatio}
            onChange={setFilterAspectRatio}
            clearable
            size="sm"
            w={isMobile ? '100%' : 120}
          />
          {filtersActive && (
            <Button
              variant="subtle"
              color="gray"
              size="sm"
              leftSection={<IconX size={14} />}
              onClick={clearFilters}
            >
              Clear filters
            </Button>
          )}
        </Group>
      </Paper>

      {/* Grid */}
      {templatesLoading ? (
        <Box
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
            gap: 1,
          }}
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton
              key={i}
              h={i % 3 === 0 ? 240 : i % 3 === 1 ? 320 : 200}
              radius="sm"
            />
          ))}
        </Box>
      ) : templates.length === 0 ? (
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
          <Text size="lg" fw={500} c="dark.1" mb="xs">
            No templates match
          </Text>
          <Text size="sm" c="dark.3">
            Try clearing a filter.
          </Text>
        </Paper>
      ) : (
        <>
          {/* Masonic caches cell positions and crashes when items shrink.
              Re-key on filter changes so it remounts with a fresh cache. */}
          <Masonry
            key={[
              filterArgs.search ?? '',
              filterArgs.productCategory ?? '',
              filterArgs.imageStyle ?? '',
              filterArgs.setting ?? '',
              filterArgs.angleType ?? '',
              filterArgs.aspectRatio ?? '',
            ].join('|')}
            items={templates}
            columnCount={isMobile ? 2 : 4}
            columnGutter={1}
            rowGutter={1}
            render={({ data: t }) => (
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
          {/* Infinite scroll sentinel */}
          {hasNextPage && (
            <Center ref={loadMoreRef} py="xl">
              {isFetchingNextPage ? (
                <Loader size="sm" color="brand" />
              ) : (
                <Text size="sm" c="dark.3">
                  Scroll for more
                </Text>
              )}
            </Center>
          )}
        </>
      )}

      {/* Preview modal */}
      <TemplatePreviewModal
        template={previewTemplate}
        onClose={() => {
          setPreviewTemplate(null)
          setProductPickerOpen(false)
          // Strip ?preview=<id> so re-clicking the same tile from home
          // remounts cleanly and the auto-open effect fires again.
          if (previewIdFromUrl) {
            navigate({ to: '/templates', search: {}, replace: true })
          }
        }}
        onUseTemplate={() => setProductPickerOpen(true)}
      />

      {/* Product picker modal */}
      {previewTemplate && (
        <ProductPickerModal
          opened={productPickerOpen}
          onClose={() => setProductPickerOpen(false)}
          onSelectProduct={(productId) => {
            setProductPickerOpen(false)
            setPreviewTemplate(null)
            navigate({
              to: '/studio/$productId',
              params: { productId },
              search: { compose: 'true', template: previewTemplate._id },
            })
          }}
        />
      )}
    </Container>
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

// ── Template Preview Modal ──────────────────────────────────────────────────

function TemplatePreviewModal({
  template,
  onClose,
  onUseTemplate,
}: {
  template: {
    _id: Id<'adTemplates'>
    imageUrl: string
    thumbnailUrl: string
    aspectRatio: string
    productCategory?: string
    imageStyle?: string
    setting?: string
    composition?: string
    angleType?: string
  } | null
  onClose: () => void
  onUseTemplate: () => void
}) {
  const isMobilePreview = useMediaQuery('(max-width: 768px)')
  if (!template) return null

  return (
    <Modal
      opened={!!template}
      onClose={onClose}
      size={isMobilePreview ? '100%' : 'lg'}
      fullScreen={isMobilePreview}
      radius="md"
      centered
      title="Template preview"
      styles={{
        body: { padding: 'var(--mantine-spacing-md)' },
      }}
    >
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
    </Modal>
  )
}

// ── Product Picker Modal ────────────────────────────────────────────────────

function ProductPickerModal({
  opened,
  onClose,
  onSelectProduct,
}: {
  opened: boolean
  onClose: () => void
  onSelectProduct: (productId: string) => void
}) {
  const products = useConvexQuery(api.products.listProducts, {})

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Choose a product"
      size="md"
      radius="md"
      centered
    >
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
    </Modal>
  )
}
