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
  TextInput,
  Title,
} from '@mantine/core'
import {
  IconLayoutGrid,
  IconPhoto,
  IconPlus,
  IconSearch,
} from '@tabler/icons-react'
import { api } from '../../convex/_generated/api'
import { capitalizeWords } from '../utils/strings'

export const Route = createFileRoute('/products')({
  component: ProductsPage,
})

function ProductsPage() {
  const isMobile = useMediaQuery('(max-width: 768px)')

  const products = useQuery(api.products.listProducts, {})
  const brandKits = useQuery(api.brandKits.listBrandKits, {})

  const [search, setSearch] = useState('')
  const [brandFilter, setBrandFilter] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)

  const isLoading = products === undefined

  // Brand lookup map
  const brandMap = useMemo(() => {
    if (!brandKits) return new Map<string, string>()
    return new Map(brandKits.map((b) => [b._id as string, b.name ?? 'Untitled brand']))
  }, [brandKits])

  // Brand picker options
  const brandOptions = useMemo(() => {
    if (!brandKits) return []
    return brandKits.map((b) => ({
      value: b._id as string,
      label: b.name ?? 'Untitled brand',
    }))
  }, [brandKits])

  // Status picker options
  const statusOptions = [
    { value: 'ready', label: 'Ready' },
    { value: 'analyzing', label: 'Analyzing' },
    { value: 'failed', label: 'Failed' },
  ]

  // Client-side filtering
  const filtered = useMemo(() => {
    if (!products) return []
    let list = products
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((p) => p.name.toLowerCase().includes(q))
    }
    if (brandFilter) {
      list = list.filter((p) => (p.brandKitId as string | undefined) === brandFilter)
    }
    if (statusFilter) {
      list = list.filter((p) => p.status === statusFilter)
    }
    return list
  }, [products, search, brandFilter, statusFilter])

  const hasActiveFilters = search.trim() || brandFilter || statusFilter

  return (
    <Container size="lg" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <Group justify="space-between" align="flex-end" wrap="wrap" gap="md">
          <Box>
            <Title order={1} fz={28} fw={700} c="white" mb={4}>
              Products
            </Title>
            <Text size="sm" c="dark.2">
              {isLoading
                ? 'Loading...'
                : `${products.length} product${products.length === 1 ? '' : 's'}`}
            </Text>
          </Box>
          <Button
            component={Link}
            to="/home"
            color="brand"
            leftSection={<IconPlus size={16} />}
          >
            New product
          </Button>
        </Group>

        {/* Filter row */}
        <Group gap="sm" wrap="wrap">
          <TextInput
            placeholder="Search products..."
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            size="sm"
            w={220}
            styles={{
              input: {
                backgroundColor: 'var(--mantine-color-dark-6)',
                borderColor: 'var(--mantine-color-dark-4)',
              },
            }}
          />
          {brandOptions.length > 0 && (
            <Select
              placeholder="All brands"
              data={brandOptions}
              value={brandFilter}
              onChange={setBrandFilter}
              clearable
              size="sm"
              w={200}
              styles={{
                input: {
                  backgroundColor: 'var(--mantine-color-dark-6)',
                  borderColor: 'var(--mantine-color-dark-4)',
                },
              }}
            />
          )}
          <Select
            placeholder="All statuses"
            data={statusOptions}
            value={statusFilter}
            onChange={setStatusFilter}
            clearable
            size="sm"
            w={160}
            styles={{
              input: {
                backgroundColor: 'var(--mantine-color-dark-6)',
                borderColor: 'var(--mantine-color-dark-4)',
              },
            }}
          />
          {hasActiveFilters && (
            <Button
              size="sm"
              variant="subtle"
              color="gray"
              onClick={() => {
                setSearch('')
                setBrandFilter(null)
                setStatusFilter(null)
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
        ) : products.length === 0 ? (
          <EmptyState />
        ) : filtered.length === 0 ? (
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
              No products match the current filters.
            </Text>
            <Button
              variant="subtle"
              color="gray"
              size="xs"
              onClick={() => {
                setSearch('')
                setBrandFilter(null)
                setStatusFilter(null)
              }}
            >
              Clear filters
            </Button>
          </Paper>
        ) : (
          <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
            {filtered.map((product) => (
              <ProductCard
                key={product._id}
                product={product}
                brandName={
                  product.brandKitId
                    ? brandMap.get(product.brandKitId as string) ?? null
                    : null
                }
              />
            ))}
          </SimpleGrid>
        )}
      </Stack>
    </Container>
  )
}

// ─── Product card ────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  analyzing: 'yellow',
  failed: 'red',
}

function ProductCard({
  product,
  brandName,
}: {
  product: {
    _id: string
    name: string
    status: string
    imageUrl?: string
    generationCount: number
    _creationTime: number
  }
  brandName: string | null
}) {
  const navigate = useNavigate()
  const timeAgo = formatRelativeTime(product._creationTime)

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
      onClick={() =>
        navigate({
          to: '/studio/$productId',
          params: { productId: product._id },
        })
      }
    >
      <AspectRatio ratio={4 / 3}>
        <Box pos="relative" w="100%" h="100%">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.name}
              fit="cover"
              w="100%"
              h="100%"
            />
          ) : (
            <Center bg="dark.6" w="100%" h="100%">
              <IconPhoto size={32} color="var(--mantine-color-dark-3)" />
            </Center>
          )}
        </Box>
      </AspectRatio>

      <Stack gap={4} p="sm">
        <Group gap={6} wrap="nowrap">
          <Text size="sm" fw={600} c="white" truncate style={{ flex: 1 }}>
            {capitalizeWords(product.name)}
          </Text>
          {product.status !== 'ready' && (
            <Badge
              size="xs"
              variant="light"
              color={STATUS_COLOR[product.status] ?? 'gray'}
            >
              {product.status}
            </Badge>
          )}
        </Group>

        <Group gap={6} wrap="nowrap">
          {brandName && (
            <Badge size="xs" variant="dot" color="brand">
              {brandName}
            </Badge>
          )}
          <Text size="xs" c="dark.2" style={{ flex: 1 }} truncate>
            {product.generationCount} generation{product.generationCount === 1 ? '' : 's'}
          </Text>
        </Group>

        <Text size="xs" c="dark.3">
          {timeAgo}
        </Text>
      </Stack>
    </Paper>
  )
}

// ─── Empty state ─────────────────────────────────────────────────────────────

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
      <IconLayoutGrid
        size={48}
        style={{
          color: 'var(--mantine-color-brand-5)',
          marginBottom: 16,
        }}
      />
      <Title order={3} fz="lg" fw={600} c="white" mb={8}>
        No products yet
      </Title>
      <Text c="dark.2" mb="xl" maw={400} mx="auto">
        Upload your first product photo, then come back here to browse all your
        products in one place.
      </Text>
      <Button component={Link} to="/home" color="brand" size="md">
        Create your first product
      </Button>
    </Paper>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}
