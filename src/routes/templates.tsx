import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useRef, useCallback } from 'react'
import { useQuery as useConvexQuery } from 'convex/react'
import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { useConvex } from 'convex/react'
import { useMediaQuery } from '@mantine/hooks'
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
  Modal,
  Paper,
  Select,
  SimpleGrid,
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
} from '@tabler/icons-react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { capitalizeWords } from '../utils/strings'

export const Route = createFileRoute('/templates')({
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
      if (isFetchingNextPage) return
      if (observerRef.current) observerRef.current.disconnect()
      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasNextPage) {
          fetchNextPage()
        }
      })
      if (node) observerRef.current.observe(node)
    },
    [isFetchingNextPage, hasNextPage, fetchNextPage],
  )

  // ── Preview modal ──────────────────────────────────────────────────────────
  const [previewTemplate, setPreviewTemplate] = useState<
    (typeof templates)[number] | null
  >(null)
  const [productPickerOpen, setProductPickerOpen] = useState(false)

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
        <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} h={200} radius="md" />
          ))}
        </SimpleGrid>
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
          <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
            {templates.map((t) => (
              <TemplateTile
                key={t._id}
                template={t}
                onClick={() => setPreviewTemplate(t)}
              />
            ))}
          </SimpleGrid>
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
}: {
  template: {
    _id: Id<'adTemplates'>
    thumbnailUrl: string
    aspectRatio: string
    productCategory?: string
    angleType?: string
  }
  onClick: () => void
}) {
  return (
    <UnstyledButton
      onClick={onClick}
      style={{
        borderRadius: 'var(--mantine-radius-md)',
        overflow: 'hidden',
        border: '1px solid var(--mantine-color-dark-5)',
        backgroundColor: 'var(--mantine-color-dark-7)',
        transition: 'transform 150ms ease, box-shadow 150ms ease, border-color 150ms ease',
      }}
      styles={{
        root: {
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
            borderColor: 'var(--mantine-color-dark-4)',
          },
        },
      }}
    >
      <AspectRatio ratio={getAspectRatioValue(template.aspectRatio)}>
        <Image
          src={template.thumbnailUrl}
          alt="Template"
          fit="cover"
          style={{ display: 'block' }}
        />
      </AspectRatio>
      {(template.productCategory || template.angleType) && (
        <Group gap={4} px="xs" py={6} wrap="wrap">
          {template.productCategory && (
            <Badge size="xs" variant="light" color="gray" radius="sm">
              {capitalizeWords(template.productCategory)}
            </Badge>
          )}
          {template.angleType && (
            <Badge
              size="xs"
              variant="light"
              color={angleTypeColor(template.angleType)}
              radius="sm"
            >
              {angleTypeLabel(template.angleType)}
            </Badge>
          )}
        </Group>
      )}
    </UnstyledButton>
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
  if (!template) return null

  return (
    <Modal
      opened={!!template}
      onClose={onClose}
      size="lg"
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
