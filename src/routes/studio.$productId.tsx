import { createFileRoute, Link, Outlet, useRouterState } from '@tanstack/react-router'
import { useQuery, useMutation, useInfiniteQuery } from '@tanstack/react-query'
import { useConvexMutation, convexQuery } from '@convex-dev/react-query'
import { useAction, useQuery as useConvexQuery } from 'convex/react'
import { useState, useRef, useCallback, useEffect } from 'react'
import { notifications } from '@mantine/notifications'
import { useMediaQuery, useHotkeys } from '@mantine/hooks'
import { useConvex } from 'convex/react'
import {
  Container,
  Title,
  Text,
  Box,
  Center,
  Group,
  Stack,
  Button,
  Paper,
  Card,
  Image,
  Badge,
  Loader,
  TextInput,
  Checkbox,
  Radio,
  ActionIcon,
  Overlay,
  Anchor,
  UnstyledButton,
  Modal,
  Drawer,
  CloseButton,
  SegmentedControl,
  AspectRatio,
  Tooltip,
  ThemeIcon,
  Skeleton,
  Alert,
  Select,
} from '@mantine/core'
import { Dropzone, IMAGE_MIME_TYPE } from '@mantine/dropzone'
import {
  IconChevronLeft,
  IconArrowRight,
  IconCheck,
  IconMaximize,
  IconDownload,
  IconTrash,
  IconSparkles,
  IconAlignLeft,
  IconPhoto,
  IconPalette,
  IconEraser,
  IconX,
  IconRefresh,
  IconPlus,
  IconStar,
  IconStarFilled,
  IconUpload,
  IconLoader2,
  IconAlertTriangle,
  IconBolt,
  IconLayoutGrid,
} from '@tabler/icons-react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { capitalizeWords } from '../utils/strings'
import {
  ImageEnhancerModal,
  type ImageEnhancerImage,
} from '../components/product/ImageEnhancerModal'
import { CreditsIndicator } from '../components/billing/CreditsIndicator'
import { ModelSelect } from '../components/ModelSelect'
import { mapGenerationError } from '../lib/billing/mapBillingError'
import { fetchDownloadAsset } from '../utils/downloads'

export const Route = createFileRoute('/studio/$productId')({
  component: ProductWorkspacePage,
})

type AspectRatio = '1:1' | '4:5' | '9:16'
type Mode = 'exact' | 'remix'
type View = 'gallery' | 'generate'

// Type for generation data from the query
interface GenerationData {
  _id: Id<'templateGenerations'>
  _creationTime?: number
  status: string
  outputUrl?: string
  currentStep?: string
  error?: string
  startedAt?: number
  aspectRatio?: string
  mode?: 'exact' | 'remix' | 'variation'
  templateSnapshot?: { name?: string; aspectRatio?: string }
  adCopy?: {
    headlines: string[]
    primaryTexts: string[]
    ctas: string[]
    generatedAt: number
  }
}

const GENERATION_TIMEOUT_MS = 90_000

function slugifyFilePart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'image'
}

function inferFileExtension(url: string, contentType?: string | null): string {
  if (contentType) {
    if (contentType.includes('png')) return 'png'
    if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg'
    if (contentType.includes('webp')) return 'webp'
    if (contentType.includes('gif')) return 'gif'
  }

  try {
    const pathname = new URL(url).pathname
    const match = pathname.match(/\.([a-zA-Z0-9]+)$/)
    if (match?.[1]) return match[1].toLowerCase()
  } catch {
    // ignore URL parsing failures and fall back below
  }

  return 'png'
}

async function downloadFile(url: string, fileBaseName: string) {
  const { base64, contentType } = await fetchDownloadAsset({ data: { url } })
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  const blob = new Blob([bytes], { type: contentType || 'application/octet-stream' })
  const extension = inferFileExtension(url, contentType)
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = objectUrl
  link.download = `${slugifyFilePart(fileBaseName)}.${extension}`
  document.body.appendChild(link)
  link.click()
  link.remove()

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

type TemplateFilters = {
  productCategory?: string | null
  imageStyle?: string | null
  setting?: string | null
  angleType?: string | null
}

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

function ProductWorkspacePage() {
  const { productId } = Route.useParams()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  // Nested routes (e.g. /studio/$productId/strategy) take over the page —
  // render only the child Outlet and skip the workspace content.
  const isChildActive = pathname !== `/studio/${productId}`
  const [view, setView] = useState<View>('gallery')
  const [initialFilters, setInitialFilters] = useState<TemplateFilters>({})

  const { data: product, isLoading: productLoading } = useQuery(
    convexQuery(api.products.getProductWithStats, { productId: productId as Id<'products'> }),
  )

  const { data: generations } = useQuery(
    convexQuery(api.products.getProductGenerations, { productId: productId as Id<'products'> }),
  )

  // Fetch product images to get the primary image URL
  const { data: productImages } = useQuery(
    convexQuery(api.productImages.getProductImagesList, { productId: productId as Id<'products'> }),
  )

  const billingStatus = useConvexQuery(api.billing.syncPlan.getBillingStatus)

  // Get the primary image URL (or fallback to legacy imageUrl)
  const primaryImage = productImages?.find((img) => img._id === product?.primaryImageId)
  const primaryImageUrl = primaryImage?.imageUrl || product?.imageUrl

  const creditsExhausted =
    billingStatus != null &&
    billingStatus.creditsTotal > 0 &&
    billingStatus.creditsUsed >= billingStatus.creditsTotal

  const resetDate =
    billingStatus?.resetsOn
      ? new Date(billingStatus.resetsOn).toLocaleDateString(undefined, {
          month: 'long',
          day: 'numeric',
        })
      : null

  if (isChildActive) {
    return <Outlet />
  }

  if (productLoading) {
    return (
      <Container size="lg" py={40}>
        <Group gap="xs" mb="lg">
          <Skeleton height={20} width={100} radius="sm" />
          <Skeleton height={20} width={20} radius="sm" />
          <Skeleton height={20} width={150} radius="sm" />
        </Group>
        <Stack gap="xl">
          <Paper p="lg" radius="lg" withBorder style={{ borderColor: 'var(--mantine-color-dark-5)' }}>
            <Group align="flex-start" gap="xl">
              <Skeleton height={200} width={200} radius="md" />
              <Stack gap="md" style={{ flex: 1 }}>
                <Skeleton height={28} width="60%" />
                <Skeleton height={16} width="40%" />
                <Skeleton height={60} width="100%" />
              </Stack>
            </Group>
          </Paper>
          <Paper p="lg" radius="lg" withBorder style={{ borderColor: 'var(--mantine-color-dark-5)' }}>
            <Skeleton height={24} width={150} mb="md" />
            <Group gap="md">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} height={100} width={100} radius="md" />
              ))}
            </Group>
          </Paper>
        </Stack>
      </Container>
    )
  }

  if (!product) {
    return (
      <Container size="lg" py={40}>
        <Box py={80} ta="center">
          <Title order={2} fz="xl" fw={500} c="white" mb="xs">Product not found</Title>
          <Anchor component={Link} to="/studio" c="brand.5">
            Back to products
          </Anchor>
        </Box>
      </Container>
    )
  }

  const completedGenerations = (generations?.filter((g) => g.status === 'complete') || []) as GenerationData[]
  const pendingGenerations = (generations?.filter((g) => g.status !== 'complete' && g.status !== 'failed') || []) as GenerationData[]

  const anglesCount = product.marketingAngles?.length ?? 0

  return (
    <Container size="lg" py="md">
      {/* US-U06: Credits exhausted banner */}
      {creditsExhausted && (
        <Alert
          color="red"
          icon={<IconBolt size={16} />}
          mb="md"
          title="Credits exhausted"
        >
          You have used all {billingStatus!.creditsTotal} credits for this billing period.
          {resetDate ? ` They reset on ${resetDate}.` : ''}{' '}
          <Anchor component={Link} to="/pricing" fw={500}>Upgrade to Pro</Anchor> for 5× more.
        </Alert>
      )}

      {/* Rich product card - hidden only in generate mode */}
      {view !== 'generate' && (
        <ProductHeader
          product={product}
          productId={productId as Id<'products'>}
          primaryImageUrl={primaryImageUrl}
          anglesCount={anglesCount}
          onNewAd={() => setView('generate')}
          creditsExhausted={creditsExhausted}
        />
      )}

      {view === 'gallery' && (
        <GalleryView
          product={product}
          productId={productId as Id<'products'>}
          primaryImageUrl={primaryImageUrl}
          legacyImageUrl={product?.imageUrl}
          completedGenerations={completedGenerations}
          pendingGenerations={pendingGenerations}
          onGenerateMore={() => setView('generate')}
          creditsExhausted={creditsExhausted}
        />
      )}

      {view === 'generate' && (
        <GenerateWizard
          productId={productId as Id<'products'>}
          product={product}
          primaryImageUrl={primaryImageUrl}
          onBack={() => setView('gallery')}
          onComplete={() => setView('gallery')}
          creditsExhausted={creditsExhausted}
          initialFilters={initialFilters}
        />
      )}
    </Container>
  )
}

function ProductHeader({
  product,
  productId,
  primaryImageUrl,
  anglesCount,
  onNewAd,
  creditsExhausted,
}: {
  product: {
    _id: Id<'products'>
    name: string
    status: 'analyzing' | 'ready' | 'failed'
    category?: string
    productDescription?: string
    generationCount: number
    primaryImageId?: Id<'productImages'>
  }
  productId: Id<'products'>
  primaryImageUrl?: string
  anglesCount: number
  onNewAd: () => void
  creditsExhausted: boolean
}) {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [isEditingName, setIsEditingName] = useState(false)
  const [editedName, setEditedName] = useState('')
  const [activeImage, setActiveImage] = useState<ImageEnhancerImage | null>(null)
  const [isUploadingImage, setIsUploadingImage] = useState(false)

  const updateProduct = useConvexMutation(api.products.updateProduct)
  const updateMutation = useMutation({ mutationFn: updateProduct })
  const reanalyzeProduct = useConvexMutation(api.products.reanalyzeProduct)
  const reanalyzeMutation = useMutation({ mutationFn: reanalyzeProduct })

  const { data: productImages } = useQuery(
    convexQuery(api.productImages.getProductImagesList, { productId }),
  )

  const uploadAction = useAction(api.r2.uploadProductImage)
  const addImage = useConvexMutation(api.productImages.addProductImage)
  const addImageMutation = useMutation({ mutationFn: addImage })

  const sourceImages = (productImages ?? []).filter((img) => img.type === 'original')
  const originalCount = sourceImages.length

  async function handleSaveName() {
    if (!editedName.trim()) return
    try {
      await updateMutation.mutateAsync({
        productId: product._id,
        name: editedName.trim(),
      })
      setIsEditingName(false)
      notifications.show({ title: 'Success', message: 'Name updated', color: 'green' })
    } catch {
      notifications.show({ title: 'Error', message: 'Failed to update name', color: 'red' })
    }
  }

  async function handleRetryAnalysis() {
    try {
      await reanalyzeMutation.mutateAsync({ productId: product._id })
      notifications.show({
        title: 'Analysis restarted',
        message: 'We are analyzing this product again.',
        color: 'green',
      })
    } catch (err) {
      notifications.show({
        title: 'Retry failed',
        message: err instanceof Error ? err.message : 'Could not restart analysis',
        color: 'red',
      })
    }
  }

  async function handleUploadSourceImage(files: File[]) {
    const file = files[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      notifications.show({
        title: 'Too large',
        message: 'Image must be under 10 MB',
        color: 'red',
      })
      return
    }
    setIsUploadingImage(true)
    try {
      const arrayBuffer = await file.arrayBuffer()
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          '',
        ),
      )
      const { url } = await uploadAction({
        name: file.name,
        base64,
        contentType: file.type,
      })
      await addImageMutation.mutateAsync({ productId, imageUrl: url })
      notifications.show({ title: 'Added', message: 'Source image added.', color: 'green' })
    } catch (err) {
      notifications.show({
        title: 'Upload failed',
        message: err instanceof Error ? err.message : 'Try again',
        color: 'red',
      })
    } finally {
      setIsUploadingImage(false)
    }
  }

  return (
    <>
      <Paper
        radius="lg"
        p={isMobile ? 'md' : 'xl'}
        mb="xl"
        style={{
          background: 'linear-gradient(135deg, rgba(84, 116, 180, 0.08) 0%, rgba(0, 0, 0, 0) 60%)',
          border: '1px solid var(--mantine-color-dark-6)',
        }}
      >
        <Group
          align="flex-start"
          gap={isMobile ? 'md' : 'xl'}
          wrap={isMobile ? 'wrap' : 'nowrap'}
        >
          {/* Primary image — bigger on the left */}
          <Box
            w={isMobile ? '100%' : 240}
            h={isMobile ? 220 : 240}
            style={{
              borderRadius: 'var(--mantine-radius-lg)',
              overflow: 'hidden',
              flexShrink: 0,
              border: '1px solid var(--mantine-color-dark-5)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
            }}
            bg="dark.7"
          >
            {primaryImageUrl ? (
              <Image src={primaryImageUrl} alt={product.name} fit="cover" h="100%" w="100%" />
            ) : (
              <Center h="100%">
                <IconPhoto size={36} color="var(--mantine-color-dark-3)" />
              </Center>
            )}
          </Box>

          {/* Right column */}
          <Stack gap="md" style={{ flex: 1, minWidth: 0 }}>
            {/* Name (editable) + Strategy link */}
            <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
              <Box style={{ flex: 1, minWidth: 0 }}>
                {isEditingName ? (
                  <Group gap="xs">
                    <TextInput
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      size="lg"
                      variant="unstyled"
                      styles={{
                        input: {
                          fontSize: '1.5rem',
                          fontWeight: 700,
                          borderBottom: '2px solid var(--mantine-color-brand-6)',
                          color: 'white',
                        },
                      }}
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                    />
                    <Button size="xs" variant="light" color="brand" onClick={handleSaveName}>
                      Save
                    </Button>
                    <Button
                      size="xs"
                      variant="subtle"
                      color="gray"
                      onClick={() => setIsEditingName(false)}
                    >
                      Cancel
                    </Button>
                  </Group>
                ) : (
                  <Title
                    order={1}
                    fz={isMobile ? 22 : 28}
                    fw={700}
                    c="white"
                    mb={4}
                    tabIndex={0}
                    role="button"
                    aria-label={`Edit product name: ${product.name}`}
                    style={{ cursor: 'pointer', letterSpacing: '-0.02em' }}
                    onClick={() => {
                      setEditedName(product.name)
                      setIsEditingName(true)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setEditedName(product.name)
                        setIsEditingName(true)
                      }
                    }}
                    title="Click to edit"
                  >
                    {capitalizeWords(product.name)}
                  </Title>
                )}
                <Group gap={6} mt={6}>
                  {product.category && (
                    <Badge size="sm" variant="light" color="brand" radius="sm">
                      {product.category}
                    </Badge>
                  )}
                  <Badge size="sm" variant="outline" color="gray" radius="sm">
                    {product.generationCount}{' '}
                    {product.generationCount === 1 ? 'ad' : 'ads'}
                  </Badge>
                  <StatusBadge status={product.status} />
                </Group>
              </Box>

              <Link
                to="/studio/$productId/strategy"
                params={{ productId: product._id }}
                style={{
                  textDecoration: 'none',
                  color: 'var(--mantine-color-brand-4)',
                  fontSize: 14,
                  fontWeight: 500,
                  flexShrink: 0,
                }}
              >
                <Group gap={4}>
                  Strategy
                  {anglesCount > 0 && (
                    <Badge size="xs" variant="light" color="brand" radius="sm">
                      {anglesCount}
                    </Badge>
                  )}
                  <IconArrowRight size={14} />
                </Group>
              </Link>
            </Group>

            {/* Description */}
            {product.productDescription && (
              <Text size="sm" c="dark.1" lh={1.6} maw={680}>
                {product.productDescription}
              </Text>
            )}

            {/* Source images strip */}
            <Stack gap={6}>
              <Text size="xs" tt="uppercase" fw={700} c="dark.2">
                Source images
              </Text>
              <Group gap="xs" wrap="wrap">
                {sourceImages.map((img) => {
                  const isPrimary = img._id === product.primaryImageId
                  return (
                    <SourceImageTile
                      key={img._id}
                      imageUrl={img.imageUrl}
                      status={img.status}
                      isPrimary={isPrimary}
                      onClick={() =>
                        setActiveImage({
                          _id: img._id,
                          imageUrl: img.imageUrl,
                          type: img.type,
                          status: img.status,
                          parentImageId: img.parentImageId,
                          error: img.error,
                          _creationTime: img._creationTime,
                        })
                      }
                    />
                  )
                })}
                <SourceImageDropzone
                  onDrop={handleUploadSourceImage}
                  loading={isUploadingImage}
                />
              </Group>
            </Stack>

            {/* Actions row */}
            <Group justify="flex-end" gap="sm">
              <Button
                color="brand"
                size="md"
                leftSection={<IconPlus size={16} />}
                disabled={creditsExhausted || product.status !== 'ready'}
                onClick={onNewAd}
              >
                New ad
              </Button>
            </Group>

            {product.status === 'failed' && (
              <Alert
                color="red"
                variant="light"
                title="Product analysis failed"
                icon={<IconAlertTriangle size={16} />}
              >
                <Stack gap="sm">
                  <Text size="sm">Retry analysis to unlock generation for this product.</Text>
                  <Button
                    w="fit-content"
                    size="xs"
                    color="red"
                    variant="light"
                    leftSection={<IconRefresh size={13} />}
                    loading={reanalyzeMutation.isPending}
                    onClick={handleRetryAnalysis}
                  >
                    Retry analysis
                  </Button>
                </Stack>
              </Alert>
            )}
          </Stack>
        </Group>
      </Paper>

      <ImageEnhancerModal
        opened={activeImage !== null}
        onClose={() => setActiveImage(null)}
        image={activeImage}
        productId={productId}
        productName={product.name}
        isPrimary={
          activeImage !== null && activeImage._id === product.primaryImageId
        }
        originalCount={originalCount}
      />
    </>
  )
}

function SourceImageTile({
  imageUrl,
  status,
  isPrimary,
  onClick,
}: {
  imageUrl: string
  status: 'processing' | 'ready' | 'failed'
  isPrimary: boolean
  onClick: () => void
}) {
  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      w={64}
      h={64}
      pos="relative"
      style={{
        borderRadius: 8,
        overflow: 'hidden',
        cursor: 'pointer',
        backgroundColor: 'var(--mantine-color-dark-6)',
        border: isPrimary
          ? '2px solid var(--mantine-color-brand-5)'
          : '1px solid var(--mantine-color-dark-5)',
        flexShrink: 0,
        transition: 'transform 120ms ease',
      }}
    >
      {status === 'processing' ? (
        <Center h="100%">
          <Loader size="xs" color="brand" />
        </Center>
      ) : (
        <Image src={imageUrl} alt="" fit="cover" w="100%" h="100%" />
      )}
      {isPrimary && (
        <Box
          pos="absolute"
          top={2}
          right={2}
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            backgroundColor: 'var(--mantine-color-brand-6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
          }}
        >
          <IconStarFilled size={10} />
        </Box>
      )}
    </Box>
  )
}

function SourceImageDropzone({
  onDrop,
  loading,
}: {
  onDrop: (files: File[]) => void
  loading: boolean
}) {
  return (
    <Dropzone
      onDrop={onDrop}
      accept={IMAGE_MIME_TYPE}
      maxSize={10 * 1024 * 1024}
      multiple={false}
      disabled={loading}
      style={{
        border: '1px dashed var(--mantine-color-dark-4)',
        borderRadius: 8,
        backgroundColor: 'var(--mantine-color-dark-7)',
        width: 64,
        height: 64,
        padding: 0,
        minHeight: 'auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      {loading ? (
        <Loader size="xs" color="brand" />
      ) : (
        <IconPlus size={20} color="var(--mantine-color-dark-2)" />
      )}
    </Dropzone>
  )
}

function ReanalyzeMissingState({ productId }: { productId: Id<'products'> }) {
  const reanalyzeProduct = useConvexMutation(api.products.reanalyzeProduct)
  const reanalyzeMutation = useMutation({ mutationFn: reanalyzeProduct })

  async function handleReanalyze() {
    try {
      await reanalyzeMutation.mutateAsync({ productId })
      notifications.show({
        title: 'Analysis restarted',
        message: 'We are analyzing this product again.',
        color: 'green',
      })
    } catch (err) {
      notifications.show({
        title: 'Retry failed',
        message: err instanceof Error ? err.message : 'Could not restart analysis',
        color: 'red',
      })
    }
  }

  return (
    <Box py={60} ta="center">
      <Text size="sm" c="dark.1" mb="md">
        No marketing analysis yet.
      </Text>
      <Button
        size="sm"
        variant="light"
        color="brand"
        leftSection={<IconRefresh size={14} />}
        loading={reanalyzeMutation.isPending}
        onClick={handleReanalyze}
      >
        Re-run analysis
      </Button>
    </Box>
  )
}

function MarketingAnalysisPanel({
  product,
  productId,
  onExploreAngle,
}: {
  product: {
    status: 'analyzing' | 'ready' | 'failed'
    valueProposition?: string
    marketingAngles?: Array<{
      title: string
      description: string
      hook: string
      suggestedAdStyle: string
      angleType?: string
      tags?: {
        productCategory?: string
        imageStyle?: string
        setting?: string
        primaryColor?: string
      }
    }>
  }
  productId: Id<'products'>
  onExploreAngle: (filters: TemplateFilters) => void
}) {
  const submitAngle = useConvexMutation(api.angleGenerations.submitAngleGeneration)
  const [angleGenState, setAngleGenState] = useState<{
    angleIndex: number
    angleTitle: string
  } | null>(null)

  useEffect(() => {
    setAngleGenState(null)
  }, [productId])

  if (product.status === 'analyzing') {
    return (
      <Box py={60} ta="center">
        <Loader size="sm" mb="md" />
        <Text size="sm" c="dark.1">
          Analyzing your product to suggest marketing angles…
        </Text>
      </Box>
    )
  }

  if (product.status === 'failed' || !product.marketingAngles?.length) {
    return (
      <ReanalyzeMissingState productId={productId} />
    )
  }

  return (
    <>
      <Stack gap="lg">
        {product.valueProposition && (
          <Box>
            <Text size="xs" tt="uppercase" fw={700} c="dark.2" mb={6}>
              Value proposition
            </Text>
            <Title order={3} c="white">
              {product.valueProposition}
            </Title>
          </Box>
        )}
        <Box>
          <Text size="xs" tt="uppercase" fw={700} c="dark.2" mb={6}>
            Marketing angles
          </Text>
          <Stack gap="md">
            {product.marketingAngles.map((angle, index) => (
              <Paper
                key={`${angle.title}-${index}`}
                withBorder
                radius="md"
                p="lg"
                style={{ background: 'rgba(255,255,255,0.02)' }}
              >
                <Group justify="space-between" align="flex-start" gap="md" wrap="wrap">
                  <Box style={{ flex: 1, minWidth: 200 }}>
                    <Group gap="sm" align="center">
                      <Text size="sm" fw={700} c="white">
                        {angle.title}
                      </Text>
                      <Badge size="xs" color="teal" variant="light" radius="sm">
                        {angle.suggestedAdStyle}
                      </Badge>
                      {angle.angleType && (
                        <Badge size="xs" color={angleTypeColor(angle.angleType)} variant="light" radius="sm">
                          {angleTypeLabel(angle.angleType)}
                        </Badge>
                      )}
                    </Group>
                    <Text mt={6} size="sm" c="dark.1">
                      {angle.description}
                    </Text>
                    <Text mt="xs" size="sm" c="dark.0" fs="italic">
                      "{angle.hook}"
                    </Text>
                  </Box>
                  <Stack gap={6}>
                    <Button
                      size="xs"
                      variant="light"
                      color="brand"
                      leftSection={<IconSparkles size={12} />}
                      onClick={() =>
                        setAngleGenState({ angleIndex: index, angleTitle: angle.title })
                      }
                    >
                      Generate visuals
                    </Button>
                    <Button
                      size="xs"
                      variant="default"
                      leftSection={<IconLayoutGrid size={12} />}
                      onClick={() => {
                        const filters: TemplateFilters = {
                          ...(angle.tags
                            ? {
                                productCategory: angle.tags.productCategory,
                                imageStyle: angle.tags.imageStyle,
                                setting: angle.tags.setting,
                              }
                            : {}),
                          ...(angle.angleType ? { angleType: angle.angleType } : {}),
                        }
                        onExploreAngle(filters)
                      }}
                    >
                      Explore templates
                    </Button>
                  </Stack>
                </Group>
              </Paper>
            ))}
          </Stack>
        </Box>
      </Stack>

      <GenerateFromAngleModal
        state={angleGenState}
        onClose={() => setAngleGenState(null)}
        onSubmit={async ({ aspectRatio, count }) => {
          if (!angleGenState) return
          try {
            await submitAngle({
              productId,
              angleIndex: angleGenState.angleIndex,
              aspectRatio,
              count,
            })
            notifications.show({
              title: 'Generating',
              message: `${count} variant${count === 1 ? '' : 's'} for "${angleGenState.angleTitle}". Watch the gallery.`,
              color: 'green',
            })
            setAngleGenState(null)
          } catch (err) {
            notifications.show({
              title: 'Couldn\'t start generation',
              message: err instanceof Error ? err.message : String(err),
              color: 'red',
            })
          }
        }}
      />
    </>
  )
}

function GenerateFromAngleModal({
  state,
  onClose,
  onSubmit,
}: {
  state: { angleIndex: number; angleTitle: string } | null
  onClose: () => void
  onSubmit: (args: { aspectRatio: '1:1' | '4:5' | '9:16'; count: number }) => Promise<void>
}) {
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '4:5' | '9:16'>('1:1')
  const [count, setCount] = useState(2)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      await onSubmit({ aspectRatio, count })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      opened={!!state}
      onClose={onClose}
      title={state ? `Generate visuals for "${state.angleTitle}"` : 'Generate from angle'}
      size="md"
      radius="md"
      centered
    >
      <Stack gap="md">
        <Box>
          <Text size="xs" tt="uppercase" fw={700} c="dark.2" mb={6}>
            Aspect ratio
          </Text>
          <SegmentedControl
            fullWidth
            value={aspectRatio}
            onChange={(v) => setAspectRatio(v as '1:1' | '4:5' | '9:16')}
            data={[
              { label: '1:1', value: '1:1' },
              { label: '4:5', value: '4:5' },
              { label: '9:16', value: '9:16' },
            ]}
          />
        </Box>
        <Box>
          <Text size="xs" tt="uppercase" fw={700} c="dark.2" mb={6}>
            Variations
          </Text>
          <SegmentedControl
            fullWidth
            value={String(count)}
            onChange={(v) => setCount(Number(v))}
            data={[
              { label: '1', value: '1' },
              { label: '2', value: '2' },
              { label: '3', value: '3' },
              { label: '4', value: '4' },
            ]}
          />
        </Box>
        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            color="brand"
            loading={submitting}
            onClick={handleSubmit}
            leftSection={<IconSparkles size={14} />}
          >
            Generate {count} variant{count === 1 ? '' : 's'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

function CopySection({
  label,
  items,
  onCopy,
  inline,
}: {
  label: string
  items: string[]
  onCopy: (value: string, label: string) => void
  inline?: boolean
}) {
  return (
    <Box>
      <Text size="xs" tt="uppercase" fw={700} c="dark.2" mb={6}>
        {label}
      </Text>
      <Stack gap="xs">
        {items.map((item, idx) => (
          <Group
            key={`${label}-${idx}`}
            gap="sm"
            justify="space-between"
            align="center"
            wrap="nowrap"
            style={{
              padding: '8px 12px',
              background: 'rgba(255,255,255,0.04)',
              borderRadius: 6,
            }}
          >
            <Text
              size={inline ? 'sm' : 'sm'}
              c="white"
              style={{ flex: 1, minWidth: 0 }}
            >
              {item}
            </Text>
            <Button
              size="compact-xs"
              variant="subtle"
              onClick={() => onCopy(item, `${label.toLowerCase()} copied`)}
            >
              Copy
            </Button>
          </Group>
        ))}
      </Stack>
    </Box>
  )
}

interface ProductImageData {
  _id: Id<'productImages'>
  imageUrl: string
  type: 'original' | 'background-removed'
  status: 'processing' | 'ready' | 'failed'
  parentImageId?: Id<'productImages'>
  error?: string
}

interface ProductImageWithEnhancements extends ProductImageData {
  enhancements: ProductImageData[]
}

function ImageGallerySection({
  product,
  productId,
  legacyImageUrl,
}: {
  product: {
    name: string
    primaryImageId?: Id<'productImages'>
  }
  productId: Id<'products'>
  legacyImageUrl?: string
}) {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [deleteTarget, setDeleteTarget] = useState<{ imageId: Id<'productImages'>; isLast: boolean } | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  // Fetch product images
  const { data: productImages, isLoading } = useQuery(
    convexQuery(api.productImages.getProductImages, { productId }),
  )

  // Upload action and mutation
  const uploadAction = useAction(api.r2.uploadProductImage)
  const addImage = useConvexMutation(api.productImages.addProductImage)
  const addImageMutation = useMutation({ mutationFn: addImage })

  // Mutations
  const removeBackground = useConvexMutation(api.productImages.removeImageBackground)
  const removeBgMutation = useMutation({ mutationFn: removeBackground })

  const setPrimary = useConvexMutation(api.productImages.setPrimaryImage)
  const setPrimaryMutation = useMutation({ mutationFn: setPrimary })

  const deleteImage = useConvexMutation(api.productImages.deleteProductImage)
  const deleteMutation = useMutation({ mutationFn: deleteImage })

  async function handleUpload(files: File[]) {
    const file = files[0]
    if (!file) return

    const MAX_SIZE = 10 * 1024 * 1024 // 10MB
    if (file.size > MAX_SIZE) {
      notifications.show({ title: 'File too large', message: 'Image must be under 10 MB', color: 'red' })
      return
    }

    setIsUploading(true)
    try {
      const arrayBuffer = await file.arrayBuffer()
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''),
      )

      const { url } = await uploadAction({
        name: file.name,
        base64,
        contentType: file.type,
      })

      await addImageMutation.mutateAsync({
        productId,
        imageUrl: url,
      })

      notifications.show({ title: 'Success', message: 'Image added!', color: 'green' })
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

  async function handleRemoveBackground(imageId: Id<'productImages'>) {
    try {
      await removeBgMutation.mutateAsync({ imageId })
      notifications.show({ title: 'Processing', message: 'Removing background...', color: 'blue' })
    } catch (err) {
      notifications.show({
        title: 'Error',
        message: err instanceof Error ? err.message : 'Failed to start',
        color: 'red',
      })
    }
  }

  async function handleSetPrimary(imageId: Id<'productImages'>) {
    try {
      await setPrimaryMutation.mutateAsync({ productId, imageId })
      notifications.show({ title: 'Success', message: 'Primary image updated', color: 'green' })
    } catch (err) {
      notifications.show({
        title: 'Error',
        message: err instanceof Error ? err.message : 'Failed to update',
        color: 'red',
      })
    }
  }

  async function handleDeleteImage(imageId: Id<'productImages'>, confirmDeleteProduct = false) {
    try {
      const result = await deleteMutation.mutateAsync({ imageId, confirmDeleteProduct })
      if (result && 'requiresConfirmation' in result && result.requiresConfirmation) {
        // Get all images to check if this is the last one
        const allImages = productImages?.flatMap((img) => [img, ...img.enhancements]) || []
        setDeleteTarget({ imageId, isLast: allImages.length === 1 })
        return
      }
      notifications.show({ title: 'Success', message: 'Image deleted', color: 'green' })
    } catch (err) {
      notifications.show({
        title: 'Error',
        message: err instanceof Error ? err.message : 'Failed to delete',
        color: 'red',
      })
    }
  }

  async function confirmDeleteWithProduct() {
    if (!deleteTarget) return
    try {
      await deleteMutation.mutateAsync({ imageId: deleteTarget.imageId, confirmDeleteProduct: true })
      notifications.show({ title: 'Success', message: 'Product deleted', color: 'green' })
      // Navigate back to products list
      window.location.href = '/studio'
    } catch (err) {
      notifications.show({
        title: 'Error',
        message: err instanceof Error ? err.message : 'Failed to delete',
        color: 'red',
      })
    } finally {
      setDeleteTarget(null)
    }
  }

  // Flatten all images for display
  const allImages: Array<ProductImageData & { isPrimary: boolean }> = []
  productImages?.forEach((img) => {
    allImages.push({ ...img, isPrimary: img._id === product.primaryImageId })
    img.enhancements.forEach((enh) => {
      allImages.push({ ...enh, isPrimary: enh._id === product.primaryImageId })
    })
  })

  // Check if we have a legacy product with no productImages records
  const hasLegacyImageOnly = allImages.length === 0 && legacyImageUrl

  if (isLoading) {
    return (
      <Box mb="xl">
        <Group justify="space-between" mb="md">
          <Box>
            <Title order={2} fz="xl" fw={600} c="white" mb={4}>Product Images</Title>
            <Text size="sm" c="dark.2">Select primary image for ad generation</Text>
          </Box>
        </Group>
        <Box py="xl" ta="center">
          <Loader size="sm" color="brand" />
        </Box>
      </Box>
    )
  }

  return (
    <Box mb="xl">
      <Group justify="space-between" mb="md">
        <Box>
          <Title order={2} fz="xl" fw={600} c="white" mb={4}>Product Images</Title>
          <Text size="sm" c="dark.2">Select primary image for ad generation</Text>
        </Box>
      </Group>

      <Box
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : `repeat(${Math.min(allImages.length + 2, 4)}, 1fr)`,
          gap: 'var(--mantine-spacing-md)',
          maxWidth: '800px',
        }}
      >
        {/* Show legacy image if no productImages exist yet */}
        {hasLegacyImageOnly && (
          <Paper
            radius="lg"
            p="sm"
            withBorder
            style={{
              borderColor: 'var(--mantine-color-brand-5)',
              backgroundColor: 'var(--mantine-color-dark-7)',
              position: 'relative',
            }}
          >
            <Badge
              size="xs"
              color="brand"
              variant="filled"
              pos="absolute"
              top={8}
              left={8}
              style={{ zIndex: 1 }}
              leftSection={<IconStarFilled size={10} />}
            >
              Primary
            </Badge>
            <Badge
              size="xs"
              color="gray"
              variant="light"
              pos="absolute"
              top={8}
              right={8}
              style={{ zIndex: 1 }}
            >
              Original
            </Badge>
            <Box
              mt="lg"
              style={{
                borderRadius: 'var(--mantine-radius-md)',
                overflow: 'hidden',
                border: '1px solid var(--mantine-color-dark-5)',
              }}
            >
              <Image src={legacyImageUrl} alt={product.name} fit="contain" mah={150} />
            </Box>
            <Text size="xs" c="dark.3" ta="center" mt="sm">
              Legacy image - add more below
            </Text>
          </Paper>
        )}

        {/* Show all product images */}
        {allImages.map((img) => (
          <ImageCard
            key={img._id}
            image={img}
            isPrimary={img.isPrimary}
            productName={product.name}
            onSetPrimary={() => handleSetPrimary(img._id)}
            onRemoveBackground={() => handleRemoveBackground(img._id)}
            onDelete={() => handleDeleteImage(img._id)}
            isSettingPrimary={setPrimaryMutation.isPending}
            isRemovingBg={removeBgMutation.isPending}
          />
        ))}

        {/* Upload card */}
        <Dropzone
          onDrop={handleUpload}
          accept={IMAGE_MIME_TYPE}
          maxSize={10 * 1024 * 1024}
          multiple={false}
          disabled={isUploading}
          radius="lg"
          style={{
            borderStyle: 'dashed',
            borderWidth: 2,
            borderColor: 'var(--mantine-color-dark-5)',
            backgroundColor: 'var(--mantine-color-dark-7)',
            minHeight: 150,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Stack align="center" gap="xs">
            <Dropzone.Accept>
              <ThemeIcon size={40} radius="md" color="green" variant="light">
                <IconUpload size={20} />
              </ThemeIcon>
            </Dropzone.Accept>
            <Dropzone.Reject>
              <ThemeIcon size={40} radius="md" color="red" variant="light">
                <IconX size={20} />
              </ThemeIcon>
            </Dropzone.Reject>
            <Dropzone.Idle>
              {isUploading ? (
                <Loader size="sm" color="brand" />
              ) : (
                <ThemeIcon size={40} radius="md" color="brand" variant="light">
                  <IconPlus size={20} />
                </ThemeIcon>
              )}
            </Dropzone.Idle>
            <Text size="sm" c="dark.2" ta="center">
              {isUploading ? 'Uploading...' : 'Add Image'}
            </Text>
            <Text size="xs" c="dark.4" ta="center">
              Different angle
            </Text>
          </Stack>
        </Dropzone>
      </Box>

      {/* Delete Confirmation Modal */}
      <Modal
        opened={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Product?"
        centered
        size="sm"
      >
        <Text size="sm" c="dark.1" mb="lg">
          This is the last image. Deleting it will also delete the entire product.
          This action cannot be undone.
        </Text>
        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" color="gray" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button color="red" onClick={confirmDeleteWithProduct} loading={deleteMutation.isPending}>
            Delete Product
          </Button>
        </Group>
      </Modal>
    </Box>
  )
}

function ImageCard({
  image,
  isPrimary,
  productName,
  onSetPrimary,
  onRemoveBackground,
  onDelete,
  isSettingPrimary,
  isRemovingBg,
}: {
  image: ProductImageData
  isPrimary: boolean
  productName: string
  onSetPrimary: () => void
  onRemoveBackground: () => void
  onDelete: () => void
  isSettingPrimary: boolean
  isRemovingBg: boolean
}) {
  const isOriginal = image.type === 'original'
  const isProcessing = image.status === 'processing'
  const isFailed = image.status === 'failed'
  const isReady = image.status === 'ready'
  const [isDownloading, setIsDownloading] = useState(false)

  // Check if this original already has a bg-removed enhancement
  // (We can't tell from this component alone, so we disable if any bg removal is in progress)

  async function handleDownload() {
    if (!image.imageUrl) return

    setIsDownloading(true)
    try {
      await downloadFile(
        image.imageUrl,
        `${productName}-${isOriginal ? 'original' : 'background-removed'}`,
      )
    } catch (err) {
      notifications.show({
        title: 'Download failed',
        message: err instanceof Error ? err.message : 'Could not download image',
        color: 'red',
      })
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <Paper
      radius="lg"
      p="sm"
      withBorder
      style={{
        borderColor: isPrimary ? 'var(--mantine-color-brand-5)' : 'var(--mantine-color-dark-5)',
        backgroundColor: 'var(--mantine-color-dark-7)',
        position: 'relative',
      }}
    >
      {/* Primary Badge */}
      {isPrimary && (
        <Badge
          size="xs"
          color="brand"
          variant="filled"
          pos="absolute"
          top={8}
          left={8}
          style={{ zIndex: 1 }}
          leftSection={<IconStarFilled size={10} />}
        >
          Primary
        </Badge>
      )}

      {/* Type Badge */}
      <Badge
        size="xs"
        color={isOriginal ? 'gray' : 'violet'}
        variant="light"
        pos="absolute"
        top={8}
        right={8}
        style={{ zIndex: 1 }}
      >
        {isOriginal ? 'Original' : 'No BG'}
      </Badge>

      {/* Image */}
      <Box
        mt="lg"
        style={{
          borderRadius: 'var(--mantine-radius-md)',
          overflow: 'hidden',
          border: '1px solid var(--mantine-color-dark-5)',
          background: !isOriginal
            ? 'repeating-conic-gradient(var(--mantine-color-dark-6) 0% 25%, var(--mantine-color-dark-7) 0% 50%) 50% / 16px 16px'
            : undefined,
        }}
      >
        {isProcessing ? (
          <AspectRatio ratio={1}>
            <Box
              bg="dark.6"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Loader size="sm" color="brand" type="dots" mb="xs" />
              <Text size="xs" c="dark.2">Processing...</Text>
            </Box>
          </AspectRatio>
        ) : isFailed ? (
          <AspectRatio ratio={1}>
            <Box
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
              }}
            >
              <Text size="sm" fw={500} c="red.5">Failed</Text>
              {image.error && (
                <Text size="xs" c="red.4" mt={4} px="xs" ta="center" lineClamp={2}>{image.error}</Text>
              )}
            </Box>
          </AspectRatio>
        ) : (
          <Image src={image.imageUrl} alt={productName} fit="contain" mah={150} />
        )}
      </Box>

      {/* Actions */}
      {isReady && (
        <Group mt="sm" gap="xs" justify="center">
          {!isPrimary && (
            <Tooltip label="Set as primary" events={{ hover: true, focus: true, touch: true }}>
              <ActionIcon
                variant="light"
                color="brand"
                size="sm"
                onClick={onSetPrimary}
                loading={isSettingPrimary}
              >
                <IconStar size={14} />
              </ActionIcon>
            </Tooltip>
          )}
          {isOriginal && (
            <Tooltip label="Remove background" events={{ hover: true, focus: true, touch: true }}>
              <ActionIcon
                variant="light"
                color="violet"
                size="sm"
                onClick={onRemoveBackground}
                loading={isRemovingBg}
              >
                <IconEraser size={14} />
              </ActionIcon>
            </Tooltip>
          )}
          <Tooltip label="Download" events={{ hover: true, focus: true, touch: true }}>
            <ActionIcon
              variant="light"
              color="gray"
              size="sm"
              onClick={handleDownload}
              loading={isDownloading}
            >
              <IconDownload size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Delete" events={{ hover: true, focus: true, touch: true }}>
            <ActionIcon
              variant="subtle"
              color="red"
              size="sm"
              onClick={onDelete}
            >
              <IconTrash size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      )}
    </Paper>
  )
}

function LightboxCopySection({
  adCopy,
}: {
  adCopy: { headlines: string[]; primaryTexts: string[]; ctas: string[] }
}) {
  const copyToClipboard = (value: string, label: string) => {
    navigator.clipboard
      .writeText(value)
      .then(() =>
        notifications.show({ title: 'Copied', message: label, color: 'green', autoClose: 1500 }),
      )
      .catch(() =>
        notifications.show({ title: 'Copy failed', message: 'Try selecting and copying manually.', color: 'red' }),
      )
  }

  return (
    <Stack gap="md">
      {adCopy.headlines.length > 0 && (
        <CopySection label="Headlines" items={adCopy.headlines} onCopy={copyToClipboard} />
      )}
      {adCopy.primaryTexts.length > 0 && (
        <CopySection label="Primary text" items={adCopy.primaryTexts} onCopy={copyToClipboard} />
      )}
      {adCopy.ctas.length > 0 && (
        <CopySection label="CTAs" items={adCopy.ctas} onCopy={copyToClipboard} inline />
      )}
    </Stack>
  )
}

function GalleryView({
  product,
  productId,
  primaryImageUrl,
  legacyImageUrl,
  completedGenerations,
  pendingGenerations,
  onGenerateMore,
  creditsExhausted,
}: {
  product: {
    status: string
    name: string
    primaryImageId?: Id<'productImages'>
  }
  productId: Id<'products'>
  primaryImageUrl?: string
  legacyImageUrl?: string
  completedGenerations: GenerationData[]
  pendingGenerations: GenerationData[]
  onGenerateMore: () => void
  creditsExhausted: boolean
}) {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [lightboxGen, setLightboxGen] = useState<GenerationData | null>(null)
  const [variationTarget, setVariationTarget] = useState<{ _id: Id<'templateGenerations'>; outputUrl: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Id<'templateGenerations'> | null>(null)
  const [retryingId, setRetryingId] = useState<Id<'templateGenerations'> | null>(null)
  const hasAny = completedGenerations.length > 0 || pendingGenerations.length > 0

  // Keyboard shortcuts
  useHotkeys([
    ['Escape', () => {
      if (lightboxGen) setLightboxGen(null)
      else if (variationTarget) setVariationTarget(null)
      else if (deleteTarget) setDeleteTarget(null)
    }],
  ])

  const deleteGeneration = useConvexMutation(api.products.deleteGeneration)
  const deleteMutation = useMutation({ mutationFn: deleteGeneration })
  const retryGeneration = useConvexMutation(api.studio.retryGeneration)
  const retryMutation = useMutation({ mutationFn: retryGeneration })

  function handleDelete(id: Id<'templateGenerations'>) {
    setDeleteTarget(id)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      await deleteMutation.mutateAsync({ generationId: deleteTarget })
      notifications.show({ title: 'Success', message: 'Deleted', color: 'green' })
    } catch {
      notifications.show({ title: 'Error', message: 'Failed to delete', color: 'red' })
    } finally {
      setDeleteTarget(null)
    }
  }

  async function handleRetry(id: Id<'templateGenerations'>) {
    setRetryingId(id)
    try {
      await retryMutation.mutateAsync({ generationId: id })
      notifications.show({ title: 'Retry started', message: 'Generation queued again.', color: 'green' })
    } catch (err) {
      const info = mapGenerationError(err)
      notifications.show({
        title: info.title,
        message: info.action ? (
          <>{info.message}{' '}<Anchor href={info.action.href} size="sm" fw={600}>{info.action.label} →</Anchor></>
        ) : info.message,
        color: 'red',
        autoClose: 8000,
      })
    } finally {
      setRetryingId(null)
    }
  }

  return (
    <Box>
      {/* Section header — source images live in the product card above; this
          section is now the ads gallery only. */}
      <Box mb="lg">
        <Title order={2} fz="xl" fw={600} c="white" mb={4}>Generations</Title>
        <Text size="sm" c="dark.2">Your AI-generated ad variations</Text>
      </Box>

      {/* Pending generations */}
      {pendingGenerations.length > 0 && (
        <Box mb="xl">
          <Text size="sm" fw={500} c="dark.2" mb="sm">In Progress</Text>
          <Box style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
            gap: '1rem',
            alignItems: 'start',
          }}>
            {pendingGenerations.map((gen, index) => (
              <GenerationCard
                key={gen._id}
                generation={gen}
                title={`${product.name} #${completedGenerations.length + index + 1}`}
                onExpand={setLightboxGen}
                onDelete={handleDelete}
                onCreateVariations={setVariationTarget}
                onRetry={handleRetry}
                retrying={retryingId === gen._id}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* Completed generations or empty state */}
      {!hasAny ? (
        <Paper
          radius="lg"
          p={64}
          ta="center"
          withBorder
          style={{
            borderStyle: 'dashed',
            borderWidth: 2,
            borderColor: 'var(--mantine-color-dark-5)',
            background: 'linear-gradient(135deg, rgba(84, 116, 180, 0.05) 0%, rgba(0, 0, 0, 0) 60%)',
          }}
        >
          {product.status === 'analyzing' ? (
            <>
              <IconSparkles size={48} style={{ color: 'var(--mantine-color-brand-5)', marginBottom: 16 }} />
              <Title order={3} fz="lg" fw={600} c="white" mb={8}>Analyzing your product…</Title>
              <Text c="dark.2" mb="xl" maw={400} mx="auto">
                This usually takes 10-15 seconds. We're figuring out the product details so we can pick the best ad templates.
              </Text>
              <Loader size="md" color="brand" mx="auto" />
            </>
          ) : (
            <>
              <IconSparkles size={48} style={{ color: 'var(--mantine-color-brand-5)', marginBottom: 16 }} />
              <Title order={3} fz="lg" fw={600} c="white" mb={8}>Ready when you are</Title>
              <Text c="dark.2" mb="xl" maw={400} mx="auto">
                Pick ad templates above, hit <strong>Generate Ads</strong>, and new variations will appear here in under a minute.
              </Text>
              <Button
                onClick={onGenerateMore}
                disabled={product.status !== 'ready' || creditsExhausted}
                color="brand"
                size="md"
                fz="sm"
                rightSection={<IconArrowRight size={16} />}
                styles={{
                  root: {
                    boxShadow: '0 4px 14px rgba(84, 116, 180, 0.25)',
                  },
                }}
              >
                Generate Ads
              </Button>
            </>
          )}
        </Paper>
      ) : completedGenerations.length > 0 ? (
        <Box style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
          gap: '1rem',
          alignItems: 'start',
        }}>
          {completedGenerations.map((gen, index) => (
            <GenerationCard
              key={gen._id}
              generation={gen}
              title={`${product.name} #${index + 1}`}
              onExpand={setLightboxGen}
              onDelete={handleDelete}
              onCreateVariations={setVariationTarget}
              onRetry={handleRetry}
              retrying={retryingId === gen._id}
            />
          ))}
        </Box>
      ) : null}

      {/* Lightbox Modal */}
      <Modal
        opened={!!lightboxGen}
        onClose={() => setLightboxGen(null)}
        fullScreen
        withCloseButton={false}
        padding={0}
        aria-label="Full size image viewer"
        data-testid="lightbox"
        styles={{
          body: {
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.95)',
          },
          content: {
            backgroundColor: 'transparent',
          },
        }}
      >
        <CloseButton
          pos="absolute"
          top={16}
          right={16}
          size="lg"
          variant="subtle"
          c="white"
          onClick={() => setLightboxGen(null)}
          aria-label="Close image viewer"
        />
        {lightboxGen?.outputUrl && (
          <Box style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--mantine-spacing-lg)', maxHeight: '90vh', overflowY: 'auto' }}>
            <Image
              src={lightboxGen.outputUrl}
              alt="Full size generated ad image"
              fit="contain"
              maw="80vw"
              mah="70vh"
            />
            {lightboxGen.adCopy && (
              <Box maw={560} w="100%" px="md">
                <LightboxCopySection adCopy={lightboxGen.adCopy} />
              </Box>
            )}
          </Box>
        )}
      </Modal>

      {/* Variation Drawer */}
      <VariationDrawer
        opened={!!variationTarget}
        onClose={() => setVariationTarget(null)}
        generation={variationTarget}
        productId={productId}
        productImageUrl={primaryImageUrl || ''}
        onComplete={() => setVariationTarget(null)}
        creditsExhausted={creditsExhausted}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        opened={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Generation"
        centered
        size="sm"
        data-testid="delete-modal"
      >
        <Text size="sm" c="dark.1" mb="lg">
          Are you sure you want to delete this generation? This action cannot be undone.
        </Text>
        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" color="gray" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button color="red" onClick={confirmDelete} loading={deleteMutation.isPending}>
            Delete
          </Button>
        </Group>
      </Modal>
    </Box>
  )
}

function VariationDrawer({
  opened,
  onClose,
  generation,
  productId,
  productImageUrl,
  onComplete,
  creditsExhausted = false,
}: {
  opened: boolean
  onClose: () => void
  generation: { _id: Id<'templateGenerations'>; outputUrl: string } | null
  productId: Id<'products'>
  productImageUrl: string
  onComplete: () => void
  creditsExhausted?: boolean
}) {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [changeText, setChangeText] = useState(false)
  const [changeIcons, setChangeIcons] = useState(false)
  const [changeColors, setChangeColors] = useState(false)
  const [variationCount, setVariationCount] = useState('2')
  const [model, setModel] = useState<'nano-banana-2' | 'gpt-image-2'>('nano-banana-2')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Reset state when drawer opens
  useEffect(() => {
    if (opened) {
      setChangeText(false)
      setChangeIcons(false)
      setChangeColors(false)
      setVariationCount('2')
      setModel('nano-banana-2')
    }
  }, [opened])

  const generateVariations = useConvexMutation(api.products.generateVariations)
  const generateMutation = useMutation({ mutationFn: generateVariations })

  const hasSelection = changeText || changeIcons || changeColors

  async function handleGenerate() {
    if (!generation) return
    if (!hasSelection) {
      notifications.show({ title: 'Error', message: 'Select at least one thing to change', color: 'red' })
      return
    }
    setIsSubmitting(true)
    try {
      await generateMutation.mutateAsync({
        generationId: generation._id,
        productId,
        sourceImageUrl: generation.outputUrl,
        productImageUrl,
        changeText,
        changeIcons,
        changeColors,
        variationCount: parseInt(variationCount, 10),
        model,
      })
      notifications.show({ title: 'Success', message: 'Variations started!', color: 'green' })
      onComplete()
    } catch (err) {
      const info = mapGenerationError(err)
      notifications.show({
        title: info.title,
        message: info.action ? (
          <>{info.message}{' '}<Anchor href={info.action.href} size="sm" fw={600}>{info.action.label} →</Anchor></>
        ) : info.message,
        color: 'red',
        autoClose: 8000,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size={isMobile ? '100%' : 'md'}
      title={<Title order={3} fz="lg" fw={600}>Create Variations</Title>}
      padding={isMobile ? 'md' : 'lg'}
      data-testid="variation-drawer"
    >
      {generation && (
        <Stack gap="lg">
          {/* Source image preview */}
          <Box>
            <Text size="sm" c="dark.2" mb="xs">Source image</Text>
            <Image
              src={generation.outputUrl}
              alt="Source"
              radius="md"
              style={{ border: '1px solid var(--mantine-color-dark-5)' }}
            />
          </Box>

          {/* What to change */}
          <Box>
            <Text size="sm" fw={500} c="white" mb="sm">What would you like to change?</Text>
            <Stack gap="sm">
              <Checkbox
                checked={changeText}
                onChange={(e) => setChangeText(e.currentTarget.checked)}
                label={
                  <Group gap="xs">
                    <IconAlignLeft size={16} color="var(--mantine-color-dark-2)" />
                    <Box>
                      <Text fw={500} size="sm">Text</Text>
                      <Text size="xs" c="dark.2">Generate new headlines, copy, and messaging</Text>
                    </Box>
                  </Group>
                }
                styles={{
                  root: {
                    padding: 'var(--mantine-spacing-sm)',
                    border: `2px solid ${changeText ? 'var(--mantine-color-brand-5)' : 'var(--mantine-color-dark-5)'}`,
                    borderRadius: 'var(--mantine-radius-md)',
                    backgroundColor: changeText ? 'var(--mantine-color-dark-6)' : 'transparent',
                  },
                  body: { alignItems: 'flex-start' },
                  labelWrapper: { width: '100%' },
                }}
              />
              <Checkbox
                checked={changeIcons}
                onChange={(e) => setChangeIcons(e.currentTarget.checked)}
                label={
                  <Group gap="xs">
                    <IconPhoto size={16} color="var(--mantine-color-dark-2)" />
                    <Box>
                      <Text fw={500} size="sm">Icons & Graphics</Text>
                      <Text size="xs" c="dark.2">Replace icons, badges, and decorative elements</Text>
                    </Box>
                  </Group>
                }
                styles={{
                  root: {
                    padding: 'var(--mantine-spacing-sm)',
                    border: `2px solid ${changeIcons ? 'var(--mantine-color-brand-5)' : 'var(--mantine-color-dark-5)'}`,
                    borderRadius: 'var(--mantine-radius-md)',
                    backgroundColor: changeIcons ? 'var(--mantine-color-dark-6)' : 'transparent',
                  },
                  body: { alignItems: 'flex-start' },
                  labelWrapper: { width: '100%' },
                }}
              />
              <Checkbox
                checked={changeColors}
                onChange={(e) => setChangeColors(e.currentTarget.checked)}
                label={
                  <Group gap="xs">
                    <IconPalette size={16} color="var(--mantine-color-dark-2)" />
                    <Box>
                      <Text fw={500} size="sm">Colors</Text>
                      <Text size="xs" c="dark.2">Adjust color scheme and tones</Text>
                    </Box>
                  </Group>
                }
                styles={{
                  root: {
                    padding: 'var(--mantine-spacing-sm)',
                    border: `2px solid ${changeColors ? 'var(--mantine-color-brand-5)' : 'var(--mantine-color-dark-5)'}`,
                    borderRadius: 'var(--mantine-radius-md)',
                    backgroundColor: changeColors ? 'var(--mantine-color-dark-6)' : 'transparent',
                  },
                  body: { alignItems: 'flex-start' },
                  labelWrapper: { width: '100%' },
                }}
              />
            </Stack>
          </Box>

          {/* Variation count */}
          <Box>
            <Text size="sm" fw={500} c="white" mb="sm">Number of variations</Text>
            <SegmentedControl
              value={variationCount}
              onChange={setVariationCount}
              data={['1', '2', '3']}
              fullWidth
              color="brand"
            />
          </Box>

          {/* Model picker */}
          <Box>
            <Text size="sm" fw={500} c="white" mb="sm">Model</Text>
            <ModelSelect value={model} onChange={setModel} />
          </Box>

          {/* Generate button */}
          <Button
            fullWidth
            size="md"
            fz="sm"
            color="brand"
            onClick={handleGenerate}
            disabled={!hasSelection || creditsExhausted}
            loading={isSubmitting}
            leftSection={!isSubmitting && <IconSparkles size={18} />}
          >
            {isSubmitting ? 'Starting...' : `Generate ${variationCount} Variation${parseInt(variationCount, 10) > 1 ? 's' : ''}`}
          </Button>
        </Stack>
      )}
    </Drawer>
  )
}

function GenerationCard({
  generation,
  title,
  onExpand,
  onDelete,
  onCreateVariations,
  onRetry,
  retrying,
}: {
  generation: GenerationData
  title: string
  onExpand: (generation: GenerationData) => void
  onDelete: (id: Id<'templateGenerations'>) => void
  onCreateVariations: (generation: { _id: Id<'templateGenerations'>; outputUrl: string }) => void
  onRetry: (id: Id<'templateGenerations'>) => void
  retrying?: boolean
}) {
  const isComplete = generation.status === 'complete' && generation.outputUrl
  const isFailed = generation.status === 'failed'
  const isPending = !isComplete && !isFailed
  const [now, setNow] = useState(() => Date.now())
  const [isDownloading, setIsDownloading] = useState(false)

  useEffect(() => {
    if (!isPending) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [isPending])

  const pendingStartedAt = generation.startedAt ?? generation._creationTime ?? now
  const isTimedOut = isPending && now - pendingStartedAt >= GENERATION_TIMEOUT_MS
  const failureInfo = generation.error ? mapGenerationError(generation.error) : null

  const getAspectRatioValue = (): number => {
    switch (generation.aspectRatio) {
      case '4:5':
        return 4 / 5
      case '9:16':
        return 9 / 16
      default:
        return 1
    }
  }

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays}d ago`

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const getModeLabel = (mode: string): string => {
    switch (mode) {
      case 'exact': return 'Exact'
      case 'remix': return 'Remix'
      case 'variation': return 'Variation'
      case 'angle': return 'From Angle'
      default: return mode
    }
  }

  const getModeColor = (mode: string): string => {
    switch (mode) {
      case 'variation': return 'violet'
      case 'remix': return 'orange'
      case 'angle': return 'lime'
      default: return 'teal'
    }
  }

  async function handleDownload(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    if (!generation.outputUrl) return

    // TODO: bundle image + copy.txt into a zip when JSZip is added as a dependency
    setIsDownloading(true)
    try {
      await downloadFile(generation.outputUrl, `${title}-${generation.mode || 'generation'}`)
    } catch (err) {
      notifications.show({
        title: 'Download failed',
        message: err instanceof Error ? err.message : 'Could not download generation',
        color: 'red',
      })
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <Card
      radius="md"
      withBorder
      padding={0}
      style={{
        breakInside: 'avoid',
        overflow: 'hidden',
        borderColor: 'var(--mantine-color-dark-5)',
        backgroundColor: 'var(--mantine-color-dark-7)',
        transition: 'transform 150ms ease, box-shadow 150ms ease',
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
      {/* Image Section - Clickable for lightbox */}
      <Card.Section>
        {isComplete && generation.outputUrl && (
          <Box
            style={{ cursor: 'pointer' }}
            onClick={() => onExpand(generation)}
          >
            <Image
              src={generation.outputUrl}
              alt="Generated ad"
              style={{ display: 'block' }}
            />
          </Box>
        )}

        {isPending && !isTimedOut && (
          <AspectRatio ratio={getAspectRatioValue()}>
            <Box
              bg="dark.6"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '100%',
              }}
            >
              <Loader size="sm" color="brand" type="dots" mb="xs" />
              <Text size="xs" c="dark.2">{generation.currentStep || 'Processing...'}</Text>
            </Box>
          </AspectRatio>
        )}

        {isTimedOut && (
          <AspectRatio ratio={getAspectRatioValue()}>
            <Box
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '100%',
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
              }}
            >
              <IconAlertTriangle size={24} style={{ color: 'var(--mantine-color-yellow-5)' }} />
              <Text size="sm" fw={500} c="yellow.5" mt={6}>Taking too long</Text>
              <Text size="xs" c="dark.2" mt={4} px="xs" ta="center">
                This generation may be stuck.
              </Text>
              <Button
                size="xs"
                variant="light"
                color="yellow"
                mt="sm"
                leftSection={<IconRefresh size={13} />}
                loading={retrying}
                onClick={() => onRetry(generation._id)}
              >
                Retry
              </Button>
            </Box>
          </AspectRatio>
        )}

        {isFailed && (
          <AspectRatio ratio={getAspectRatioValue()}>
            <Box
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '100%',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
              }}
            >
              <IconAlertTriangle size={24} style={{ color: 'var(--mantine-color-red-5)' }} />
              <Text size="sm" fw={500} c="red.5" mt={6}>{failureInfo?.title ?? 'Failed'}</Text>
              <Text size="xs" c="red.4" mt={4} px="xs" ta="center" lineClamp={2}>
                {failureInfo?.message ?? 'Generation failed.'}
              </Text>
              <Button
                size="xs"
                variant="light"
                color="red"
                mt="sm"
                leftSection={<IconRefresh size={13} />}
                loading={retrying}
                onClick={() => onRetry(generation._id)}
              >
                Retry
              </Button>
            </Box>
          </AspectRatio>
        )}
      </Card.Section>

      {/* Title Row */}
      <Group justify="space-between" mt="md" mx="md" align="center">
        <Text fw={500} fz="xs" c="white" lineClamp={1}>
          {title}
        </Text>
        <Group gap={6}>
          <Badge size="xs" variant="light" color="brand" radius="sm">
            {generation.aspectRatio || '1:1'}
          </Badge>
          <Badge
            size="xs"
            variant="dot"
            color={generation.mode === 'variation' ? 'violet' : generation.mode === 'remix' ? 'orange' : 'teal'}
          >
            {getModeLabel(generation.mode || 'exact')}
          </Badge>
        </Group>
      </Group>

      {/* Date */}
      <Text fz="xs" c="dimmed" mt={4} mx="md">
        {formatDate(generation._creationTime || Date.now())}
      </Text>

      {/* Action Buttons Row */}
      {isComplete && generation.outputUrl && (
        <Group justify="flex-end" mt="md" mb="md" mx="md" gap="xs">
          <Button
            variant="light"
            color="violet"
            size="xs"
            radius="md"
            leftSection={<IconSparkles size={14} />}
            onClick={(e) => {
              e.stopPropagation()
              onCreateVariations({ _id: generation._id, outputUrl: generation.outputUrl! })
            }}
          >
            Vary
          </Button>
          <Button
            variant="light"
            color="gray"
            size="xs"
            radius="md"
            leftSection={<IconDownload size={14} />}
            onClick={handleDownload}
            loading={isDownloading}
          >
            Save
          </Button>
          <ActionIcon
            variant="subtle"
            color="red"
            size="sm"
            radius="md"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(generation._id)
            }}
            title="Delete"
            aria-label="Delete generation"
          >
            <IconTrash size={13} />
          </ActionIcon>
        </Group>
      )}

      {/* Ad copy preview — first variant of each field */}
      {isComplete && (
        generation.adCopy ? (
          <Box mt="xs" px="xs" pb="xs" style={{ borderTop: '1px solid var(--mantine-color-dark-5)' }}>
            {generation.adCopy.headlines[0] && (
              <Text size="sm" fw={600} c="white" lineClamp={2}>
                {generation.adCopy.headlines[0]}
              </Text>
            )}
            {generation.adCopy.primaryTexts[0] && (
              <Text size="xs" c="dark.1" mt={4} lineClamp={2}>
                {generation.adCopy.primaryTexts[0]}
              </Text>
            )}
            {generation.adCopy.ctas[0] && (
              <Badge size="xs" variant="light" color="brand" mt={6}>
                {generation.adCopy.ctas[0]}
              </Badge>
            )}
          </Box>
        ) : (
          <Text size="xs" c="dark.3" mt="xs" pl="xs" pb="xs">Drafting copy…</Text>
        )
      )}

    </Card>
  )
}

function GenerateWizard({
  productId,
  product,
  primaryImageUrl,
  onBack,
  onComplete,
  creditsExhausted,
  initialFilters,
}: {
  productId: Id<'products'>
  product: { name: string }
  primaryImageUrl?: string
  onBack: () => void
  onComplete: () => void
  creditsExhausted: boolean
  initialFilters?: TemplateFilters
}) {
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1')
  const [mode, setMode] = useState<Mode>('exact')
  const [colorAdapt, setColorAdapt] = useState(false)
  const [variationsPerTemplate, setVariationsPerTemplate] = useState('2')
  const [wizardModel, setWizardModel] = useState<'nano-banana-2' | 'gpt-image-2'>('nano-banana-2')
  const [pickedIds, setPickedIds] = useState<Id<'adTemplates'>[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Template browse filters — seeded from initialFilters on first render
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<string | null>(initialFilters?.productCategory ?? null)
  const [filterImageStyle, setFilterImageStyle] = useState<string | null>(initialFilters?.imageStyle ?? null)
  const [filterSetting, setFilterSetting] = useState<string | null>(initialFilters?.setting ?? null)
  const [filterAngleType, setFilterAngleType] = useState<string | null>(initialFilters?.angleType ?? null)
  const [filterAspectRatio, setFilterAspectRatio] = useState<string | null>(null)
  const { data: filterOptions } = useQuery(
    convexQuery(api.products.listTemplateFilterOptions, {}),
  )

  // Mobile detection for responsive layout
  const isMobile = useMediaQuery('(max-width: 768px)')

  const convex = useConvex()
  const generateFromProduct = useConvexMutation(api.products.generateFromProduct)
  const generateMutation = useMutation({ mutationFn: generateFromProduct })

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

  const {
    data: templatesData,
    isLoading: templatesLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: [
      'listTemplates',
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

  function toggleTemplate(id: Id<'adTemplates'>) {
    setPickedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 3) {
        notifications.show({ title: 'Limit', message: 'Max 3 templates', color: 'yellow' })
        return prev
      }
      return [...prev, id]
    })
  }

  async function handleGenerate() {
    if (pickedIds.length === 0) {
      notifications.show({ title: 'Error', message: 'Pick at least one template', color: 'red' })
      return
    }
    setIsSubmitting(true)
    try {
      await generateMutation.mutateAsync({
        productId,
        templateIds: pickedIds,
        mode,
        colorAdapt,
        variationsPerTemplate: parseInt(variationsPerTemplate, 10),
        aspectRatio,
        model: wizardModel,
      })
      notifications.show({ title: 'Success', message: 'Generation started!', color: 'green' })
      onComplete()
    } catch (err) {
      const info = mapGenerationError(err)
      notifications.show({
        title: info.title,
        message: info.action ? (
          <>{info.message}{' '}<Anchor href={info.action.href} size="sm" fw={600}>{info.action.label} →</Anchor></>
        ) : info.message,
        color: 'red',
        autoClose: 8000,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const totalCount = pickedIds.length * parseInt(variationsPerTemplate, 10)

  return (
    <Box>
      {/* Compact Wizard Header */}
      <Group
        justify="space-between"
        mb="md"
        py="sm"
        px="md"
        style={{
          borderBottom: '1px solid var(--mantine-color-dark-6)',
        }}
      >
        <Group gap="md">
          <Anchor
            component="button"
            type="button"
            c="dark.2"
            onClick={onBack}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onBack()
              }
            }}
            style={{ cursor: 'pointer' }}
          >
            <Group gap={4}>
              <IconChevronLeft size={16} />
              Back
            </Group>
          </Anchor>
          <Text fw={600} size="lg" c="white">Pick Templates</Text>
          <Text size="sm" c="dark.2">·</Text>
          <Text size="sm" c="dark.2">{templates.length} available</Text>
        </Group>
        <Group gap="sm">
          <Badge size="md" variant="light" color="brand" radius="md">
            {pickedIds.length}/3 selected
          </Badge>
        </Group>
      </Group>

      <Group gap="sm" wrap="wrap" mb="md" align="flex-end">
        <TextInput
          placeholder="Search templates"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          leftSection={<IconPhoto size={14} />}
          size="sm"
          style={{ flex: 1, minWidth: 200 }}
        />
        <Select
          placeholder="Category"
          clearable
          data={filterOptions?.productCategories ?? []}
          value={filterCategory}
          onChange={setFilterCategory}
          size="sm"
          w={150}
        />
        <Select
          placeholder="Style"
          clearable
          data={filterOptions?.imageStyles ?? []}
          value={filterImageStyle}
          onChange={setFilterImageStyle}
          size="sm"
          w={150}
        />
        <Select
          placeholder="Setting"
          clearable
          data={filterOptions?.settings ?? []}
          value={filterSetting}
          onChange={setFilterSetting}
          size="sm"
          w={150}
        />
        <Select
          placeholder="Angle type"
          clearable
          data={
            filterOptions?.angleTypes
              ? filterOptions.angleTypes.map((t: string) => ({ value: t, label: angleTypeLabel(t) }))
              : []
          }
          value={filterAngleType}
          onChange={setFilterAngleType}
          size="sm"
          w={150}
        />
        <Select
          placeholder="Aspect"
          clearable
          data={[
            { value: '1:1', label: '1:1' },
            { value: '4:5', label: '4:5' },
            { value: '9:16', label: '9:16' },
          ]}
          value={filterAspectRatio}
          onChange={setFilterAspectRatio}
          size="sm"
          w={110}
        />
        {filtersActive && (
          <Button
            variant="subtle"
            size="sm"
            color="gray"
            onClick={() => {
              setSearch('')
              setFilterCategory(null)
              setFilterImageStyle(null)
              setFilterSetting(null)
              setFilterAngleType(null)
              setFilterAspectRatio(null)
            }}
          >
            Clear
          </Button>
        )}
      </Group>

      <Box style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 320px',
        gap: 'var(--mantine-spacing-lg)'
      }}>
        {/* Template Grid */}
        <Box
          mah={isMobile ? 'none' : 'calc(100vh - 180px)'}
          style={{
            overflowY: isMobile ? 'visible' : 'auto',
            paddingRight: isMobile ? 0 : 'var(--mantine-spacing-sm)',
            order: 1,
          }}
        >

          {templatesLoading && templates.length === 0 ? (
            <Box style={{
              columnCount: isMobile ? 2 : 4,
              columnGap: '0.5rem',
            }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <Box
                  key={i}
                  className="shimmer"
                  style={{
                    borderRadius: 'var(--mantine-radius-lg)',
                    aspectRatio: i % 3 === 0 ? '4/5' : i % 3 === 1 ? '9/16' : '1/1',
                    breakInside: 'avoid',
                    marginBottom: '0.5rem',
                  }}
                />
              ))}
            </Box>
          ) : templates.length === 0 ? (
            <Text c="dark.2" ta="center" py={48}>No templates available.</Text>
          ) : (
            <>
              <Box style={{
                columnCount: isMobile ? 2 : 4,
                columnGap: '0.5rem',
              }}>
                {templates.map((tpl) => {
                  const picked = pickedIds.includes(tpl._id)
                  const getAspectStyle = (): React.CSSProperties => {
                    switch (tpl.aspectRatio) {
                      case '4:5': return { aspectRatio: '4/5' }
                      case '9:16': return { aspectRatio: '9/16' }
                      default: return { aspectRatio: '1/1' }
                    }
                  }
                  return (
                    <UnstyledButton
                      key={tpl._id}
                      onClick={() => toggleTemplate(tpl._id)}
                      w="100%"
                      mb="xs"
                      className="template-card-selectable"
                      data-testid={`template-card-${tpl._id}`}
                      aria-pressed={picked}
                      aria-label={`Select template: ${[tpl.imageStyle, tpl.setting, tpl.productCategory].filter(Boolean).join(', ') || 'Ad template'}`}
                      style={{
                        borderRadius: 'var(--mantine-radius-lg)',
                        overflow: 'hidden',
                        border: `2px solid ${picked ? 'var(--mantine-color-brand-5)' : 'transparent'}`,
                        boxShadow: picked ? '0 0 0 3px rgba(84, 116, 180, 0.3)' : 'none',
                        position: 'relative',
                        breakInside: 'avoid',
                        display: 'block',
                        transition: 'all 200ms ease',
                        transform: picked ? 'scale(1.02)' : 'scale(1)',
                      }}
                    >
                      <Box style={getAspectStyle()}>
                        <Image src={tpl.thumbnailUrl} alt={`Template: ${[tpl.imageStyle, tpl.setting, tpl.productCategory].filter(Boolean).join(', ') || 'Ad template'}`} fit="cover" h="100%" w="100%" />
                      </Box>
                      <Badge
                        size="xs"
                        variant="filled"
                        color="brand"
                        pos="absolute"
                        bottom={6}
                        left={6}
                        style={{ opacity: 0.8 }}
                      >
                        {tpl.aspectRatio}
                      </Badge>
                      {picked && (
                        <Box
                          pos="absolute"
                          top={8}
                          right={8}
                          w={24}
                          h={24}
                          bg="brand"
                          style={{
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 2px 8px rgba(84, 116, 180, 0.4)',
                          }}
                        >
                          <IconCheck size={14} color="white" strokeWidth={3} />
                        </Box>
                      )}
                    </UnstyledButton>
                  )
                })}
              </Box>
              {hasNextPage && (
                <Box ref={loadMoreRef} py="md" ta="center">
                  {isFetchingNextPage ? (
                    <Loader size="sm" color="brand" />
                  ) : (
                    <Text size="sm" c="dark.2">Scroll for more</Text>
                  )}
                </Box>
              )}
            </>
          )}
        </Box>

        {/* Sidebar - Settings */}
        <Paper
          p="md"
          radius="lg"
          style={{
            border: '1px solid var(--mantine-color-dark-6)',
            background: 'rgba(26, 26, 26, 0.5)',
            alignSelf: 'flex-start',
            position: isMobile ? 'relative' : 'sticky',
            top: isMobile ? undefined : 80,
            order: 2,
          }}
        >
          {/* Product preview */}
          <Paper p="xs" mb="md" bg="dark.7" radius="md" style={{ border: '1px solid var(--mantine-color-dark-5)' }}>
            <Group gap="xs">
              <Image src={primaryImageUrl || ''} alt={product.name} w={40} h={40} radius="sm" fit="cover" style={{ border: '1px solid var(--mantine-color-dark-5)' }} />
              <Box>
                <Text size="sm" fw={600} c="white" lineClamp={1}>{capitalizeWords(product.name)}</Text>
                <Text size="xs" c="dark.2">Your product</Text>
              </Box>
            </Group>
          </Paper>

          {/* Output Aspect Ratio */}
          <Box mb="md">
            <Text size="sm" fw={600} c="white" mb="xs">Output size</Text>
            <SegmentedControl
              value={aspectRatio}
              onChange={(val) => setAspectRatio(val as AspectRatio)}
              data={['1:1', '4:5', '9:16']}
              fullWidth
              color="brand"
            />
          </Box>

          {/* Mode */}
          <Box mb="md">
            <Text size="sm" fw={500} c="white" mb="xs">Mode</Text>
            <Radio.Group value={mode} onChange={(val) => setMode(val as Mode)}>
              <Stack gap="xs">
                <Radio
                  value="exact"
                  label={
                    <Box>
                      <Text fw={500} size="sm">Exact</Text>
                      <Text size="xs" c="dark.2">Swap the product into the template scene</Text>
                    </Box>
                  }
                  styles={{
                    root: {
                      padding: 'var(--mantine-spacing-sm)',
                      border: '1px solid var(--mantine-color-dark-5)',
                      borderRadius: 'var(--mantine-radius-md)',
                    },
                    body: { alignItems: 'flex-start' },
                    labelWrapper: { width: '100%' },
                  }}
                />
                <Radio
                  value="remix"
                  label={
                    <Box>
                      <Text fw={500} size="sm">Remix</Text>
                      <Text size="xs" c="dark.2">Generate a new scene inspired by the template</Text>
                    </Box>
                  }
                  styles={{
                    root: {
                      padding: 'var(--mantine-spacing-sm)',
                      border: '1px solid var(--mantine-color-dark-5)',
                      borderRadius: 'var(--mantine-radius-md)',
                    },
                    body: { alignItems: 'flex-start' },
                    labelWrapper: { width: '100%' },
                  }}
                />
              </Stack>
            </Radio.Group>
            {mode === 'exact' && (
              <Checkbox
                mt="sm"
                label="Adapt colors to product"
                checked={colorAdapt}
                onChange={(e) => setColorAdapt(e.currentTarget.checked)}
              />
            )}
          </Box>

          {/* Variations */}
          <Box mb="md">
            <Text size="sm" fw={500} c="white" mb="xs">
              Variations per template
            </Text>
            <SegmentedControl
              value={variationsPerTemplate}
              onChange={setVariationsPerTemplate}
              data={['1', '2', '3', '4']}
              fullWidth
              color="brand"
            />
          </Box>

          {/* Model */}
          <Box mb="md">
            <Text size="sm" fw={500} c="white" mb="xs">Model</Text>
            <ModelSelect value={wizardModel} onChange={setWizardModel} />
          </Box>

          {/* Summary & Submit */}
          <Box pt="lg" mt="lg" style={{ borderTop: '1px solid var(--mantine-color-dark-5)' }}>
            {pickedIds.length === 0 ? (
              <Text size="sm" c="dark.2" ta="center" mb="md">
                Select templates to continue
              </Text>
            ) : (
              <Paper p="sm" mb="md" radius="md" bg="dark.7">
                <Group justify="space-between">
                  <Text size="sm" c="dark.2">Total images</Text>
                  <Text size="lg" fw={700} c="white">{totalCount}</Text>
                </Group>
                <Text size="xs" c="dark.2" mt={4}>
                  {pickedIds.length} template{pickedIds.length > 1 ? 's' : ''} × {variationsPerTemplate} variation{parseInt(variationsPerTemplate, 10) > 1 ? 's' : ''}
                </Text>
              </Paper>
            )}
            <Button
              fullWidth
              color="brand"
              size="lg"
              fz="sm"
              onClick={handleGenerate}
              disabled={pickedIds.length === 0 || creditsExhausted}
              loading={isSubmitting}
              styles={{
                root: {
                  boxShadow: pickedIds.length > 0 && !creditsExhausted ? '0 4px 14px rgba(84, 116, 180, 0.3)' : 'none',
                },
              }}
            >
              {isSubmitting ? 'Starting...' : `Generate ${totalCount > 0 ? totalCount : ''} Image${totalCount !== 1 ? 's' : ''}`}
            </Button>
          </Box>
        </Paper>
      </Box>
    </Box>
  )
}

function StatusBadge({ status }: { status: 'analyzing' | 'ready' | 'failed' }) {
  const config = {
    analyzing: { color: 'yellow', icon: IconLoader2, label: 'Analyzing' },
    ready: { color: 'teal', icon: IconCheck, label: 'Ready' },
    failed: { color: 'red', icon: IconAlertTriangle, label: 'Failed' },
  }
  const { color, icon: Icon, label } = config[status]
  return (
    <Badge
      size="sm"
      variant="light"
      color={color}
      leftSection={<Icon size={12} style={status === 'analyzing' ? { animation: 'spin 1s linear infinite' } : undefined} />}
    >
      {label}
    </Badge>
  )
}
