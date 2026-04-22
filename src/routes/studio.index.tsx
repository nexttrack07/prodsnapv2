import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useAction, useQuery as useConvexQuery } from 'convex/react'
import { useConvexMutation, convexQuery } from '@convex-dev/react-query'
import { useState } from 'react'
import { notifications } from '@mantine/notifications'
import { useMediaQuery } from '@mantine/hooks'
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
  ThemeIcon,
  AspectRatio,
  LoadingOverlay,
  Skeleton,
  Alert,
  Anchor,
} from '@mantine/core'
import { Dropzone, IMAGE_MIME_TYPE } from '@mantine/dropzone'
import { IconUpload, IconPhoto, IconX, IconBolt } from '@tabler/icons-react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { capitalizeWords } from '../utils/strings'
import { MAX_PRODUCT_IMAGE_SIZE } from '../utils/constants'
import { CreditsIndicator } from '../components/billing/CreditsIndicator'
import { mapBillingError } from '../lib/billing/mapBillingError'

export const Route = createFileRoute('/studio/')({
  component: ProductGridPage,
})

function ProductGridPage() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const navigate = useNavigate()
  const { data: products, isLoading } = useQuery(convexQuery(api.products.listProducts, {}))
  const billingStatus = useConvexQuery(api.billing.syncPlan.getBillingStatus)

  const uploadAction = useAction(api.r2.uploadProductImage)
  const createProduct = useConvexMutation(api.products.createProduct)
  const createProductMutation = useMutation({ mutationFn: createProduct })

  const [isUploading, setIsUploading] = useState(false)

  const creditsExhausted =
    billingStatus &&
    billingStatus.creditsTotal > 0 &&
    billingStatus.creditsUsed >= billingStatus.creditsTotal

  const atProductLimit =
    billingStatus &&
    billingStatus.productLimit !== null &&
    billingStatus.productCount >= billingStatus.productLimit

  const resetDate =
    billingStatus?.resetsOn
      ? new Date(billingStatus.resetsOn).toLocaleDateString(undefined, {
          month: 'long',
          day: 'numeric',
        })
      : null

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
      console.error('Upload error:', err)
      const info = mapBillingError(err)
      notifications.show({
        title: info.title === 'Something went wrong' ? 'Upload failed' : info.title,
        message: info.action ? (
          <>{info.message}{' '}<Anchor component={Link} to={info.action.href} size="sm" fw={600}>{info.action.label} →</Anchor></>
        ) : info.message,
        color: 'red',
        autoClose: 8000,
      })
    } finally {
      setIsUploading(false)
    }
  }

  const hasProducts = products && products.length > 0

  return (
    <Container size="lg" py="xl">
      {/* US-U06: Credits exhausted banner */}
      {creditsExhausted && (
        <Alert
          color="red"
          icon={<IconBolt size={16} />}
          mb="md"
          title="Credits exhausted"
        >
          You have used all {billingStatus!.creditsTotal} credits for this month.
          {resetDate ? ` They reset on ${resetDate}.` : ''}{' '}
          <Anchor component={Link} to="/pricing" fw={500}>Upgrade to Pro</Anchor> for 5× more.
        </Alert>
      )}

      <Paper
        radius="lg"
        p={isMobile ? 'md' : 'xl'}
        mb="xl"
        style={{
          background: 'linear-gradient(135deg, rgba(84, 116, 180, 0.15) 0%, rgba(84, 116, 180, 0.05) 100%)',
          border: '1px solid var(--mantine-color-dark-5)',
        }}
      >
        <Stack gap={isMobile ? 'md' : 'sm'}>
          <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
            <Box>
              <Group gap="sm" align="center">
                <Title order={1} fz={isMobile ? 20 : 28} fw={600} c="white">
                  My Products
                </Title>
                {/* US-U07: product count indicator */}
                {billingStatus && billingStatus.productLimit !== null && (
                  <Badge variant="light" color="gray" size="md">
                    {billingStatus.productCount}/{billingStatus.productLimit} products
                  </Badge>
                )}
              </Group>
              <Text size="sm" c="dark.2" mt={8}>
                Upload product photos and generate ad creatives.
              </Text>
            </Box>
            <Group gap="sm" align="center">
              <CreditsIndicator />
              <Dropzone
                onDrop={handleFileDrop}
                accept={IMAGE_MIME_TYPE}
                maxSize={MAX_PRODUCT_IMAGE_SIZE}
                multiple={false}
                disabled={isUploading || !!atProductLimit}
                data-testid="upload-dropzone"
                style={{
                  border: 'none',
                  background: 'none',
                  padding: 0,
                  minHeight: 'auto',
                }}
              >
                <Button
                  leftSection={<IconUpload size={18} />}
                  size={isMobile ? 'md' : 'lg'}
                  fz="sm"
                  color="brand"
                  loading={isUploading}
                  disabled={!!atProductLimit}
                  fullWidth={isMobile}
                  style={{
                    boxShadow: '0 4px 20px rgba(84, 116, 180, 0.3)',
                    pointerEvents: 'none',
                  }}
                >
                  {isUploading ? 'Uploading...' : 'New Product'}
                </Button>
              </Dropzone>
            </Group>
          </Group>
        </Stack>
      </Paper>

      {/* US-U07: product limit banner */}
      {atProductLimit && (
        <Alert
          color="yellow"
          mb="md"
          title="Product limit reached"
        >
          You have {billingStatus!.productCount} products but your plan allows {billingStatus!.productLimit}.
          Archive products or{' '}
          <Anchor component={Link} to="/pricing" fw={500}>upgrade to Pro</Anchor>.
        </Alert>
      )}

      {isLoading ? (
        <ProductGridSkeleton />
      ) : !hasProducts ? (
        <EmptyState onUpload={handleFileDrop} isUploading={isUploading} />
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
  onUpload: (files: File[]) => void
  isUploading: boolean
}) {
  return (
    <Dropzone
      onDrop={onUpload}
      accept={IMAGE_MIME_TYPE}
      maxSize={MAX_PRODUCT_IMAGE_SIZE}
      multiple={false}
      disabled={isUploading}
      radius="lg"
      p={64}
      style={{
        borderStyle: 'dashed',
        borderWidth: 2,
        borderColor: 'var(--mantine-color-dark-4)',
        background: 'linear-gradient(180deg, rgba(84, 116, 180, 0.08) 0%, transparent 100%)',
      }}
    >
      <Stack align="center" gap="md">
        <Dropzone.Accept>
          <ThemeIcon
            size={80}
            radius="lg"
            variant="gradient"
            gradient={{ from: 'green.7', to: 'green.5', deg: 135 }}
            style={{ boxShadow: '0 8px 32px rgba(34, 139, 34, 0.25)' }}
          >
            <IconUpload size={40} />
          </ThemeIcon>
        </Dropzone.Accept>
        <Dropzone.Reject>
          <ThemeIcon
            size={80}
            radius="lg"
            variant="gradient"
            gradient={{ from: 'red.7', to: 'red.5', deg: 135 }}
            style={{ boxShadow: '0 8px 32px rgba(220, 53, 69, 0.25)' }}
          >
            <IconX size={40} />
          </ThemeIcon>
        </Dropzone.Reject>
        <Dropzone.Idle>
          <ThemeIcon
            size={80}
            radius="lg"
            variant="gradient"
            gradient={{ from: 'brand.7', to: 'brand.5', deg: 135 }}
            className="empty-state-icon"
            style={{ boxShadow: '0 8px 32px rgba(84, 116, 180, 0.25)' }}
          >
            <IconPhoto size={40} />
          </ThemeIcon>
        </Dropzone.Idle>

        <Title order={2} fw={600} c="white">
          {isUploading ? 'Uploading...' : 'No products yet'}
        </Title>
        <Text c="dark.2" size="sm" maw={440} ta="center">
          {isUploading
            ? 'Please wait while we process your image'
            : 'Drag & drop a product photo here, or click to browse. We\'ll analyze it and help you generate stunning ad creatives.'}
        </Text>

        {isUploading ? (
          <Loader size="md" color="brand" />
        ) : (
          <Button
            leftSection={<IconUpload size={18} />}
            size="lg"
            fz="sm"
            color="brand"
            style={{
              boxShadow: '0 4px 20px rgba(84, 116, 180, 0.3)',
              pointerEvents: 'none',
            }}
          >
            Upload Your First Product
          </Button>
        )}
      </Stack>
    </Dropzone>
  )
}

interface ProductData {
  _id: Id<'products'>
  name: string
  imageUrl?: string
  primaryImageId?: Id<'productImages'>
  status: 'analyzing' | 'ready' | 'failed'
  category?: string
  _creationTime: number
  generationCount: number
}

function ProductGridSkeleton() {
  return (
    <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="md">
      {Array.from({ length: 8 }).map((_, i) => (
        <Paper
          key={i}
          radius="lg"
          withBorder
          style={{
            overflow: 'hidden',
            borderColor: 'var(--mantine-color-dark-5)',
            backgroundColor: 'var(--mantine-color-dark-7)',
          }}
        >
          <AspectRatio ratio={1}>
            <Skeleton height="100%" radius={0} />
          </AspectRatio>
          <Box p="sm">
            <Skeleton height={16} width="70%" mb="xs" />
            <Skeleton height={12} width="40%" />
          </Box>
        </Paper>
      ))}
    </SimpleGrid>
  )
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
    <Link
      to="/studio/$productId"
      params={{ productId: product._id }}
      style={{ textDecoration: 'none' }}
      data-testid={`product-card-${product._id}`}
    >
      <Paper
        radius="lg"
        withBorder
        className="product-card-hover"
        style={{
          overflow: 'hidden',
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
            src={product.imageUrl || ''}
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
        <Text fw={500} size="sm" c="white" truncate mb={6}>
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
    </Link>
  )
}
