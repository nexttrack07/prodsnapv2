import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useMemo } from 'react'
import { useQuery } from 'convex/react'
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
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import {
  IconLibrary,
  IconPhoto,
  IconStarFilled,
} from '@tabler/icons-react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { capitalizeWords } from '../utils/strings'
import { AdDetailPanel } from '../components/ads/AdDetailPanel'

type LibrarySearch = { ad?: string }

export const Route = createFileRoute('/library')({
  validateSearch: (search: Record<string, unknown>): LibrarySearch => {
    if (typeof search.ad === 'string' && search.ad.length > 0) {
      return { ad: search.ad }
    }
    return {}
  },
  component: LibraryPage,
})

const PAGE_SIZE = 24

function LibraryPage() {
  const search = Route.useSearch()
  const navigate = useNavigate()
  const isMobile = useMediaQuery('(max-width: 768px)')

  // Filters (client-side)
  const [productFilter, setProductFilter] = useState<string | null>(null)
  const [winnersOnly, setWinnersOnly] = useState(false)

  // Paginated query — load first page via Convex reactive query.
  // For v1 we use a simple take-all approach via a large initial page and
  // a manual "Load more" button that increases the limit.
  const [numItems, setNumItems] = useState(PAGE_SIZE)

  const paginatedResult = useQuery(
    api.templateGenerations.listAllAdsForUser,
    { paginationOpts: { numItems, cursor: null } },
  )

  // Products list for filter dropdown
  const products = useQuery(api.products.listProducts, {})

  const isLoading = paginatedResult === undefined
  const allAds = paginatedResult?.page ?? []
  const isDone = paginatedResult?.isDone ?? true

  // Derive product options for the filter dropdown
  const productOptions = useMemo(() => {
    if (!products) return []
    return products.map((p) => ({
      value: p._id as string,
      label: capitalizeWords(p.name),
    }))
  }, [products])

  // Client-side filtering
  const filteredAds = useMemo(() => {
    let ads = allAds
    if (productFilter) {
      ads = ads.filter((ad) => (ad.productId as string) === productFilter)
    }
    if (winnersOnly) {
      ads = ads.filter((ad) => ad.isWinner)
    }
    return ads
  }, [allAds, productFilter, winnersOnly])

  const winnerCount = allAds.filter((ad) => ad.isWinner).length

  // Ad detail panel
  const openAd = (id: string) =>
    navigate({ to: '/library', search: { ad: id } })
  const closeAd = () =>
    navigate({ to: '/library', search: {}, replace: true })

  const siblingIds = filteredAds.map(
    (a) => a._id as Id<'templateGenerations'>,
  )

  return (
    <Container size="lg" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <Group justify="space-between" align="flex-end" wrap="wrap" gap="md">
          <Box>
            <Title order={1} fz={28} fw={700} c="white" mb={4}>
              Library
            </Title>
            <Text size="sm" c="dark.2">
              {isLoading
                ? 'Loading...'
                : `${allAds.length} ad${allAds.length === 1 ? '' : 's'}`}
            </Text>
          </Box>
        </Group>

        {/* Filters row */}
        <Group gap="sm" wrap="wrap">
          <Select
            placeholder="All products"
            data={productOptions}
            value={productFilter}
            onChange={setProductFilter}
            clearable
            searchable
            size="sm"
            w={220}
            styles={{
              input: {
                backgroundColor: 'var(--mantine-color-dark-6)',
                borderColor: 'var(--mantine-color-dark-4)',
              },
            }}
          />
          {winnerCount > 0 && (
            <Button
              size="sm"
              variant={winnersOnly ? 'filled' : 'default'}
              color="yellow"
              radius="xl"
              leftSection={<IconStarFilled size={12} />}
              onClick={() => setWinnersOnly((v) => !v)}
            >
              Winners ({winnerCount})
            </Button>
          )}
          {(productFilter || winnersOnly) && (
            <Button
              size="sm"
              variant="subtle"
              color="gray"
              onClick={() => {
                setProductFilter(null)
                setWinnersOnly(false)
              }}
            >
              Clear filters
            </Button>
          )}
        </Group>

        {/* Content */}
        {isLoading ? (
          <Center py={80}>
            <Loader size="lg" color="brand" />
          </Center>
        ) : allAds.length === 0 ? (
          <EmptyState />
        ) : filteredAds.length === 0 ? (
          <Paper
            radius="lg"
            p="xl"
            ta="center"
            withBorder
            style={{
              borderStyle: 'dashed',
              borderColor: 'var(--mantine-color-dark-5)',
            }}
          >
            <Text c="dark.2" size="sm" mb="md">
              No ads match the current filters.
            </Text>
            <Button
              variant="subtle"
              color="gray"
              size="xs"
              onClick={() => {
                setProductFilter(null)
                setWinnersOnly(false)
              }}
            >
              Clear filters
            </Button>
          </Paper>
        ) : (
          <>
            <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
              {filteredAds.map((ad) => (
                <AdCard
                  key={ad._id}
                  ad={ad}
                  onClick={() => openAd(ad._id)}
                />
              ))}
            </SimpleGrid>

            {/* Load more */}
            {!isDone && (
              <Center>
                <Button
                  variant="default"
                  size="md"
                  onClick={() => setNumItems((n) => n + PAGE_SIZE)}
                >
                  Load more
                </Button>
              </Center>
            )}
          </>
        )}
      </Stack>

      <AdDetailPanel
        opened={!!search.ad}
        onClose={closeAd}
        adId={(search.ad ?? null) as Id<'templateGenerations'> | null}
        siblings={siblingIds}
      />
    </Container>
  )
}

// ─── Ad card ──────────────────────────────────────────────────────────────────

function AdCard({
  ad,
  onClick,
}: {
  ad: {
    _id: string
    outputUrl?: string
    productName: string | null
    isWinner?: boolean
  }
  onClick: () => void
}) {
  return (
    <Paper
      radius="lg"
      withBorder
      style={{
        overflow: 'hidden',
        cursor: 'pointer',
        backgroundColor: 'var(--mantine-color-dark-7)',
        borderColor: 'var(--mantine-color-dark-5)',
        transition: 'transform 150ms ease, border-color 150ms ease',
      }}
      onClick={onClick}
    >
      <AspectRatio ratio={4 / 5}>
        <Box pos="relative" w="100%" h="100%">
          {ad.outputUrl ? (
            <Image
              src={ad.outputUrl}
              alt=""
              fit="cover"
              w="100%"
              h="100%"
            />
          ) : (
            <Center bg="dark.6" w="100%" h="100%">
              <IconPhoto size={32} color="var(--mantine-color-dark-3)" />
            </Center>
          )}
          {/* Overlay: product name + winner star */}
          <Box
            pos="absolute"
            bottom={0}
            left={0}
            right={0}
            p="xs"
            style={{
              background:
                'linear-gradient(transparent, rgba(0,0,0,0.75))',
            }}
          >
            <Group gap={4} wrap="nowrap">
              {ad.isWinner && (
                <IconStarFilled
                  size={12}
                  color="var(--mantine-color-yellow-5)"
                  style={{ flexShrink: 0 }}
                />
              )}
              {ad.productName && (
                <Text size="xs" c="white" fw={500} truncate>
                  {capitalizeWords(ad.productName)}
                </Text>
              )}
            </Group>
          </Box>
        </Box>
      </AspectRatio>
    </Paper>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <Paper
      radius="xl"
      p={64}
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
      <IconLibrary
        size={48}
        style={{
          color: 'var(--mantine-color-brand-5)',
          marginBottom: 16,
        }}
      />
      <Title order={3} fz="lg" fw={600} c="white" mb={8}>
        No ads yet
      </Title>
      <Text c="dark.2" mb="xl" maw={400} mx="auto">
        Generate your first ad from a product page, then come back here to
        browse all your creatives in one place.
      </Text>
      <Button
        component={Link}
        to="/home"
        color="brand"
        size="md"
      >
        Create your first product
      </Button>
    </Paper>
  )
}
