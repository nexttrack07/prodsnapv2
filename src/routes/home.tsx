import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useQuery } from 'convex/react'
import { useMediaQuery } from '@mantine/hooks'
import { useAction } from 'convex/react'
import { useConvexMutation } from '@convex-dev/react-query'
import { useMutation } from '@tanstack/react-query'
import { notifications } from '@mantine/notifications'
import { Dropzone, IMAGE_MIME_TYPE } from '@mantine/dropzone'
import {
  Anchor,
  AspectRatio,
  Badge,
  Box,
  Button,
  Center,
  Container,
  Group,
  Image,
  Loader,
  Paper,
  ScrollArea,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core'
import {
  IconUpload,
  IconPhoto,
  IconArrowRight,
  IconPlus,
  IconSparkles,
} from '@tabler/icons-react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { mapBillingError } from '../lib/billing/mapBillingError'
import { MAX_PRODUCT_IMAGE_SIZE } from '../utils/constants'
import { capitalizeWords } from '../utils/strings'
import { AdDetailPanel } from '../components/ads/AdDetailPanel'

type HomeSearch = { ad?: string }

export const Route = createFileRoute('/home')({
  validateSearch: (search: Record<string, unknown>): HomeSearch => {
    if (typeof search.ad === 'string' && search.ad.length > 0) {
      return { ad: search.ad }
    }
    return {}
  },
  component: HomePage,
})

function HomePage() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const dashboard = useQuery(api.products.getFocusProduct, {})
  const products = useQuery(api.products.listProducts, {})
  const templates = useQuery(api.templates.listPublished, {})
  const search = Route.useSearch()
  const navigate = useNavigate()

  const isLoading =
    dashboard === undefined || products === undefined || templates === undefined

  // closeAd remains for direct visits to /home?ad=:id (shared/back-button
  // open the panel — the AdDetailPanel below renders based on the URL).
  const closeAd = () =>
    navigate({ to: '/home', search: {}, replace: true })

  // Siblings for prev/next nav when the panel IS open via URL
  const siblings = (dashboard?.recentAds ?? []).map(
    (a) => a._id as Id<'templateGenerations'>,
  )

  return (
    <Container size="lg" py="xl">
      <Stack gap="xl">
        <HeroSection
          dashboard={dashboard ?? null}
          isLoading={isLoading}
          isMobile={!!isMobile}
        />

        {!!products && products.length > 0 && (
          <ProductsRow products={products} isLoading={false} />
        )}

        {templates && templates.length > 0 && (
          <TemplatesShelf
            templates={templates}
            suggestedCategory={dashboard?.suggestedCategory ?? null}
          />
        )}
      </Stack>

      <AdDetailPanel
        opened={!!search.ad}
        onClose={closeAd}
        adId={(search.ad ?? null) as Id<'templateGenerations'> | null}
        siblings={siblings}
      />
    </Container>
  )
}

// ─── Hero zone ──────────────────────────────────────────────────────────────

type DashboardData = NonNullable<
  ReturnType<typeof useQuery<typeof api.products.getFocusProduct>>
>

function HeroSection({
  dashboard,
  isLoading,
  isMobile,
}: {
  dashboard: DashboardData | null
  isLoading: boolean
  isMobile: boolean
}) {
  if (isLoading || !dashboard) return <HeroSkeleton />
  if (!dashboard.focusProduct) return <EmptyHero isMobile={isMobile} />
  return (
    <FocusHero
      product={dashboard.focusProduct}
      recentAds={dashboard.recentAds}
      totalGenerations={dashboard.totalGenerations}
    />
  )
}

function FocusHero({
  product,
  recentAds,
  totalGenerations,
}: {
  product: NonNullable<DashboardData['focusProduct']>
  recentAds: DashboardData['recentAds']
  totalGenerations: number
}) {
  const navigate = useNavigate()
  const goToProduct = () =>
    navigate({ to: '/studio/$productId', params: { productId: product._id } })

  return (
    <Paper
      radius="xl"
      withBorder
      style={{
        overflow: 'hidden',
        cursor: 'pointer',
        borderColor: 'var(--mantine-color-dark-5)',
        backgroundColor: 'var(--mantine-color-dark-7)',
      }}
      onClick={goToProduct}
    >
      <Box pos="relative">
        {recentAds.length > 0 ? (
          <CollageBackground ads={recentAds} />
        ) : (
          <SinglePrimaryBackground imageUrl={product.imageUrl ?? null} />
        )}
        <Box
          pos="absolute"
          inset={0}
          style={{
            background:
              'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.85) 75%, rgba(0,0,0,0.95) 100%)',
            pointerEvents: 'none',
          }}
        />
        <Stack
          pos="absolute"
          left={0}
          right={0}
          bottom={0}
          p="xl"
          gap="sm"
          style={{ zIndex: 1 }}
        >
          <Text size="xs" c="dark.1" tt="uppercase" fw={600}>
            What are you making today?
          </Text>
          <Title order={1} fz={32} fw={700} c="white">
            {recentAds.length > 0
              ? `Continue with ${capitalizeWords(product.name)}`
              : `Make your first ad for ${capitalizeWords(product.name)}`}
          </Title>
          <Text size="sm" c="dark.1">
            {totalGenerations} {totalGenerations === 1 ? 'ad' : 'ads'}
            {product.category ? ` · ${product.category}` : ''}
          </Text>
          <Group gap="sm" mt="xs">
            <Button
              color="brand"
              size="md"
              leftSection={<IconPlus size={16} />}
              onClick={(e) => {
                e.stopPropagation()
                goToProduct()
              }}
            >
              New ad
            </Button>
            <Button
              variant="default"
              size="md"
              rightSection={<IconArrowRight size={16} />}
              onClick={(e) => {
                e.stopPropagation()
                goToProduct()
              }}
            >
              Open product
            </Button>
          </Group>
        </Stack>
      </Box>
    </Paper>
  )
}

function CollageBackground({
  ads,
}: {
  ads: DashboardData['recentAds']
}) {
  // Masonry-ish 3-column layout for up to 6 ads. Heights vary slightly to
  // give it visual interest. Clicks bubble to the parent Paper which
  // navigates to the product — we deliberately don't open ad detail from
  // the home collage; users go to the product first.
  return (
    <SimpleGrid
      cols={{ base: 2, sm: 3 }}
      spacing={2}
      style={{ minHeight: 360 }}
    >
      {ads.slice(0, 6).map((ad, i) => (
        <Box
          key={ad._id}
          style={{
            aspectRatio: i % 3 === 1 ? '1 / 1.2' : '1 / 1',
            overflow: 'hidden',
          }}
        >
          <Image
            src={ad.outputUrl}
            alt=""
            fit="cover"
            w="100%"
            h="100%"
            style={{
              transition: 'transform 600ms ease',
            }}
          />
        </Box>
      ))}
      {/* If fewer than 6 ads, fill the remaining tiles with a soft-blurred placeholder so the masonry isn't ragged. */}
      {Array.from({ length: Math.max(0, 6 - ads.length) }).map((_, i) => (
        <Box
          key={`fill-${i}`}
          style={{
            aspectRatio: '1 / 1',
            backgroundColor: 'var(--mantine-color-dark-6)',
            backgroundImage:
              'linear-gradient(135deg, rgba(84, 116, 180, 0.18), rgba(84, 116, 180, 0.04))',
          }}
        />
      ))}
    </SimpleGrid>
  )
}

function SinglePrimaryBackground({ imageUrl }: { imageUrl: string | null }) {
  return (
    <Box style={{ height: 360, position: 'relative', overflow: 'hidden' }}>
      {imageUrl ? (
        <>
          <Image
            src={imageUrl}
            alt=""
            fit="cover"
            w="100%"
            h="100%"
            style={{ filter: 'blur(24px)', transform: 'scale(1.15)' }}
          />
          <Center
            pos="absolute"
            inset={0}
            style={{ pointerEvents: 'none' }}
          >
            <Box
              style={{
                width: '60%',
                aspectRatio: '1 / 1',
                maxHeight: '70%',
              }}
            >
              <Image src={imageUrl} alt="" fit="contain" w="100%" h="100%" />
            </Box>
          </Center>
        </>
      ) : (
        <Box
          style={{
            height: '100%',
            backgroundImage:
              'linear-gradient(135deg, rgba(84, 116, 180, 0.25), rgba(84, 116, 180, 0.06))',
          }}
        />
      )}
    </Box>
  )
}

function HeroSkeleton() {
  return (
    <Paper radius="xl" withBorder style={{ overflow: 'hidden' }}>
      <Skeleton height={360} radius={0} />
    </Paper>
  )
}

// ─── Empty state hero (zero products) ──────────────────────────────────────

function EmptyHero({ isMobile }: { isMobile: boolean }) {
  const navigate = useNavigate()
  const uploadAction = useAction(api.r2.uploadProductImage)
  const createProduct = useConvexMutation(api.products.createProduct)
  const createProductMutation = useMutation({ mutationFn: createProduct })
  const [isUploading, setIsUploading] = useState(false)

  async function handleFileDrop(files: File[]) {
    const file = files[0]
    if (!file) return
    if (file.size > MAX_PRODUCT_IMAGE_SIZE) {
      notifications.show({
        title: 'File too large',
        message: 'Image must be under 10 MB',
        color: 'red',
      })
      return
    }
    setIsUploading(true)
    try {
      const arrayBuffer = await file.arrayBuffer()
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce(
          (d, b) => d + String.fromCharCode(b),
          '',
        ),
      )
      const fileName = file.name.replace(/\.[^.]+$/, '')
      const { url } = await uploadAction({
        name: file.name,
        base64,
        contentType: file.type,
      })
      const productId: Id<'products'> = await createProductMutation.mutateAsync(
        {
          imageUrl: url,
          name: fileName.replace(/[-_]/g, ' '),
        },
      )
      notifications.show({
        title: 'Product created',
        message: "Let's make some ads.",
        color: 'green',
      })
      navigate({ to: '/studio/$productId', params: { productId } })
    } catch (err) {
      const info = mapBillingError(err)
      notifications.show({
        title: info.title === 'Something went wrong' ? 'Upload failed' : info.title,
        message: info.action ? (
          <>
            {info.message}{' '}
            <Anchor component={Link} to={info.action.href} size="sm" fw={600}>
              {info.action.label} →
            </Anchor>
          </>
        ) : (
          info.message
        ),
        color: 'red',
        autoClose: 8000,
      })
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <Paper
      radius="xl"
      withBorder
      p={isMobile ? 'lg' : 48}
      style={{
        backgroundColor: 'var(--mantine-color-dark-7)',
        backgroundImage:
          'radial-gradient(circle at top right, rgba(84, 116, 180, 0.20), transparent 50%)',
        borderColor: 'var(--mantine-color-dark-5)',
      }}
    >
      <Dropzone
        onDrop={handleFileDrop}
        accept={IMAGE_MIME_TYPE}
        maxSize={MAX_PRODUCT_IMAGE_SIZE}
        multiple={false}
        disabled={isUploading}
        style={{
          border: 'none',
          background: 'none',
          padding: 0,
          minHeight: 'auto',
        }}
      >
        <Stack align="center" gap="md" py="lg">
          <ThemeIcon
            size={72}
            radius="lg"
            variant="gradient"
            gradient={{ from: 'brand.7', to: 'brand.5', deg: 135 }}
            style={{ boxShadow: '0 8px 32px rgba(84, 116, 180, 0.30)' }}
          >
            {isUploading ? <Loader size="md" color="white" /> : <IconPhoto size={36} />}
          </ThemeIcon>
          <Stack gap={4} align="center">
            <Title order={2} fz={28} fw={700} c="white" ta="center">
              Let's make your first ad
            </Title>
            <Text c="dark.2" size="sm" maw={460} ta="center">
              Add a product — paste a URL or upload a photo. ProdSnap will
              turn it into ad creatives in about a minute.
            </Text>
          </Stack>
          <Button
            leftSection={<IconUpload size={18} />}
            color="brand"
            size="md"
            loading={isUploading}
            style={{ pointerEvents: 'none' }}
          >
            Create your first product
          </Button>
        </Stack>
      </Dropzone>
    </Paper>
  )
}

// ─── Products row ──────────────────────────────────────────────────────────

type ProductRow = NonNullable<ReturnType<typeof useQuery<typeof api.products.listProducts>>>[number]

function ProductsRow({
  products,
  isLoading,
}: {
  products: ProductRow[]
  isLoading: boolean
}) {
  if (isLoading) return null
  return (
    <Stack gap="sm">
      <Group justify="space-between" align="baseline">
        <Title order={3} fz={18} c="white" fw={600}>
          Your products
        </Title>
        <Text size="xs" c="dark.2">
          {products.length} {products.length === 1 ? 'product' : 'products'}
        </Text>
      </Group>
      <ScrollArea offsetScrollbars scrollbarSize={6} type="hover">
        <Group gap="md" wrap="nowrap" pb="xs">
          {products.map((p) => (
            <ProductTile key={p._id} product={p} />
          ))}
        </Group>
      </ScrollArea>
    </Stack>
  )
}

function ProductTile({ product }: { product: ProductRow }) {
  return (
    <Link
      to="/studio/$productId"
      params={{ productId: product._id }}
      style={{ textDecoration: 'none', flexShrink: 0 }}
    >
      <Paper
        radius="lg"
        withBorder
        style={{
          width: 180,
          overflow: 'hidden',
          backgroundColor: 'var(--mantine-color-dark-7)',
          borderColor: 'var(--mantine-color-dark-5)',
          transition: 'transform 150ms ease, border-color 150ms ease',
        }}
        className="product-card-hover"
      >
        <AspectRatio ratio={1}>
          <Box
            style={{
              backgroundColor: 'var(--mantine-color-dark-6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {product.imageUrl ? (
              <Image
                src={product.imageUrl}
                alt={product.name}
                fit="contain"
                w="100%"
                h="100%"
              />
            ) : (
              <IconPhoto size={32} color="var(--mantine-color-dark-3)" />
            )}
          </Box>
        </AspectRatio>
        <Box p="sm">
          <Text fw={500} size="sm" c="white" truncate>
            {capitalizeWords(product.name)}
          </Text>
          <Text size="xs" c="dark.2" mt={2}>
            {product.generationCount}{' '}
            {product.generationCount === 1 ? 'ad' : 'ads'}
          </Text>
        </Box>
      </Paper>
    </Link>
  )
}

// ─── Templates shelf ───────────────────────────────────────────────────────

type TemplateRow = NonNullable<
  ReturnType<typeof useQuery<typeof api.templates.listPublished>>
>[number]

function TemplatesShelf({
  templates,
  suggestedCategory,
}: {
  templates: TemplateRow[]
  suggestedCategory: string | null
}) {
  // Build category chips from the published templates themselves so we
  // never show a chip with zero matches.
  const allCategories = useMemo(() => {
    const set = new Set<string>()
    for (const t of templates) {
      if (t.productCategory) set.add(t.productCategory)
    }
    return Array.from(set).sort()
  }, [templates])

  const initial = suggestedCategory && allCategories.includes(suggestedCategory)
    ? suggestedCategory
    : 'all'
  const [activeCategory, setActiveCategory] = useState<string>(initial)

  const visible = useMemo(() => {
    if (activeCategory === 'all') return templates.slice(0, 24)
    return templates.filter((t) => t.productCategory === activeCategory).slice(0, 24)
  }, [templates, activeCategory])

  if (templates.length === 0) return null

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="baseline">
        <Group gap="xs" align="baseline">
          <IconSparkles size={18} color="var(--mantine-color-brand-5)" />
          <Title order={3} fz={18} c="white" fw={600}>
            Start from a proven format
          </Title>
        </Group>
      </Group>

      <Group gap="xs" wrap="wrap">
        <CategoryChip
          label="All"
          active={activeCategory === 'all'}
          onClick={() => setActiveCategory('all')}
        />
        {allCategories.map((c) => (
          <CategoryChip
            key={c}
            label={capitalizeWords(c)}
            active={activeCategory === c}
            onClick={() => setActiveCategory(c)}
          />
        ))}
      </Group>

      <ScrollArea offsetScrollbars scrollbarSize={6} type="hover">
        <Group gap="md" wrap="nowrap" pb="xs">
          {visible.map((t) => (
            <TemplateTile key={t._id} template={t} />
          ))}
          {visible.length === 0 && (
            <Text size="sm" c="dark.2" py="md">
              No templates yet for this category — pick another chip.
            </Text>
          )}
        </Group>
      </ScrollArea>
    </Stack>
  )
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <Button
      size="xs"
      variant={active ? 'filled' : 'default'}
      color={active ? 'brand' : 'gray'}
      onClick={onClick}
      radius="xl"
      px="md"
    >
      {label}
    </Button>
  )
}

function TemplateTile({ template }: { template: TemplateRow }) {
  // For v1 the template tile just opens the studio root — picking the
  // product to apply it to belongs in the compose flow we'll wire up in a
  // later phase. Until then, clicking is a soft hint.
  return (
    <Paper
      radius="lg"
      withBorder
      style={{
        width: 160,
        overflow: 'hidden',
        backgroundColor: 'var(--mantine-color-dark-7)',
        borderColor: 'var(--mantine-color-dark-5)',
        flexShrink: 0,
      }}
    >
      <AspectRatio ratio={4 / 5}>
        {template.thumbnailUrl ? (
          <Image
            src={template.thumbnailUrl}
            alt=""
            fit="cover"
            w="100%"
            h="100%"
          />
        ) : (
          <Box bg="dark.6" />
        )}
      </AspectRatio>
      {template.productCategory && (
        <Box p="xs">
          <Badge size="xs" variant="light" color="gray" radius="sm">
            {template.productCategory}
          </Badge>
        </Box>
      )}
    </Paper>
  )
}

