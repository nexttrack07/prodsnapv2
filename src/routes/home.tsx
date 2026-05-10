import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useQuery } from 'convex/react'
import { useMediaQuery } from '@mantine/hooks'
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
  UnstyledButton,
} from '@mantine/core'
import {
  IconPhoto,
  IconArrowRight,
  IconPlus,
  IconSparkles,
  IconTemplate,
  IconWand,
  IconTarget,
  IconLibrary,
} from '@tabler/icons-react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { capitalizeWords } from '../utils/strings'
import { AdDetailPanel } from '../components/ads/AdDetailPanel'
import { PageHeaderActions } from '../components/layout/PageHeaderActions'

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

  // Surface the header CTA only once the user has products. First-time
  // users hit the giant empty-state hero; a header button then would compete.
  const hasProducts = !!products && products.length > 0

  const goToNewProduct = () => navigate({ to: '/products/new' })

  return (
    <Container fluid p="lg">
      {hasProducts && (
        <PageHeaderActions>
          <Button
            size="sm"
            color="brand"
            leftSection={<IconPlus size={14} />}
            onClick={goToNewProduct}
          >
            New product
          </Button>
        </PageHeaderActions>
      )}

      <Stack gap="xl">
        <HeroSection
          dashboard={dashboard ?? null}
          isLoading={isLoading}
          isMobile={!!isMobile}
        />

        {dashboard?.focusProduct && (
          <ThreePathsSection focusProductId={dashboard.focusProduct._id as Id<'products'>} />
        )}

        {hasProducts && (
          <ProductsRow products={products} isLoading={false} onAddProduct={goToNewProduct} />
        )}

        {templates && templates.length > 0 && (
          <TemplatesShelf
            templates={templates}
            suggestedCategory={dashboard?.suggestedCategory ?? null}
          />
        )}

        {!!dashboard?.totalGenerations && dashboard.totalGenerations > 0 && (
          <LibraryTeaser totalGenerations={dashboard.totalGenerations} />
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
                navigate({
                  to: '/studio/$productId',
                  params: { productId: product._id },
                  search: { compose: 'true' },
                })
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
  // True masonry: each tile takes the ad's actual aspectRatio (1:1, 4:5,
  // 9:16) so images render at correct proportions, no cropping. CSS columns
  // give Pinterest-style variable-height stacking. Clicks bubble to the
  // parent Paper which navigates to the product — we deliberately don't
  // open ad detail from the home collage.
  return (
    <Box
      style={{
        columnCount: 6,
        columnGap: 2,
        minHeight: 360,
      }}
    >
      {ads.slice(0, 12).map((ad) => {
        const ratio =
          ad.aspectRatio === '4:5'
            ? '4 / 5'
            : ad.aspectRatio === '9:16'
              ? '9 / 16'
              : '1 / 1'
        return (
          <Box
            key={ad._id}
            style={{
              aspectRatio: ratio,
              overflow: 'hidden',
              marginBottom: 2,
              breakInside: 'avoid',
            }}
          >
            <Image
              src={ad.outputUrl}
              alt=""
              fit="cover"
              w="100%"
              h="100%"
              style={{ transition: 'transform 600ms ease' }}
            />
          </Box>
        )
      })}
      {/* If fewer than 8 ads, fill the remaining tiles with a soft-blurred placeholder so the masonry isn't ragged. */}
      {Array.from({ length: Math.max(0, 12 - ads.length) }).map((_, i) => (
        <Box
          key={`fill-${i}`}
          style={{
            aspectRatio: '1 / 1',
            marginBottom: 2,
            breakInside: 'avoid',
            backgroundColor: 'var(--mantine-color-dark-6)',
            backgroundImage:
              'linear-gradient(135deg, rgba(84, 116, 180, 0.18), rgba(84, 116, 180, 0.04))',
          }}
        />
      ))}
    </Box>
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
      <Stack align="center" gap="md" py="lg">
        <ThemeIcon
          size={72}
          radius="lg"
          variant="gradient"
          gradient={{ from: 'brand.7', to: 'brand.5', deg: 135 }}
          style={{ boxShadow: '0 8px 32px rgba(84, 116, 180, 0.30)' }}
        >
          <IconPhoto size={36} />
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
          leftSection={<IconPlus size={18} />}
          color="brand"
          size="md"
          onClick={() => navigate({ to: '/products/new' })}
        >
          Create your first product
        </Button>
      </Stack>
    </Paper>
  )
}

// ─── Products row ──────────────────────────────────────────────────────────

type ProductRow = NonNullable<ReturnType<typeof useQuery<typeof api.products.listProducts>>>[number]

function ProductsRow({
  products,
  isLoading,
  onAddProduct,
}: {
  products: ProductRow[]
  isLoading: boolean
  onAddProduct: () => void
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
          <NewProductTile onClick={onAddProduct} />
          {products.map((p) => (
            <ProductTile key={p._id} product={p} />
          ))}
        </Group>
      </ScrollArea>
    </Stack>
  )
}

function NewProductTile({ onClick }: { onClick: () => void }) {
  return (
    <UnstyledButton
      onClick={onClick}
      style={{
        width: 180,
        flexShrink: 0,
      }}
      aria-label="Add new product"
    >
      <Paper
        radius="lg"
        withBorder
        style={{
          backgroundColor: 'var(--mantine-color-dark-7)',
          borderColor: 'var(--mantine-color-dark-5)',
          borderStyle: 'dashed',
          transition: 'transform 150ms ease, border-color 150ms ease, background-color 150ms ease',
        }}
        className="product-card-hover"
      >
        <AspectRatio ratio={1}>
          <Box
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              backgroundColor: 'var(--mantine-color-dark-6)',
            }}
          >
            <ThemeIcon
              size={44}
              radius="md"
              variant="gradient"
              gradient={{ from: 'brand.7', to: 'brand.5', deg: 135 }}
            >
              <IconPlus size={22} />
            </ThemeIcon>
          </Box>
        </AspectRatio>
        <Box p="sm">
          <Text fw={500} size="sm" c="white" truncate>
            New product
          </Text>
          <Text size="xs" c="dark.2" mt={2}>
            Upload a photo
          </Text>
        </Box>
      </Paper>
    </UnstyledButton>
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
        <Anchor
          component={Link}
          to="/templates"
          size="xs"
          c="brand.4"
          fw={500}
          underline="never"
        >
          Browse all →
        </Anchor>
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

// ─── Three on-ramps ────────────────────────────────────────────────────────

function ThreePathsSection({ focusProductId }: { focusProductId: Id<'products'> }) {
  const navigate = useNavigate()
  const paths: Array<{
    icon: typeof IconTemplate
    label: string
    title: string
    description: string
    color: string
    onClick: () => void
  }> = [
    {
      icon: IconTemplate,
      label: 'Templates',
      title: 'Start from a winning ad',
      description: 'Browse a curated library of proven Facebook ads.',
      color: 'teal',
      onClick: () => navigate({ to: '/templates' }),
    },
    {
      icon: IconWand,
      label: 'Custom prompt',
      title: 'Describe what you want',
      description: 'Build a prompt with chips or use AI suggestions.',
      color: 'lime',
      onClick: () =>
        navigate({
          to: '/studio/$productId',
          params: { productId: focusProductId },
          search: { compose: 'true' },
        }),
    },
    {
      icon: IconTarget,
      label: 'Marketing angle',
      title: 'Generate against an angle',
      description: 'Comparison, Curiosity, Social proof, Problem callout.',
      color: 'brand',
      onClick: () =>
        navigate({
          to: '/studio/$productId/strategy',
          params: { productId: focusProductId },
        }),
    },
  ]

  return (
    <Stack gap="sm">
      <Title order={3} fz={18} c="white" fw={600}>
        Three ways to make an ad
      </Title>
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        {paths.map((p) => (
          <Paper
            key={p.label}
            radius="lg"
            withBorder
            p="md"
            onClick={p.onClick}
            style={{
              cursor: 'pointer',
              backgroundColor: 'var(--mantine-color-dark-7)',
              borderColor: 'var(--mantine-color-dark-5)',
              transition: 'transform 150ms ease, border-color 150ms ease',
            }}
            className="product-card-hover"
          >
            <Group gap="sm" align="center" wrap="nowrap">
              <ThemeIcon size={36} radius="md" color={p.color} variant="light">
                <p.icon size={18} />
              </ThemeIcon>
              <Text size="xs" tt="uppercase" fw={700} c="dark.2">
                {p.label}
              </Text>
            </Group>
            <Text mt="md" size="md" fw={600} c="white">
              {p.title}
            </Text>
            <Text mt={4} size="xs" c="dark.2">
              {p.description}
            </Text>
          </Paper>
        ))}
      </SimpleGrid>
    </Stack>
  )
}

// ─── Library teaser ────────────────────────────────────────────────────────

function LibraryTeaser({ totalGenerations }: { totalGenerations: number }) {
  return (
    <Paper
      component={Link}
      to="/library"
      radius="lg"
      withBorder
      p="md"
      style={{
        textDecoration: 'none',
        backgroundColor: 'var(--mantine-color-dark-7)',
        borderColor: 'var(--mantine-color-dark-5)',
        cursor: 'pointer',
      }}
    >
      <Group justify="space-between" align="center" wrap="nowrap">
        <Group gap="md" align="center" wrap="nowrap">
          <ThemeIcon size={40} radius="md" color="brand" variant="light">
            <IconLibrary size={20} />
          </ThemeIcon>
          <Box>
            <Text size="sm" fw={600} c="white">
              Generation library
            </Text>
            <Text size="xs" c="dark.2">
              {totalGenerations} {totalGenerations === 1 ? 'ad' : 'ads'} across all your products. Star winners, filter, iterate.
            </Text>
          </Box>
        </Group>
        <IconArrowRight size={18} color="var(--mantine-color-dark-2)" />
      </Group>
    </Paper>
  )
}

function TemplateTile({ template }: { template: TemplateRow }) {
  // Clicking opens the full templates browser with this template's preview
  // pre-opened so the user can pick a product and start composing.
  const navigate = useNavigate()
  return (
    <Paper
      onClick={() =>
        navigate({
          to: '/templates',
          search: { preview: template._id as string },
        })
      }
      radius="lg"
      withBorder
      style={{
        width: 160,
        overflow: 'hidden',
        backgroundColor: 'var(--mantine-color-dark-7)',
        borderColor: 'var(--mantine-color-dark-5)',
        flexShrink: 0,
        cursor: 'pointer',
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

