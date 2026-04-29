import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
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
  SegmentedControl,
  AspectRatio,
  Tooltip,
  ThemeIcon,
  Skeleton,
  Alert,
  Select,
  Textarea,
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
  IconTarget,
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
import { AdDetailPanel } from '../components/ads/AdDetailPanel'
import type { TemplateFilters } from '../components/product/types'
import { angleTypeLabel } from '../components/product/MarketingAnalysisPanel'

type ProductSearch = { compose?: string; ad?: string; template?: string }

export const Route = createFileRoute('/studio/$productId')({
  validateSearch: (search: Record<string, unknown>): ProductSearch => {
    const out: ProductSearch = {}
    if (typeof search.compose === 'string' && search.compose.length > 0) {
      out.compose = search.compose
    }
    if (typeof search.ad === 'string' && search.ad.length > 0) {
      out.ad = search.ad
    }
    if (typeof search.template === 'string' && search.template.length > 0) {
      out.template = search.template
    }
    return out
  },
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
  mode?: 'exact' | 'remix' | 'variation' | 'angle' | 'prompt'
  templateSnapshot?: { name?: string; aspectRatio?: string }
  isWinner?: boolean
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


function ProductWorkspacePage() {
  const { productId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  // Nested routes (e.g. /studio/$productId/strategy) take over the page —
  // render only the child Outlet and skip the workspace content.
  const isChildActive = pathname !== `/studio/${productId}`
  const [view, setView] = useState<View>(search.compose || search.template ? 'generate' : 'gallery')
  const [initialFilters, setInitialFilters] = useState<TemplateFilters>({})

  // When the URL gets ?compose=:adId (e.g. from "Edit in compose"), open the
  // generate wizard with that ad as the prefill source.
  useEffect(() => {
    if (search.compose && view !== 'generate') {
      setView('generate')
    }
  }, [search.compose, view])

  // When the URL gets ?template=:templateId (from "Use this template"),
  // open the generate wizard with that template pre-selected.
  useEffect(() => {
    if (search.template && view !== 'generate') {
      setView('generate')
    }
  }, [search.template, view])

  const closeCompose = () => {
    setView('gallery')
    if (search.compose || search.template) {
      navigate({
        to: '/studio/$productId',
        params: { productId },
        search: {},
        replace: true,
      })
    }
  }

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
          activeAdId={
            (search.ad ?? null) as Id<'templateGenerations'> | null
          }
          onOpenAd={(id) =>
            navigate({
              to: '/studio/$productId',
              params: { productId },
              search: { ...search, ad: id as string },
            })
          }
          onCloseAd={() => {
            const { ad: _omit, ...rest } = search
            navigate({
              to: '/studio/$productId',
              params: { productId },
              search: rest,
              replace: true,
            })
          }}
        />
      )}

      {view === 'generate' && (
        <GenerateWizard
          productId={productId as Id<'products'>}
          product={product}
          primaryImageUrl={primaryImageUrl}
          onBack={closeCompose}
          onComplete={closeCompose}
          creditsExhausted={creditsExhausted}
          initialFilters={initialFilters}
          prefillFromAdId={
            (search.compose && search.compose !== 'true' ? search.compose : null) as Id<'templateGenerations'> | null
          }
          prefillTemplateId={
            (search.template ?? null) as Id<'adTemplates'> | null
          }
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

  // Long-lived toast watcher for bg-removal (and future enhancements):
  // detect when an enhancement transitions out of 'processing' so the user
  // gets explicit feedback even if they're not looking at the strip.
  const lastSeenStatusRef = useRef<Map<string, 'processing' | 'ready' | 'failed'>>(new Map())
  useEffect(() => {
    const seen = lastSeenStatusRef.current
    for (const img of productImages ?? []) {
      if (img.type === 'original') continue
      const prev = seen.get(img._id as string)
      if (prev === 'processing' && img.status === 'ready') {
        notifications.show({
          title: 'Background removed',
          message: 'New transparent version is ready in your source images.',
          color: 'green',
          autoClose: 6000,
        })
      }
      if (prev === 'processing' && img.status === 'failed') {
        notifications.show({
          title: 'Background removal failed',
          message: img.error ?? 'Try again or use a different image.',
          color: 'red',
          autoClose: 8000,
        })
      }
      seen.set(img._id as string, img.status)
    }
  }, [productImages])

  const uploadAction = useAction(api.r2.uploadProductImage)
  const addImage = useConvexMutation(api.productImages.addProductImage)
  const addImageMutation = useMutation({ mutationFn: addImage })

  // Include both originals and their bg-removed (or future) enhancements in
  // the strip so the user sees processing/ready state for everything they
  // generated. Originals first, then enhancements grouped under the parent.
  const allImages = (productImages ?? [])
  const originals = allImages.filter((img) => img.type === 'original')
  const sourceImages = (() => {
    const out: typeof allImages = []
    for (const orig of originals) {
      out.push(orig)
      const enhancements = allImages.filter((e) => e.parentImageId === orig._id)
      out.push(...enhancements)
    }
    return out
  })()
  const originalCount = originals.length

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
                      type={img.type}
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
  type,
  status,
  isPrimary,
  onClick,
}: {
  imageUrl: string
  type: 'original' | 'background-removed'
  status: 'processing' | 'ready' | 'failed'
  isPrimary: boolean
  onClick: () => void
}) {
  const isBgRemoved = type === 'background-removed'
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
        // Checkered backdrop for bg-removed images so transparency reads
        backgroundImage: isBgRemoved
          ? 'repeating-conic-gradient(#222 0% 25%, #1a1a1a 25% 50%) 0 0 / 12px 12px'
          : undefined,
        border: isPrimary
          ? '2px solid var(--mantine-color-brand-5)'
          : '1px solid var(--mantine-color-dark-5)',
        flexShrink: 0,
        transition: 'transform 120ms ease',
      }}
    >
      {status === 'processing' ? (
        <Stack align="center" justify="center" h="100%" gap={2}>
          <Loader size="xs" color="brand" />
        </Stack>
      ) : status === 'failed' ? (
        <Center h="100%">
          <IconAlertTriangle size={18} color="var(--mantine-color-red-5)" />
        </Center>
      ) : (
        <Image src={imageUrl} alt="" fit="contain" w="100%" h="100%" />
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
      {isBgRemoved && status === 'ready' && (
        <Box
          pos="absolute"
          bottom={2}
          left={2}
          px={5}
          py={1}
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            borderRadius: 4,
            fontSize: 9,
            fontWeight: 600,
            color: 'white',
            letterSpacing: 0.4,
          }}
        >
          BG
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

function GalleryView({
  product,
  productId,
  primaryImageUrl,
  legacyImageUrl,
  completedGenerations,
  pendingGenerations,
  onGenerateMore,
  creditsExhausted,
  activeAdId,
  onOpenAd,
  onCloseAd,
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
  activeAdId: Id<'templateGenerations'> | null
  onOpenAd: (id: Id<'templateGenerations'>) => void
  onCloseAd: () => void
}) {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [variationTarget, setVariationTarget] = useState<{ _id: Id<'templateGenerations'>; outputUrl: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Id<'templateGenerations'> | null>(null)
  const [retryingId, setRetryingId] = useState<Id<'templateGenerations'> | null>(null)
  const [winnersOnly, setWinnersOnly] = useState(false)
  const winnerCount = completedGenerations.filter((g) => g.isWinner).length
  const visibleCompleted = winnersOnly
    ? completedGenerations.filter((g) => g.isWinner)
    : completedGenerations
  const hasAny = completedGenerations.length > 0 || pendingGenerations.length > 0

  // Build sibling list from completed generations for prev/next nav
  const siblingIds = completedGenerations.map((g) => g._id)

  // Keyboard shortcuts
  useHotkeys([
    ['Escape', () => {
      if (activeAdId) onCloseAd()
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
      <Group justify="space-between" align="flex-end" mb="lg" wrap="wrap" gap="md">
        <Box>
          <Title order={2} fz="xl" fw={600} c="white" mb={4}>Generations</Title>
          <Text size="sm" c="dark.2">Your AI-generated ad variations</Text>
        </Box>
        {winnerCount > 0 && (
          <Group gap="xs">
            <Button
              size="xs"
              variant={winnersOnly ? 'filled' : 'default'}
              color="yellow"
              radius="xl"
              leftSection={<IconStarFilled size={12} />}
              onClick={() => setWinnersOnly((v) => !v)}
            >
              Winners ({winnerCount})
            </Button>
            {winnersOnly && (
              <Button
                size="xs"
                variant="subtle"
                color="gray"
                onClick={() => setWinnersOnly(false)}
              >
                Show all
              </Button>
            )}
          </Group>
        )}
      </Group>

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
                onExpand={(gen) => onOpenAd(gen._id)}
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
      ) : visibleCompleted.length > 0 ? (
        <Box style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
          gap: '1rem',
          alignItems: 'start',
        }}>
          {visibleCompleted.map((gen, index) => (
            <GenerationCard
              key={gen._id}
              generation={gen}
              title={`${product.name} #${index + 1}`}
              onExpand={(g) => onOpenAd(g._id)}
              onDelete={handleDelete}
              onCreateVariations={setVariationTarget}
              onRetry={handleRetry}
              retrying={retryingId === gen._id}
            />
          ))}
        </Box>
      ) : winnersOnly ? (
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
            No winners marked yet. Star an ad you like and it'll show up here.
          </Text>
          <Button
            variant="subtle"
            color="gray"
            size="xs"
            onClick={() => setWinnersOnly(false)}
          >
            Show all ads
          </Button>
        </Paper>
      ) : null}

      {/* Ad Detail Panel (replaces old lightbox) */}
      <AdDetailPanel
        opened={!!activeAdId}
        onClose={onCloseAd}
        adId={activeAdId}
        siblings={siblingIds}
      />

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

      {/* Ad copy preview deferred — see ux-flow-redesign plan, "Ad copy
          surfacing" follow-up. Server-side copy generation still runs and
          the Ad Detail panel can still surface it; we just don't auto-show
          the first variant on the gallery card until we refine the UX. */}

    </Card>
  )
}

type WizardSegment = 'custom' | 'template'

// ── Chip taxonomy for the structured prompt builder ─────────────────────────
const PROMPT_SETTINGS = ['Studio', 'Kitchen', 'Bathroom', 'Outdoor / nature', 'Cafe', 'Beach', 'Urban street', 'Home interior', 'Gym']
const PROMPT_MOODS = ['Minimalist', 'Premium luxe', 'Playful', 'Vibrant', 'Moody cinematic', 'Warm inviting', 'Clean clinical', 'Earthy natural']
const PROMPT_LIGHTING = ['Soft natural', 'Golden-hour', 'Hard side-lit', 'Studio softbox', 'Neon', 'Backlit rim', 'Diffused overcast']
const PROMPT_COMPOSITIONS = ['Hero shot', 'Flat-lay (top-down)', 'Close-up macro', 'Lifestyle scene', 'Three-quarter angle', 'Side profile', 'Floating / suspended']
const PROMPT_PEOPLE = ['No people', 'Model holding product', 'Hands only', 'Person using product', 'Lifestyle background']

function GenerateWizard({
  productId,
  product,
  primaryImageUrl,
  onBack,
  onComplete,
  creditsExhausted,
  initialFilters,
  prefillFromAdId,
  prefillTemplateId,
}: {
  productId: Id<'products'>
  product: {
    name: string
    primaryImageId?: Id<'productImages'>
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
  primaryImageUrl?: string
  onBack: () => void
  onComplete: () => void
  creditsExhausted: boolean
  initialFilters?: TemplateFilters
  prefillFromAdId?: Id<'templateGenerations'> | null
  prefillTemplateId?: Id<'adTemplates'> | null
}) {
  // ── Segment state ──────────────────────────────────────────────────────────
  const [activeSegment, setActiveSegment] = useState<WizardSegment>(
    prefillTemplateId ? 'template' : 'custom',
  )

  // ── Shared state (persists across segment switches) ────────────────────────
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1')
  const [mode, setMode] = useState<Mode>('exact')
  const [colorAdapt, setColorAdapt] = useState(false)
  const [variationsPerTemplate, setVariationsPerTemplate] = useState('2')
  const [wizardModel, setWizardModel] = useState<'nano-banana-2' | 'gpt-image-2'>('nano-banana-2')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // ── Per-segment state (all preserved regardless of active segment) ─────────
  const [prompt, setPrompt] = useState('')
  const [pickedIds, setPickedIds] = useState<Id<'adTemplates'>[]>(
    prefillTemplateId ? [prefillTemplateId] : [],
  )
  const [selectedAngleIndex, setSelectedAngleIndex] = useState<number | null>(null)

  // ── Prompt builder + suggestion state ─────────────────────────────────────
  const [builderOpen, setBuilderOpen] = useState(false)
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [chipSetting, setChipSetting] = useState<string | null>(null)
  const [chipMood, setChipMood] = useState<string | null>(null)
  const [chipLighting, setChipLighting] = useState<string | null>(null)
  const [chipComposition, setChipComposition] = useState<string | null>(null)
  const [chipPeople, setChipPeople] = useState<string | null>(null)

  // ── Source image picker ────────────────────────────────────────────────────
  // Defaults to the product's primary image; user can pick any other ready
  // source image for THIS run without changing the product's primary.
  const [sourceImageId, setSourceImageId] = useState<Id<'productImages'> | null>(
    product.primaryImageId ?? null,
  )
  const { data: sourceImages } = useQuery(
    convexQuery(api.productImages.getProductImagesList, { productId }),
  )
  const readySourceImages = (sourceImages ?? []).filter(
    (img) => img.status === 'ready',
  )
  // Keep the picker in sync if the primary changes after the wizard mounts
  // (e.g. user set a new primary in another tab).
  useEffect(() => {
    if (sourceImageId === null && product.primaryImageId) {
      setSourceImageId(product.primaryImageId)
    }
  }, [product.primaryImageId, sourceImageId])
  const activeSourceImage =
    readySourceImages.find((img) => img._id === sourceImageId) ??
    readySourceImages.find((img) => img._id === product.primaryImageId) ??
    readySourceImages[0]

  // ── Prefill from ad ────────────────────────────────────────────────────────
  const [prefillApplied, setPrefillApplied] = useState(false)
  const { data: prefillAd } = useQuery({
    ...convexQuery(api.templateGenerations.getAdById, {
      adId: prefillFromAdId as Id<'templateGenerations'>,
    }),
    enabled: !!prefillFromAdId,
  })

  useEffect(() => {
    if (prefillApplied || !prefillAd) return
    if (prefillAd.aspectRatio) {
      setAspectRatio(prefillAd.aspectRatio as AspectRatio)
    }
    if (prefillAd.mode === 'exact' || prefillAd.mode === 'remix') {
      setMode(prefillAd.mode)
      setActiveSegment('template')
      if (prefillAd.templateId) {
        setPickedIds([prefillAd.templateId as Id<'adTemplates'>])
      }
    }
    if (prefillAd.mode === 'prompt') {
      // Re-populate the textarea with the original prompt
      if (prefillAd.dynamicPrompt) {
        setPrompt(prefillAd.dynamicPrompt)
      }
      setActiveSegment('custom')
    }
    if (prefillAd.mode === 'angle') {
      // Try to find the matching angle by title; landing in Custom either way
      // since the Angle tab no longer exists — angle is picked via the chips.
      const matchIdx = product.marketingAngles?.findIndex(
        (a) => a.title === prefillAd.angleSeed?.title,
      )
      if (matchIdx != null && matchIdx >= 0) {
        setSelectedAngleIndex(matchIdx)
      }
      setActiveSegment('custom')
    }
    if (typeof prefillAd.colorAdapt === 'boolean') {
      setColorAdapt(prefillAd.colorAdapt)
    }
    if (prefillAd.model) {
      setWizardModel(prefillAd.model)
    }
    setVariationsPerTemplate('1')
    setPrefillApplied(true)
  }, [prefillAd, prefillApplied, product.marketingAngles])

  // ── Template browse filters ────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<string | null>(initialFilters?.productCategory ?? null)
  const [filterImageStyle, setFilterImageStyle] = useState<string | null>(initialFilters?.imageStyle ?? null)
  const [filterSetting, setFilterSetting] = useState<string | null>(initialFilters?.setting ?? null)
  const [filterAngleType, setFilterAngleType] = useState<string | null>(initialFilters?.angleType ?? null)
  const [filterAspectRatio, setFilterAspectRatio] = useState<string | null>(null)
  const { data: filterOptions } = useQuery(
    convexQuery(api.products.listTemplateFilterOptions, {}),
  )

  const isMobile = useMediaQuery('(max-width: 768px)')
  const convex = useConvex()

  // ── Mutations ──────────────────────────────────────────────────────────────
  const generateFromProduct = useConvexMutation(api.products.generateFromProduct)
  const generateMutation = useMutation({ mutationFn: generateFromProduct })
  const submitAngleMutation = useConvexMutation(api.angleGenerations.submitAngleGeneration)
  const submitPromptMutation = useConvexMutation(api.promptGenerations.submitPromptGeneration)
  const suggestPromptsAction = useAction(api.promptSuggestions.suggestPromptIdeas)

  // ── Template infinite query ────────────────────────────────────────────────
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

  // ── Builder preview assembly ────────────────────────────────────────────────
  const builderPreview = [
    chipComposition,
    chipComposition ? 'of' : null,
    product.name,
    chipSetting ? `in ${chipSetting}` : null,
    chipLighting ? `${chipLighting} lighting` : null,
    chipMood ? `${chipMood} mood` : null,
    chipPeople ? `${chipPeople}` : null,
  ]
    .filter(Boolean)
    .join(', ')
    .replace(/,([^,]*)$/, '.$1') + '.'

  function applyBuilderToPrompt() {
    const assembled = builderPreview
    if (prompt.trim().length > 0) {
      if (!window.confirm('This will replace your current prompt. Continue?')) return
    }
    setPrompt(assembled)
    setBuilderOpen(false)
  }

  function resetBuilder() {
    setChipSetting(null)
    setChipMood(null)
    setChipLighting(null)
    setChipComposition(null)
    setChipPeople(null)
  }

  // ── Suggestions handler ───────────────────────────────────────────────────
  async function handleSuggestPrompts() {
    if (suggestionsLoading) return
    setSuggestionsLoading(true)
    setSuggestionsOpen(true)
    try {
      const result = await suggestPromptsAction({ productId })
      setSuggestions(result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      notifications.show({ title: 'Suggestion failed', message: msg, color: 'red' })
    } finally {
      setSuggestionsLoading(false)
    }
  }

  function useSuggestion(text: string) {
    if (prompt.trim().length > 0) {
      if (!window.confirm('This will replace your current prompt. Continue?')) return
    }
    setPrompt(text)
    setSelectedAngleIndex(null)
  }

  // ── Generate logic ─────────────────────────────────────────────────────────
  // The active segment dictates which generation path runs. Selections from
  // the other segment are kept in state (so switching back doesn't lose
  // them) but ignored at submit time.
  const hasAngle = selectedAngleIndex !== null
  const hasPrompt = activeSegment === 'custom' && prompt.trim().length >= 10
  const hasTemplates = pickedIds.length > 0
  const useTemplatePath = activeSegment === 'template' && hasTemplates
  const usePromptPath = activeSegment === 'custom' && hasPrompt
  const useAnglePath = activeSegment === 'custom' && !hasPrompt && hasAngle
  const canGenerate = useTemplatePath || usePromptPath || useAnglePath

  const variationsCount = parseInt(variationsPerTemplate, 10)
  const totalCount = useTemplatePath
    ? pickedIds.length * variationsCount
    : (usePromptPath || useAnglePath)
      ? variationsCount
      : 0

  async function handleGenerate() {
    if (!canGenerate) return
    setIsSubmitting(true)
    try {
      if (useTemplatePath) {
        await generateMutation.mutateAsync({
          productId,
          templateIds: pickedIds,
          mode,
          colorAdapt,
          variationsPerTemplate: variationsCount,
          aspectRatio,
          model: wizardModel,
          productImageId: sourceImageId ?? undefined,
        })
        notifications.show({ title: 'Success', message: 'Generation started!', color: 'green' })
      } else if (usePromptPath) {
        await submitPromptMutation({
          productId,
          prompt: prompt.trim(),
          aspectRatio,
          count: variationsCount,
          model: wizardModel,
          productImageId: sourceImageId ?? undefined,
        })
        notifications.show({
          title: 'Generating',
          message: `${variationsCount} image${variationsCount === 1 ? '' : 's'} from your prompt. Watch the gallery.`,
          color: 'green',
        })
      } else if (useAnglePath) {
        await submitAngleMutation({
          productId,
          angleIndex: selectedAngleIndex!,
          aspectRatio,
          count: variationsCount,
          model: wizardModel,
          productImageId: sourceImageId ?? undefined,
        })
        const angleTitle = product.marketingAngles?.[selectedAngleIndex!]?.title ?? 'angle'
        notifications.show({
          title: 'Generating',
          message: `${variationsCount} variant${variationsCount === 1 ? '' : 's'} for "${angleTitle}". Watch the gallery.`,
          color: 'green',
        })
      }
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

  // ── Helper: get generate button label ──────────────────────────────────────
  function getGenerateLabel(): string {
    if (isSubmitting) return 'Starting...'
    if (!canGenerate) return 'Generate'
    return `Generate ${totalCount} Image${totalCount !== 1 ? 's' : ''}`
  }

  // ── Marketing angles surfaced as chips inside the Custom segment ──────────
  const angles = product.marketingAngles ?? []

  return (
    <Box>
      {/* Wizard Header */}
      <Group
        justify="space-between"
        mb="md"
        py="sm"
        px="md"
        style={{ borderBottom: '1px solid var(--mantine-color-dark-6)' }}
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
          <Text fw={600} size="lg" c="white">Create ad</Text>
        </Group>
        <Group gap="sm">
          {hasTemplates && (
            <Badge size="md" variant="light" color="brand" radius="md">
              {pickedIds.length}/3 templates
            </Badge>
          )}
          {hasPrompt && (
            <Badge size="md" variant="light" color="grape" radius="md">
              Prompt ({prompt.trim().length} chars)
            </Badge>
          )}
          {hasAngle && !hasPrompt && (
            <Badge size="md" variant="light" color="teal" radius="md">
              {angles[selectedAngleIndex!]?.title ?? 'Angle'}
            </Badge>
          )}
        </Group>
      </Group>

      {/* Segmented control */}
      <Box px="md" mb="lg">
        <SegmentedControl
          value={activeSegment}
          onChange={(val) => setActiveSegment(val as WizardSegment)}
          data={[
            { value: 'custom', label: 'Custom' },
            { value: 'template', label: 'Template' },
          ]}
          color="brand"
          fullWidth={!!isMobile}
        />
      </Box>

      <Box style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 320px',
        gap: 'var(--mantine-spacing-lg)',
      }}>
        {/* ═══ Per-segment content area ═══ */}
        <Box
          mah={isMobile ? 'none' : 'calc(100vh - 220px)'}
          style={{
            overflowY: isMobile ? 'visible' : 'auto',
            paddingRight: isMobile ? 0 : 'var(--mantine-spacing-sm)',
            order: 1,
          }}
        >
          {/* ─── Custom segment ─── */}
          {activeSegment === 'custom' && (
            <Stack gap="md" px="md">
              {/* Textarea — shared destination for all prompt paths */}
              <Box>
                <Text size="sm" fw={600} c="white" mb="xs">Describe your ad</Text>
                <Textarea
                  placeholder="e.g. Product on a marble countertop with soft morning light, lifestyle feel..."
                  value={prompt}
                  onChange={(e) => {
                    setPrompt(e.currentTarget.value)
                    // Clear angle selection when user types freely
                    if (selectedAngleIndex !== null) setSelectedAngleIndex(null)
                  }}
                  minRows={4}
                  maxRows={8}
                  autosize
                />
                <Group justify="space-between" mt={6}>
                  <Group gap="xs">
                    <Button
                      size="xs"
                      variant="light"
                      color="grape"
                      radius="xl"
                      leftSection={<IconSparkles size={12} />}
                      loading={suggestionsLoading}
                      onClick={handleSuggestPrompts}
                    >
                      Suggest prompts
                    </Button>
                    <Button
                      size="xs"
                      variant="light"
                      color="gray"
                      radius="xl"
                      leftSection={<IconLayoutGrid size={12} />}
                      onClick={() => setBuilderOpen((v) => !v)}
                    >
                      {builderOpen ? 'Hide builder' : 'Build prompt'}
                    </Button>
                  </Group>
                  <Text size="xs" c="dark.3">{prompt.length} chars</Text>
                </Group>
              </Box>

              {/* ─── AI suggestions panel ─── */}
              {suggestionsOpen && (
                <Paper p="sm" radius="md" bg="dark.7" style={{ border: '1px solid var(--mantine-color-dark-5)' }}>
                  <Group justify="space-between" mb="xs">
                    <Text size="xs" fw={600} c="white">AI suggestions</Text>
                    <Group gap="xs">
                      <Button
                        size="xs"
                        variant="subtle"
                        color="grape"
                        leftSection={<IconRefresh size={12} />}
                        loading={suggestionsLoading}
                        onClick={handleSuggestPrompts}
                      >
                        Regenerate
                      </Button>
                      <ActionIcon size="xs" variant="subtle" color="dark.2" onClick={() => setSuggestionsOpen(false)}>
                        <IconX size={12} />
                      </ActionIcon>
                    </Group>
                  </Group>
                  {suggestionsLoading && suggestions.length === 0 ? (
                    <Stack gap="xs">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} h={48} radius="md" />
                      ))}
                    </Stack>
                  ) : (
                    <Stack gap="xs">
                      {suggestions.map((s, i) => (
                        <Paper
                          key={i}
                          p="xs"
                          radius="md"
                          bg="dark.6"
                          style={{ border: '1px solid var(--mantine-color-dark-4)', cursor: 'pointer' }}
                          onClick={() => useSuggestion(s)}
                        >
                          <Group justify="space-between" align="flex-start" gap="xs" wrap="nowrap">
                            <Text size="xs" c="dark.1" style={{ flex: 1, lineHeight: 1.4 }}>
                              {s}
                            </Text>
                            <Button size="xs" variant="light" color="brand" radius="xl" style={{ flexShrink: 0 }}>
                              Use this
                            </Button>
                          </Group>
                        </Paper>
                      ))}
                    </Stack>
                  )}
                </Paper>
              )}

              {/* ─── Structured chip builder ─── */}
              {builderOpen && (
                <Paper p="sm" radius="md" bg="dark.7" style={{ border: '1px solid var(--mantine-color-dark-5)' }}>
                  <Text size="xs" fw={600} c="white" mb="sm">Build a prompt</Text>
                  {([
                    ['Setting', PROMPT_SETTINGS, chipSetting, setChipSetting],
                    ['Mood', PROMPT_MOODS, chipMood, setChipMood],
                    ['Lighting', PROMPT_LIGHTING, chipLighting, setChipLighting],
                    ['Composition', PROMPT_COMPOSITIONS, chipComposition, setChipComposition],
                    ['People', PROMPT_PEOPLE, chipPeople, setChipPeople],
                  ] as [string, string[], string | null, (v: string | null) => void][]).map(([label, options, value, setter]) => (
                    <Box key={label} mb="xs">
                      <Text size="xs" c="dark.2" mb={4}>{label}</Text>
                      <Group gap={4} wrap="wrap">
                        {options.map((opt) => (
                          <Button
                            key={opt}
                            size="xs"
                            variant={value === opt ? 'filled' : 'light'}
                            color={value === opt ? 'brand' : 'dark.4'}
                            radius="xl"
                            onClick={() => setter(value === opt ? null : opt)}
                            styles={{ root: { height: 26, paddingInline: 10, fontSize: 11 } }}
                          >
                            {opt}
                          </Button>
                        ))}
                      </Group>
                    </Box>
                  ))}
                  <Box mt="sm" pt="sm" style={{ borderTop: '1px solid var(--mantine-color-dark-5)' }}>
                    <Text size="xs" c="dark.2" mb={6}>Preview:</Text>
                    <Text size="xs" c="dark.1" fs="italic" mb="sm">{builderPreview}</Text>
                    <Group gap="xs">
                      <Button
                        size="xs"
                        variant="filled"
                        color="brand"
                        radius="xl"
                        onClick={applyBuilderToPrompt}
                        disabled={!chipSetting && !chipMood && !chipLighting && !chipComposition && !chipPeople}
                      >
                        Apply to prompt
                      </Button>
                      <Button
                        size="xs"
                        variant="subtle"
                        color="gray"
                        radius="xl"
                        onClick={resetBuilder}
                      >
                        Reset
                      </Button>
                    </Group>
                  </Box>
                </Paper>
              )}

              {/* ─── Angle chips ─── */}
              {angles.length > 0 && (
                <Box>
                  <Text size="xs" c="dark.2" mb="xs">Or pick an angle:</Text>
                  <Group gap="xs" wrap="wrap">
                    {angles.slice(0, 5).map((angle, idx) => (
                      <Button
                        key={idx}
                        size="xs"
                        variant={selectedAngleIndex === idx ? 'filled' : 'light'}
                        color={selectedAngleIndex === idx ? 'brand' : 'gray'}
                        radius="xl"
                        leftSection={<IconTarget size={12} />}
                        onClick={() => {
                          if (selectedAngleIndex === idx) {
                            setSelectedAngleIndex(null)
                          } else {
                            setSelectedAngleIndex(idx)
                            // Only auto-fill the prompt if textarea is empty
                            if (prompt.trim().length === 0) {
                              setPrompt(angle.hook)
                            }
                          }
                        }}
                      >
                        {angle.title}
                      </Button>
                    ))}
                    <Button
                      size="xs"
                      variant="light"
                      color="grape"
                      radius="xl"
                      leftSection={<IconSparkles size={12} />}
                      onClick={() => {
                        if (angles.length === 0) return
                        const randomIdx = Math.floor(Math.random() * angles.length)
                        setSelectedAngleIndex(randomIdx)
                        if (prompt.trim().length === 0) {
                          setPrompt(angles[randomIdx].hook)
                        }
                      }}
                    >
                      Surprise me
                    </Button>
                  </Group>
                </Box>
              )}

              {/* ─── Template shortcut ─── */}
              <Box>
                <Text size="xs" c="dark.2" mb="xs">
                  Or use a template:
                </Text>
                <Button
                  size="xs"
                  variant="default"
                  radius="xl"
                  leftSection={<IconPhoto size={12} />}
                  onClick={() => setActiveSegment('template')}
                >
                  Browse templates{hasTemplates ? ` (${pickedIds.length} picked)` : ''}
                </Button>
              </Box>
              {!canGenerate && (
                <Alert color="gray" variant="light" radius="md">
                  <Text size="sm" c="dark.1">
                    Type a prompt (10+ chars) or pick an angle to generate.
                  </Text>
                </Alert>
              )}
            </Stack>
          )}

          {/* ─── Template segment ─── */}
          {activeSegment === 'template' && (
            <Box>
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
                    Clear filters
                  </Button>
                )}
                {pickedIds.length > 0 && (
                  <Button
                    variant="subtle"
                    size="sm"
                    color="red"
                    leftSection={<IconX size={14} />}
                    onClick={() => setPickedIds([])}
                  >
                    Clear selection ({pickedIds.length})
                  </Button>
                )}
              </Group>

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
          )}

        </Box>

        {/* ═══ Sidebar — shared settings + Generate CTA ═══ */}
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
          {/* Source image picker */}
          <Box mb="md">
            <Text size="xs" tt="uppercase" fw={700} c="dark.2" mb="xs">
              Source image
            </Text>
            <Paper p="sm" bg="dark.7" radius="md" style={{ border: '1px solid var(--mantine-color-dark-5)' }}>
              <Group gap="sm" align="center" mb={readySourceImages.length > 1 ? 'sm' : 0}>
                <Box
                  w={56}
                  h={56}
                  style={{
                    borderRadius: 6,
                    overflow: 'hidden',
                    flexShrink: 0,
                    border: '1px solid var(--mantine-color-brand-5)',
                  }}
                >
                  <Image
                    src={activeSourceImage?.imageUrl || primaryImageUrl || ''}
                    alt={product.name}
                    fit="cover"
                    w="100%"
                    h="100%"
                  />
                </Box>
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Text size="sm" fw={600} c="white" lineClamp={1}>
                    {capitalizeWords(product.name)}
                  </Text>
                  <Text size="xs" c="dark.2">
                    {activeSourceImage?.type === 'background-removed'
                      ? 'Background removed'
                      : activeSourceImage?._id === product.primaryImageId
                        ? 'Primary'
                        : 'Original'}
                  </Text>
                </Box>
              </Group>
              {readySourceImages.length > 1 && (
                <>
                  <Text size="xs" c="dark.2" mb={6}>
                    Pick a different image:
                  </Text>
                  <Group gap={6} wrap="wrap">
                    {readySourceImages.map((img) => {
                      const isActive =
                        (sourceImageId ?? product.primaryImageId) === img._id
                      return (
                        <UnstyledButton
                          key={img._id}
                          onClick={() => setSourceImageId(img._id)}
                          aria-label="Use this source image"
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 6,
                            overflow: 'hidden',
                            border: isActive
                              ? '2px solid var(--mantine-color-brand-5)'
                              : '1px solid var(--mantine-color-dark-5)',
                            cursor: 'pointer',
                            flexShrink: 0,
                          }}
                        >
                          <Image src={img.imageUrl} alt="" fit="cover" w="100%" h="100%" />
                        </UnstyledButton>
                      )
                    })}
                  </Group>
                </>
              )}
            </Paper>
          </Box>

          {/* Segment-aware selection summary */}
          <Box mb="md">
            <Text size="xs" tt="uppercase" fw={700} c="dark.2" mb="xs">
              {activeSegment === 'template' ? 'Templates' : 'Starting from'}
            </Text>
            {activeSegment === 'template' ? (
              pickedIds.length === 0 ? (
                <Paper
                  p="sm"
                  radius="md"
                  bg="dark.7"
                  style={{ border: '1px dashed var(--mantine-color-dark-4)' }}
                >
                  <Text size="xs" c="dark.2" ta="center">
                    No templates picked — choose from the gallery
                  </Text>
                </Paper>
              ) : (
                <Stack gap={6}>
                  <Group gap={6} wrap="wrap">
                    {pickedIds.map((id) => {
                      const tpl = templates.find((t) => t._id === id)
                      if (!tpl) return null
                      return (
                        <Box
                          key={id}
                          pos="relative"
                          w={48}
                          h={48}
                          style={{
                            borderRadius: 6,
                            overflow: 'hidden',
                            border: '1px solid var(--mantine-color-brand-5)',
                          }}
                        >
                          <Image src={tpl.thumbnailUrl ?? tpl.imageUrl} alt="" fit="cover" w="100%" h="100%" />
                          <UnstyledButton
                            onClick={() => setPickedIds((p) => p.filter((x) => x !== id))}
                            aria-label="Remove template"
                            style={{
                              position: 'absolute',
                              top: 2,
                              right: 2,
                              width: 16,
                              height: 16,
                              borderRadius: '50%',
                              backgroundColor: 'rgba(0,0,0,0.7)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'white',
                            }}
                          >
                            <IconX size={10} />
                          </UnstyledButton>
                        </Box>
                      )
                    })}
                  </Group>
                  <Text size="xs" c="dark.2">
                    {pickedIds.length}/3 selected
                  </Text>
                </Stack>
              )
            ) : prompt.trim().length >= 10 ? (
              <Paper p="sm" radius="md" bg="dark.7" style={{ border: '1px solid var(--mantine-color-brand-5)' }}>
                <Group justify="space-between" align="flex-start" gap="xs" wrap="nowrap">
                  <Box style={{ flex: 1, minWidth: 0 }}>
                    <Text size="xs" c="dark.2">Custom prompt</Text>
                    <Text size="xs" c="dark.1" lineClamp={2}>
                      {prompt.trim()}
                    </Text>
                  </Box>
                </Group>
              </Paper>
            ) : selectedAngleIndex !== null && product.marketingAngles?.[selectedAngleIndex] ? (
              <Paper p="sm" radius="md" bg="dark.7" style={{ border: '1px solid var(--mantine-color-brand-5)' }}>
                <Group justify="space-between" align="flex-start" gap="xs" wrap="nowrap">
                  <Box style={{ flex: 1, minWidth: 0 }}>
                    <Text size="xs" c="dark.2">Angle</Text>
                    <Text size="sm" fw={600} c="white" lineClamp={2}>
                      {product.marketingAngles[selectedAngleIndex].title}
                    </Text>
                  </Box>
                  <UnstyledButton
                    onClick={() => setSelectedAngleIndex(null)}
                    aria-label="Clear angle"
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      backgroundColor: 'var(--mantine-color-dark-5)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--mantine-color-dark-1)',
                      flexShrink: 0,
                    }}
                  >
                    <IconX size={11} />
                  </UnstyledButton>
                </Group>
              </Paper>
            ) : (
              <Paper
                p="sm"
                radius="md"
                bg="dark.7"
                style={{ border: '1px dashed var(--mantine-color-dark-4)' }}
              >
                <Text size="xs" c="dark.2" ta="center">
                  Type a prompt (10+ chars) or pick an angle
                </Text>
              </Paper>
            )}
          </Box>

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

          {/* Mode — only relevant for template path */}
          {activeSegment === 'template' && hasTemplates && (
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
          )}

          {/* Variations */}
          <Box mb="md">
            <Text size="sm" fw={500} c="white" mb="xs">
              Variations
              {activeSegment === 'template' && hasTemplates ? ' per template' : ''}
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
            {!canGenerate ? (
              <Text size="sm" c="dark.2" ta="center" mb="md">
                {activeSegment === 'template' ? 'Pick a template' : 'Type a prompt (10+ chars) or pick an angle'}
              </Text>
            ) : (
              <Paper p="sm" mb="md" radius="md" bg="dark.7">
                <Group justify="space-between">
                  <Text size="sm" c="dark.2">Total images</Text>
                  <Text size="lg" fw={700} c="white">{totalCount}</Text>
                </Group>
                <Text size="xs" c="dark.2" mt={4}>
                  {useTemplatePath
                    ? `${pickedIds.length} template${pickedIds.length > 1 ? 's' : ''} × ${variationsPerTemplate} variation${variationsCount > 1 ? 's' : ''}`
                    : usePromptPath
                      ? `${variationsPerTemplate} image${variationsCount > 1 ? 's' : ''} from prompt`
                      : `${variationsPerTemplate} variation${variationsCount > 1 ? 's' : ''} from angle`}
                </Text>
              </Paper>
            )}
            <Button
              fullWidth
              color="brand"
              size="lg"
              fz="sm"
              onClick={handleGenerate}
              disabled={!canGenerate || creditsExhausted}
              loading={isSubmitting}
              styles={{
                root: {
                  boxShadow: canGenerate && !creditsExhausted ? '0 4px 14px rgba(84, 116, 180, 0.3)' : 'none',
                },
              }}
            >
              {getGenerateLabel()}
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
