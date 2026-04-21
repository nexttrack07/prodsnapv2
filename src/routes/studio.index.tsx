import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useAction } from 'convex/react'
import { useConvexMutation, convexQuery } from '@convex-dev/react-query'
import { useRef, useState } from 'react'
import { notifications } from '@mantine/notifications'
import {
  Container,
  Title,
  Text,
  Button,
  Group,
  SimpleGrid,
  Paper,
  Center,
  Loader,
  Stack,
  Box,
  Image,
  Badge,
  FileButton,
  ThemeIcon,
  AspectRatio,
  LoadingOverlay,
} from '@mantine/core'
import { IconUpload, IconPackage } from '@tabler/icons-react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

export const Route = createFileRoute('/studio/')({
  component: ProductGridPage,
})

function ProductGridPage() {
  const navigate = useNavigate()
  const { data: products, isLoading } = useQuery(convexQuery(api.products.listProducts, {}))

  const uploadAction = useAction(api.r2.uploadProductImage)
  const createProduct = useConvexMutation(api.products.createProduct)
  const createProductMutation = useMutation({ mutationFn: createProduct })

  const [isUploading, setIsUploading] = useState(false)

  async function handleFileChange(file: File | null) {
    if (!file) return

    if (!file.type.startsWith('image/')) {
      notifications.show({
        title: 'Invalid file',
        message: 'Please upload an image file',
        color: 'red',
      })
      return
    }
    if (file.size > 10 * 1024 * 1024) {
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
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''),
      )

      const fileName = file.name.replace(/\.[^.]+$/, '')
      const { url } = await uploadAction({
        name: file.name,
        base64,
        contentType: file.type,
      })

      const productId = await createProductMutation.mutateAsync({
        imageUrl: url,
        name: fileName.replace(/[-_]/g, ' '),
      })

      notifications.show({
        title: 'Success',
        message: 'Product created!',
        color: 'green',
      })
      navigate({ to: '/studio/$productId', params: { productId } })
    } catch (err) {
      notifications.show({
        title: 'Upload failed',
        message: err instanceof Error ? err.message : 'Upload failed',
        color: 'red',
      })
    } finally {
      setIsUploading(false)
    }
  }

  const hasProducts = products && products.length > 0

  return (
    <Container size="lg" py="xl">
      <Paper
        radius="xl"
        p="xl"
        mb="xl"
        style={{
          background: 'linear-gradient(135deg, rgba(84, 116, 180, 0.15) 0%, rgba(84, 116, 180, 0.05) 100%)',
          border: '1px solid var(--mantine-color-dark-5)',
        }}
      >
        <Group justify="space-between" align="center">
          <Box>
            <Title order={1} fz={36} fw={600} c="white">
              My Products
            </Title>
            <Text size="lg" c="dark.2" mt={8}>
              Upload product photos and generate ad creatives.
            </Text>
          </Box>
          <FileButton onChange={handleFileChange} accept="image/*" disabled={isUploading}>
            {(props) => (
              <Button
                {...props}
                leftSection={<IconUpload size={18} />}
                size="lg"
                color="brand"
                loading={isUploading}
                style={{
                  boxShadow: '0 4px 20px rgba(84, 116, 180, 0.3)',
                }}
              >
                {isUploading ? 'Uploading...' : 'New Product'}
              </Button>
            )}
          </FileButton>
        </Group>
      </Paper>

      {isLoading ? (
        <Center py={80}>
          <Loader size="lg" color="dark.6" />
        </Center>
      ) : !hasProducts ? (
        <EmptyState onUpload={handleFileChange} isUploading={isUploading} />
      ) : (
        <ProductGrid products={products} />
      )}
    </Container>
  )
}

function EmptyState({
  onUpload,
  isUploading,
}: {
  onUpload: (file: File | null) => void
  isUploading: boolean
}) {
  return (
    <Paper
      radius="xl"
      p={64}
      ta="center"
      withBorder
      style={{
        borderStyle: 'dashed',
        borderWidth: 2,
        borderColor: 'var(--mantine-color-dark-4)',
        background: 'linear-gradient(180deg, rgba(84, 116, 180, 0.08) 0%, transparent 100%)',
      }}
    >
      <ThemeIcon
        size={80}
        radius="xl"
        variant="gradient"
        gradient={{ from: 'brand.7', to: 'brand.5', deg: 135 }}
        mx="auto"
        mb="lg"
        style={{ boxShadow: '0 8px 32px rgba(84, 116, 180, 0.25)' }}
      >
        <IconPackage size={40} />
      </ThemeIcon>
      <Title order={2} fw={600} c="white" mb={8}>
        No products yet
      </Title>
      <Text c="dark.2" size="lg" maw={440} mx="auto" mb="xl">
        Upload your first product photo to get started. We'll analyze it and help you generate
        stunning ad creatives.
      </Text>
      <FileButton onChange={onUpload} accept="image/*" disabled={isUploading}>
        {(props) => (
          <Button
            {...props}
            leftSection={<IconUpload size={18} />}
            size="lg"
            color="brand"
            loading={isUploading}
            style={{
              boxShadow: '0 4px 20px rgba(84, 116, 180, 0.3)',
            }}
          >
            {isUploading ? 'Uploading...' : 'Upload Your First Product'}
          </Button>
        )}
      </FileButton>
    </Paper>
  )
}

interface ProductData {
  _id: Id<'products'>
  name: string
  imageUrl: string
  status: 'analyzing' | 'ready' | 'failed'
  category?: string
  _creationTime: number
  generationCount: number
}

function ProductGrid({ products }: { products: ProductData[] }) {
  return (
    <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="md">
      {products.map((product) => (
        <ProductCard key={product._id} product={product} />
      ))}
    </SimpleGrid>
  )
}

function capitalizeWords(str: string): string {
  return str
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function ProductCard({ product }: { product: ProductData }) {
  return (
    <Paper
      component={Link}
      to="/studio/$productId"
      params={{ productId: product._id } as any}
      radius="lg"
      withBorder
      className="product-card-hover"
      style={{
        overflow: 'hidden',
        textDecoration: 'none',
        borderColor: 'var(--mantine-color-dark-5)',
        backgroundColor: 'var(--mantine-color-dark-7)',
      }}
    >
      <AspectRatio ratio={4 / 3}>
        <Box
          pos="relative"
          p="md"
          style={{
            backgroundColor: 'var(--mantine-color-dark-6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
          }}
        >
          <LoadingOverlay
            visible={product.status === 'analyzing'}
            loaderProps={{ type: 'dots', color: 'brand', size: 'md' }}
            overlayProps={{ blur: 2, backgroundOpacity: 0.5 }}
          />
          <Image
            src={product.imageUrl}
            alt={product.name}
            fit="contain"
            h="100%"
            w="100%"
            style={{
              transition: 'transform 300ms ease',
            }}
          />
          {product.status === 'failed' && (
            <Badge
              color="red"
              variant="filled"
              size="sm"
              pos="absolute"
              top={12}
              right={12}
              style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}
            >
              Failed
            </Badge>
          )}
        </Box>
      </AspectRatio>
      <Box p="md">
        <Text fw={600} size="md" c="white" truncate mb={6}>
          {capitalizeWords(product.name)}
        </Text>
        <Group gap={6} wrap="wrap" mb={10}>
          {product.category && (
            <Badge size="xs" variant="light" color="brand" radius="sm">
              {product.category}
            </Badge>
          )}
          {product.status === 'ready' && (
            <Badge size="xs" variant="light" color="teal" radius="sm">
              Ready
            </Badge>
          )}
        </Group>
        <Group justify="space-between" gap="xs">
          <Text size="xs" c="dark.2">
            {formatDate(product._creationTime)}
          </Text>
          <Text size="xs" c="dark.2" fw={500}>
            {product.generationCount} {product.generationCount === 1 ? 'variation' : 'variations'}
          </Text>
        </Group>
      </Box>
    </Paper>
  )
}
