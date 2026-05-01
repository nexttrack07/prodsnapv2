import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { useQuery, useMutation, useInfiniteQuery } from '@tanstack/react-query'
import { useConvexMutation, convexQuery } from '@convex-dev/react-query'
import { useAction, useQuery as useConvexQuery } from 'convex/react'
import { useState, useRef, useCallback, useEffect } from 'react'
import { notifications } from '@mantine/notifications'
import { useMediaQuery, useHotkeys, useDisclosure } from '@mantine/hooks'
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
  Tabs,
  ScrollArea,
  Menu,
  Collapse,
} from '@mantine/core'
import { Dropzone, IMAGE_MIME_TYPE } from '@mantine/dropzone'
import { Masonry } from 'masonic'
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
  IconBookmark,
  IconBookmarkFilled,
  IconExternalLink,
  IconLink,
  IconChevronDown,
  IconBlockquote,
  IconPencil,
} from '@tabler/icons-react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { capitalizeWords } from '../utils/strings'
import {
  ImageEnhancerModal,
  type ImageEnhancerImage,
} from '../components/product/ImageEnhancerModal'
import { PageHeaderActions } from '../components/layout/PageHeaderActions'
import { CreditsIndicator } from '../components/billing/CreditsIndicator'
import { ModelSelect } from '../components/ModelSelect'
import { mapGenerationError } from '../lib/billing/mapBillingError'
import { fetchDownloadAsset } from '../utils/downloads'
import { AdDetailPanel } from '../components/ads/AdDetailPanel'
import type { TemplateFilters } from '../components/product/types'
import { angleTypeLabel } from '../components/product/MarketingAnalysisPanel'
import { BrandPicker } from '../components/brand/BrandPicker'

type ProductSearch = { compose?: string; ad?: string; template?: string; angle?: string; editAd?: string }

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
    if (typeof search.angle === 'string' && /^\d+$/.test(search.angle)) {
      out.angle = search.angle
    }
    if (typeof search.editAd === 'string' && search.editAd.length > 0) {
      out.editAd = search.editAd
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

// "Taking too long" UI threshold. The server work isn't cancelled at this
// point — Fal.ai keeps running and the card flips to complete when the
// response lands. Sized for the slowest case (gpt-image-2 at quality=high)
// so users don't see a misleading "stuck" state during normal processing.
const GENERATION_TIMEOUT_MS = 300_000

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
  const [view, setView] = useState<View>(search.compose || search.template || search.angle || search.editAd ? 'generate' : 'gallery')
  const [initialFilters, setInitialFilters] = useState<TemplateFilters>({})

  // When the URL gets ?compose=:adId / ?template=:id / ?angle=:i, open the
  // generate wizard. `view` is intentionally NOT in deps — including it
  // creates a race with closeCompose: setView('gallery') flips view, the
  // effect re-runs before navigation strips the search param, and the
  // wizard immediately re-opens. React only to URL changes here.
  useEffect(() => {
    if (search.compose) setView('generate')
  }, [search.compose])

  useEffect(() => {
    if (search.template) setView('generate')
  }, [search.template])

  useEffect(() => {
    if (search.angle) setView('generate')
  }, [search.angle])

  useEffect(() => {
    if (search.editAd) setView('generate')
  }, [search.editAd])

  const closeCompose = () => {
    setView('gallery')
    if (search.compose || search.template || search.angle || search.editAd) {
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
            <Group align="flex-start" gap="xl" wrap="wrap">
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
          brandKitId={product.brandKitId}
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
          prefillAngleIndex={
            search.angle != null ? Number(search.angle) : null
          }
          prefillEditAdId={
            (search.editAd ?? null) as Id<'templateGenerations'> | null
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
  brandKitId,
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
    customerLanguage?: string[]
  }
  productId: Id<'products'>
  primaryImageUrl?: string
  anglesCount: number
  brandKitId?: Id<'brandKits'>
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

  const archiveProduct = useConvexMutation(api.products.archiveProduct)
  const archiveMutation = useMutation({ mutationFn: archiveProduct })
  const [deleteConfirmOpen, { open: openDeleteConfirm, close: closeDeleteConfirm }] = useDisclosure(false)
  const navigate = useNavigate()

  async function handleArchive() {
    try {
      await archiveMutation.mutateAsync({ productId: product._id })
      notifications.show({
        title: 'Product deleted',
        message: `${product.name} was removed.`,
        color: 'green',
      })
      closeDeleteConfirm()
      navigate({ to: '/home' })
    } catch (err) {
      notifications.show({
        title: 'Could not delete',
        message: err instanceof Error ? err.message : 'Try again',
        color: 'red',
      })
    }
  }

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
      <PageHeaderActions>
        <Tooltip label="Delete product" position="left" withArrow>
          <ActionIcon
            variant="subtle"
            color="red"
            size="md"
            radius="md"
            onClick={openDeleteConfirm}
            aria-label="Delete product"
          >
            <IconTrash size={16} />
          </ActionIcon>
        </Tooltip>
      </PageHeaderActions>

      {/* Tabs sit ABOVE the product card. Each tab swaps the Paper's
          content; mih keeps the panel height stable so transitions don't
          jolt the page. Overview holds the product hero (image + title +
          badges + Strategy + description + brand). */}
      <Tabs defaultValue="overview" variant="default" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab
            value="overview"
            leftSection={<Box visibleFrom="sm"><IconLayoutGrid size={14} /></Box>}
          >
            Overview
          </Tabs.Tab>
          <Tabs.Tab
            value="images"
            leftSection={<Box visibleFrom="sm"><IconPhoto size={14} /></Box>}
            rightSection={
              originalCount > 0 ? (
                <Badge size="xs" variant="light" color="gray" radius="sm">
                  {originalCount}
                </Badge>
              ) : null
            }
          >
            Source images
          </Tabs.Tab>
          <Tabs.Tab
            value="inspiration"
            leftSection={<Box visibleFrom="sm"><IconBookmark size={14} /></Box>}
          >
            Inspiration
          </Tabs.Tab>
          <Tabs.Tab
            value="voice"
            leftSection={<Box visibleFrom="sm"><IconBlockquote size={14} /></Box>}
            rightSection={
              (product.customerLanguage?.length ?? 0) > 0 ? (
                <Badge size="xs" variant="light" color="gray" radius="sm">
                  {product.customerLanguage!.length}
                </Badge>
              ) : null
            }
          >
            Customer voice
          </Tabs.Tab>
        </Tabs.List>

        <Paper
          radius="lg"
          p={isMobile ? 'md' : 'xl'}
          mt="md"
          mih={isMobile ? 280 : 280}
          style={{
            background: 'linear-gradient(135deg, rgba(84, 116, 180, 0.08) 0%, rgba(0, 0, 0, 0) 60%)',
            border: '1px solid var(--mantine-color-dark-6)',
            borderTopLeftRadius: 0,
          }}
        >
          {/* ── Overview ─────────────────────────────────────────────── */}
          <Tabs.Panel value="overview">
            <Group
              align="flex-start"
              gap={isMobile ? 'md' : 'xl'}
              wrap={isMobile ? 'wrap' : 'nowrap'}
            >
              {/* Primary image */}
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

                {product.productDescription && (
                  <Text size="sm" c="dark.1" lh={1.6} maw={680}>
                    {product.productDescription}
                  </Text>
                )}

                <BrandPicker productId={productId} brandKitId={brandKitId} />

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
          </Tabs.Panel>

          {/* ── Source images ───────────────────────────────────────── */}
          <Tabs.Panel value="images">
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
          </Tabs.Panel>

          {/* ── Inspiration ──────────────────────────────────────────── */}
          <Tabs.Panel value="inspiration">
            <InspirationRow productId={productId} onNewAd={onNewAd} />
          </Tabs.Panel>

          {/* ── Customer voice ───────────────────────────────────────── */}
          <Tabs.Panel value="voice">
            <CustomerVoiceSection
              productId={productId}
              customerLanguage={product.customerLanguage ?? []}
            />
          </Tabs.Panel>
        </Paper>
      </Tabs>

      {/* "New ad" stays below the tabs so it's always reachable. */}
      <Group justify="flex-end" gap="sm" mt="md" mb="xl">
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

      <Modal
        opened={deleteConfirmOpen}
        onClose={closeDeleteConfirm}
        title="Delete product?"
        centered
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm" c="dark.1">
            <Text component="span" fw={600} c="white">
              {capitalizeWords(product.name)}
            </Text>{' '}
            and all its generated ads will be removed. This can't be undone.
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button
              variant="default"
              onClick={closeDeleteConfirm}
              disabled={archiveMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              color="red"
              leftSection={<IconTrash size={14} />}
              onClick={handleArchive}
              loading={archiveMutation.isPending}
            >
              Delete product
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}

// ─── Customer Voice Section ─────────────────────────────────────────────────
function CustomerVoiceSection({
  productId,
  customerLanguage,
}: {
  productId: Id<'products'>
  customerLanguage: string[]
}) {
  const [opened, { toggle }] = useDisclosure(customerLanguage.length > 0)
  const [phrases, setPhrases] = useState<string[]>(customerLanguage)
  const [isAdding, setIsAdding] = useState(false)
  const [isPasteMode, setIsPasteMode] = useState(false)
  const [newPhrase, setNewPhrase] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const pasteRef = useRef<HTMLTextAreaElement>(null)

  const updateProduct = useConvexMutation(api.products.updateProduct)
  const updateMutation = useMutation({ mutationFn: updateProduct })

  // Sync local state when server data changes
  useEffect(() => {
    setPhrases(customerLanguage)
  }, [customerLanguage])

  async function persist(next: string[]) {
    setPhrases(next)
    try {
      await updateMutation.mutateAsync({
        productId: productId as Id<'products'>,
        customerLanguage: next,
      })
    } catch {
      notifications.show({ title: 'Error', message: 'Failed to save phrases', color: 'red' })
    }
  }

  function handleAddPhrase() {
    const trimmed = newPhrase.trim()
    if (!trimmed) return
    const next = [...phrases, trimmed.slice(0, 500)]
    setNewPhrase('')
    persist(next)
  }

  function handlePasteCommit() {
    const lines = pasteText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map((l) => l.slice(0, 500))
    if (lines.length === 0) return
    const next = [...phrases, ...lines].slice(0, 50)
    setPasteText('')
    setIsPasteMode(false)
    setIsAdding(false)
    persist(next)
    notifications.show({
      title: `${lines.length} phrase${lines.length === 1 ? '' : 's'} added`,
      message: 'Customer voice updated.',
      color: 'green',
    })
  }

  function handleDelete(idx: number) {
    const next = phrases.filter((_, i) => i !== idx)
    persist(next)
  }

  function handleEditSave(idx: number) {
    const trimmed = editText.trim()
    if (!trimmed) {
      handleDelete(idx)
      setEditingIdx(null)
      return
    }
    const next = phrases.map((p, i) => (i === idx ? trimmed.slice(0, 500) : p))
    setEditingIdx(null)
    persist(next)
  }

  const count = phrases.length
  const hasEnough = count >= 3

  const pastePreviewLines = pasteText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  return (
    <Box>
      {/* Toggle header */}
      <UnstyledButton
        onClick={toggle}
        w="100%"
        py={4}
      >
        <Group justify="space-between" wrap="nowrap">
          <Group gap={8} wrap="nowrap">
            <IconChevronDown
              size={14}
              color="var(--mantine-color-dark-2)"
              style={{
                transform: opened ? 'rotate(0deg)' : 'rotate(-90deg)',
                transition: 'transform 150ms',
              }}
            />
            <IconBlockquote
              size={16}
              color={hasEnough ? 'var(--mantine-color-green-5)' : count === 0 ? 'var(--mantine-color-yellow-5)' : 'var(--mantine-color-dark-2)'}
            />
            <Text size="xs" tt="uppercase" fw={700} c="dark.2">
              Customer voice{' '}
              <Text span c={hasEnough ? 'green.5' : 'dark.3'} inherit>
                ({count === 0 ? 'none yet' : `${count} phrase${count === 1 ? '' : 's'}`})
              </Text>
            </Text>
            {hasEnough && (
              <Box
                w={8}
                h={8}
                style={{ borderRadius: '50%', background: 'var(--mantine-color-green-6)', flexShrink: 0 }}
              />
            )}
            {count === 0 && (
              <Box
                w={8}
                h={8}
                style={{ borderRadius: '50%', border: '2px solid var(--mantine-color-yellow-5)', flexShrink: 0 }}
              />
            )}
          </Group>
          <Button
            size="compact-xs"
            variant="subtle"
            color="brand"
            leftSection={<IconPlus size={12} />}
            onClick={(e) => {
              e.stopPropagation()
              if (!opened) toggle()
              setIsAdding(true)
              setIsPasteMode(false)
              setTimeout(() => inputRef.current?.focus(), 50)
            }}
          >
            {count === 0 ? 'Add phrases' : 'Add phrase'}
          </Button>
        </Group>
      </UnstyledButton>

      <Collapse expanded={opened}>
        <Box
          mt={8}
          p="sm"
          style={{
            borderRadius: 'var(--mantine-radius-md)',
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid var(--mantine-color-dark-6)',
          }}
        >
          {/* Empty state */}
          {count === 0 && !isAdding && (
            <Stack gap="xs" align="center" py="md">
              <Text size="sm" c="dark.1" ta="center" maw={420} lh={1.6}>
                Paste real customer reviews, comments, or quotes — even 5 specific
                phrases dramatically improve the angles and copy our AI writes for
                this product.
              </Text>
              <Text size="xs" c="dark.3" ta="center" fs="italic">
                Skipping this is the #1 reason AI-generated copy sounds generic.
              </Text>
              <Button
                size="xs"
                variant="light"
                color="brand"
                leftSection={<IconPlus size={13} />}
                mt={4}
                onClick={() => {
                  setIsAdding(true)
                  setIsPasteMode(true)
                  setTimeout(() => pasteRef.current?.focus(), 50)
                }}
              >
                Paste phrases
              </Button>
            </Stack>
          )}

          {/* Phrase list */}
          {count > 0 && (
            <Stack gap={4}>
              {phrases.map((phrase, idx) => (
                <Box
                  key={idx}
                  px="sm"
                  py={6}
                  style={{
                    borderRadius: 'var(--mantine-radius-sm)',
                    border: '1px solid var(--mantine-color-dark-6)',
                    background: 'rgba(255, 255, 255, 0.015)',
                    cursor: editingIdx === idx ? 'text' : 'pointer',
                  }}
                >
                  {editingIdx === idx ? (
                    <Group gap="xs" wrap="nowrap">
                      <TextInput
                        value={editText}
                        onChange={(e) => setEditText(e.currentTarget.value)}
                        size="xs"
                        variant="unstyled"
                        styles={{
                          input: { color: 'var(--mantine-color-dark-0)', fontSize: 13 },
                        }}
                        style={{ flex: 1 }}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleEditSave(idx)
                          if (e.key === 'Escape') setEditingIdx(null)
                        }}
                      />
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="green"
                        onClick={() => handleEditSave(idx)}
                      >
                        <IconCheck size={12} />
                      </ActionIcon>
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="gray"
                        onClick={() => setEditingIdx(null)}
                      >
                        <IconX size={12} />
                      </ActionIcon>
                    </Group>
                  ) : (
                    <Group gap="xs" wrap="nowrap" justify="space-between">
                      <Text
                        size="xs"
                        c="dark.0"
                        lh={1.5}
                        style={{
                          flex: 1,
                          overflow: 'hidden',
                          display: '-webkit-box',
                          WebkitBoxOrient: 'vertical',
                          WebkitLineClamp: expandedIdx === idx ? undefined : 2,
                          cursor: 'pointer',
                          fontStyle: 'italic',
                        }}
                        onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                      >
                        &ldquo;{phrase}&rdquo;
                      </Text>
                      <Group gap={2} wrap="nowrap" style={{ flexShrink: 0 }}>
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="gray"
                          onClick={() => {
                            setEditingIdx(idx)
                            setEditText(phrase)
                          }}
                        >
                          <IconPencil size={12} />
                        </ActionIcon>
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="red"
                          onClick={() => handleDelete(idx)}
                        >
                          <IconX size={12} />
                        </ActionIcon>
                      </Group>
                    </Group>
                  )}
                </Box>
              ))}
            </Stack>
          )}

          {/* Add phrase input */}
          {isAdding && (
            <Box mt={count > 0 ? 8 : 0}>
              {!isPasteMode ? (
                <Group gap="xs" wrap="nowrap">
                  <TextInput
                    ref={inputRef}
                    placeholder="Type a customer phrase..."
                    size="xs"
                    value={newPhrase}
                    onChange={(e) => setNewPhrase(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddPhrase()
                      if (e.key === 'Escape') {
                        setIsAdding(false)
                        setNewPhrase('')
                      }
                    }}
                    style={{ flex: 1 }}
                    styles={{
                      input: { fontSize: 13 },
                    }}
                    rightSection={
                      <ActionIcon
                        size="xs"
                        variant="subtle"
                        color="gray"
                        onClick={() => {
                          setIsAdding(false)
                          setNewPhrase('')
                        }}
                      >
                        <IconX size={12} />
                      </ActionIcon>
                    }
                  />
                  <Button size="compact-xs" color="brand" onClick={handleAddPhrase} disabled={!newPhrase.trim()}>
                    Add
                  </Button>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="gray"
                    onClick={() => {
                      setIsPasteMode(true)
                      setTimeout(() => pasteRef.current?.focus(), 50)
                    }}
                  >
                    Paste mode
                  </Button>
                </Group>
              ) : (
                <Stack gap="xs">
                  <Textarea
                    ref={pasteRef}
                    placeholder={"Paste reviews here, one per line...\nMy skin felt like glass overnight\nI was shocked at how fast it worked\nFinally a serum that doesn't pill under makeup"}
                    autosize
                    minRows={3}
                    maxRows={8}
                    size="xs"
                    value={pasteText}
                    onChange={(e) => setPasteText(e.currentTarget.value)}
                    styles={{
                      input: { fontSize: 13 },
                    }}
                  />
                  {pastePreviewLines.length > 0 && (
                    <Text size="xs" c="dark.2">
                      {pastePreviewLines.length} phrase{pastePreviewLines.length === 1 ? '' : 's'} ready to add
                    </Text>
                  )}
                  <Group gap="xs">
                    <Button
                      size="compact-xs"
                      color="brand"
                      onClick={handlePasteCommit}
                      disabled={pastePreviewLines.length === 0}
                    >
                      Add {pastePreviewLines.length || ''} phrase{pastePreviewLines.length === 1 ? '' : 's'}
                    </Button>
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      color="gray"
                      onClick={() => {
                        setIsPasteMode(false)
                        setPasteText('')
                      }}
                    >
                      Single mode
                    </Button>
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      color="gray"
                      onClick={() => {
                        setIsAdding(false)
                        setIsPasteMode(false)
                        setPasteText('')
                        setNewPhrase('')
                      }}
                    >
                      Cancel
                    </Button>
                  </Group>
                </Stack>
              )}
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
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
  const isMobileTile = useMediaQuery('(max-width: 768px)')
  const tileSize = isMobileTile ? 100 : 120
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
      w={tileSize}
      h={tileSize}
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
  const isMobileDropzone = useMediaQuery('(max-width: 768px)')
  const tileSize = isMobileDropzone ? 100 : 120
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
        width: tileSize,
        height: tileSize,
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
        // Masonic caches cell positions and crashes when items shrink
        // (delete / winners-toggle). Re-key on filter + length so it
        // remounts with a fresh cache.
        <Masonry
          key={`${winnersOnly ? 'win' : 'all'}:${visibleCompleted.length}`}
          items={visibleCompleted}
          columnCount={isMobile ? 2 : 4}
          columnGutter={1}
          rowGutter={1}
          render={({ data: gen, index }) => (
            <GenerationCard
              generation={gen}
              title={`${product.name} #${index + 1}`}
              onExpand={(g) => onOpenAd(g._id)}
              onDelete={handleDelete}
              onCreateVariations={setVariationTarget}
              onRetry={handleRetry}
              retrying={retryingId === gen._id}
            />
          )}
        />
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

  // Complete state: image fills the card, blurred bottom overlay carries
  // four icon-only actions. Pending / timed-out / failed states keep the
  // existing aspect-ratio info panel since there's no image to overlay.
  if (isComplete && generation.outputUrl) {
    return (
      <Box
        pos="relative"
        style={{
          borderRadius: 'var(--mantine-radius-sm)',
          overflow: 'hidden',
          cursor: 'pointer',
          backgroundColor: 'var(--mantine-color-dark-7)',
          boxShadow: generation.isWinner
            ? 'inset 0 0 0 2px var(--mantine-color-yellow-5)'
            : 'none',
        }}
        onClick={() => onExpand(generation)}
      >
        <Image
          src={generation.outputUrl}
          alt={title}
          fit="cover"
          w="100%"
          style={{ display: 'block' }}
        />

        {/* Gradient bottom overlay — fades from transparent to dark so the
            image and the icons read together rather than as two stacked
            zones. Matches the home collage hero treatment. */}
        <Box
          pos="absolute"
          left={0}
          right={0}
          bottom={0}
          style={{
            height: '45%',
            background:
              'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) 55%, rgba(0,0,0,0.85) 100%)',
            pointerEvents: 'none',
          }}
        />
        <Box
          pos="absolute"
          left={0}
          right={0}
          bottom={0}
          px={8}
          py={6}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 4,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <ActionIcon
            variant="subtle"
            color="gray.0"
            size="md"
            radius="sm"
            onClick={(e) => {
              e.stopPropagation()
              onCreateVariations({
                _id: generation._id,
                outputUrl: generation.outputUrl!,
              })
            }}
            aria-label="Make variations"
          >
            <IconSparkles size={16} />
          </ActionIcon>
          <WinnerToggle generation={generation} />
          <ActionIcon
            variant="subtle"
            color="gray.0"
            size="md"
            radius="sm"
            onClick={handleDownload}
            loading={isDownloading}
            aria-label="Download"
          >
            <IconDownload size={16} />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            color="red.4"
            size="md"
            radius="sm"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(generation._id)
            }}
            aria-label="Delete generation"
          >
            <IconTrash size={16} />
          </ActionIcon>
        </Box>
      </Box>
    )
  }

  // Pending / timed-out / failed — keep the aspect-ratio info panel.
  return (
    <Card
      radius="sm"
      withBorder
      padding={0}
      style={{
        overflow: 'hidden',
        borderColor: 'var(--mantine-color-dark-5)',
        backgroundColor: 'var(--mantine-color-dark-7)',
      }}
    >
      <Card.Section>
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
    </Card>
  )
}

function WinnerToggle({ generation }: { generation: GenerationData }) {
  const [pending, setPending] = useState(false)
  const toggleWinner = useConvexMutation(api.templateGenerations.toggleWinner)
  const isWinner = !!generation.isWinner
  return (
    <ActionIcon
      variant="subtle"
      color={isWinner ? 'yellow' : 'gray.0'}
      size="md"
      radius="sm"
      loading={pending}
      onClick={async (e) => {
        e.stopPropagation()
        setPending(true)
        try {
          await toggleWinner({ generationId: generation._id })
        } catch (err) {
          notifications.show({
            title: "Couldn't update",
            message: err instanceof Error ? err.message : 'Try again',
            color: 'red',
          })
        } finally {
          setPending(false)
        }
      }}
      aria-label={isWinner ? 'Unmark winner' : 'Mark as winner'}
    >
      {isWinner ? <IconStarFilled size={16} /> : <IconStar size={16} />}
    </ActionIcon>
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
  prefillAngleIndex,
  prefillEditAdId,
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
  prefillAngleIndex?: number | null
  prefillEditAdId?: Id<'templateGenerations'> | null
}) {
  // ── Segment state ──────────────────────────────────────────────────────────
  const [activeSegment, setActiveSegment] = useState<WizardSegment>(
    prefillTemplateId ? 'template' : 'custom',
  )
  // When editing from an ad, ensure we land on the Custom segment
  useEffect(() => {
    if (prefillEditAdId) setActiveSegment('custom')
  }, [prefillEditAdId])

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

  // ── Prefill from angle (Strategy → Compose) ──────────────────────────────
  const [anglePrefillApplied, setAnglePrefillApplied] = useState(false)
  useEffect(() => {
    if (anglePrefillApplied) return
    // Precedence: template > ad > angle — skip if a higher-priority prefill is set
    if (prefillTemplateId || prefillFromAdId) return
    if (
      prefillAngleIndex != null &&
      product.marketingAngles &&
      prefillAngleIndex < product.marketingAngles.length
    ) {
      setSelectedAngleIndex(prefillAngleIndex)
      setActiveSegment('custom')
      // Seed the prompt with the angle's hook (matches chip-click behavior)
      if (prompt.trim().length === 0) {
        setPrompt(product.marketingAngles[prefillAngleIndex].hook)
      }
      setAnglePrefillApplied(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillAngleIndex, product.marketingAngles, anglePrefillApplied, prefillTemplateId, prefillFromAdId])

  // ── Source ad for "Edit with custom prompt" ───────────────────────────────
  const { data: editSourceAd } = useQuery({
    ...convexQuery(api.templateGenerations.getById, {
      generationId: prefillEditAdId as Id<'templateGenerations'>,
    }),
    enabled: !!prefillEditAdId,
  })

  // ── "Include source image" checkbox (edit + normal flows) ─────────────────
  const [includeSourceImage, setIncludeSourceImage] = useState(true)

  // ── Seed aspect ratio from editSourceAd on first load ────────────────────
  const [editArSeedApplied, setEditArSeedApplied] = useState(false)
  useEffect(() => {
    if (editArSeedApplied || !editSourceAd) return
    if (editSourceAd.aspectRatio) {
      setAspectRatio(editSourceAd.aspectRatio as AspectRatio)
    }
    setEditArSeedApplied(true)
  }, [editSourceAd, editArSeedApplied])

  // ── Lock variations to 1 when editing ────────────────────────────────────
  useEffect(() => {
    if (prefillEditAdId) {
      setVariationsPerTemplate('1')
    }
  }, [prefillEditAdId])

  // ── Template browse filters ────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<string | null>(initialFilters?.productCategory ?? null)
  const [filterImageStyle, setFilterImageStyle] = useState<string | null>(initialFilters?.imageStyle ?? null)
  const [filterSetting, setFilterSetting] = useState<string | null>(initialFilters?.setting ?? null)
  const [filterAngleType, setFilterAngleType] = useState<string | null>(initialFilters?.angleType ?? null)
  const [filterAspectRatio, setFilterAspectRatio] = useState<string | null>(null)
  const [mySavesOnly, setMySavesOnly] = useState(false)

  // ── Product inspirations for "My saves" filter ────────────────────────────
  const { data: productInspirations } = useQuery(
    convexQuery(api.productInspirations.listInspirationsForProduct, { productId }),
  )
  const savedTemplateIdsForProduct = new Set(
    (productInspirations ?? [])
      .filter((i: { kind: string; templateId?: unknown }) => i.kind === 'template' && i.templateId)
      .map((i: { templateId?: unknown }) => i.templateId as string),
  )
  const hasSavedTemplates = savedTemplateIdsForProduct.size > 0
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

  const allTemplates = templatesData?.pages.flatMap((page) => page.items) || []
  // When "My saves" chip is on, filter to only saved templates
  const templates = mySavesOnly
    ? allTemplates.filter((t) => savedTemplateIdsForProduct.has(t._id as string))
    : allTemplates

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
          productImageId: includeSourceImage && !prefillEditAdId ? (sourceImageId ?? undefined) : undefined,
          sourceAdId: includeSourceImage && prefillEditAdId ? prefillEditAdId : undefined,
          useSourceImage: includeSourceImage,
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

      {/* Segmented control — hidden when editing an existing ad */}
      {!prefillEditAdId && (
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
      )}

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
            order: isMobile ? 2 : 1,
          }}
        >
          {/* ─── Custom segment ─── */}
          {activeSegment === 'custom' && (
            <Stack gap="md" px="md">
              {/* ─── "Editing from" banner (editAd flow) ─── */}
              {prefillEditAdId && editSourceAd?.outputUrl && (
                <Paper
                  p="sm"
                  radius="md"
                  bg="dark.7"
                  style={{ border: '1px solid var(--mantine-color-violet-8)' }}
                >
                  <Group gap="sm" align="center" wrap="nowrap">
                    <Image
                      src={editSourceAd.outputUrl}
                      alt="Source ad"
                      w={48}
                      h={48}
                      radius="sm"
                      fit="cover"
                      style={{ flexShrink: 0 }}
                    />
                    <Box style={{ flex: 1, minWidth: 0 }}>
                      <Text size="xs" fw={600} c="violet.4">Editing from ad</Text>
                      <Text size="xs" c="dark.2" lineClamp={1}>
                        Write a prompt below — the generation will use this ad as the source image.
                      </Text>
                    </Box>
                  </Group>
                </Paper>
              )}
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
                    {!prefillEditAdId && (
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
                    )}
                    {!prefillEditAdId && (
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
                    )}
                  </Group>
                  <Text size="xs" c="dark.3">{prompt.length} chars</Text>
                </Group>
              </Box>

              {/* ─── AI suggestions panel ─── */}
              {!prefillEditAdId && suggestionsOpen && (
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
              {!prefillEditAdId && builderOpen && (
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

              {/* ─── Template shortcut — hidden when editing an existing ad ─── */}
              {!prefillEditAdId && (
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
              )}
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
                <Tooltip
                  label={hasSavedTemplates ? undefined : 'Save templates to this product first'}
                  disabled={hasSavedTemplates}
                  events={{ hover: true, focus: true, touch: true }}
                >
                  <Button
                    size="sm"
                    variant={mySavesOnly ? 'filled' : 'default'}
                    color={mySavesOnly ? 'brand' : 'gray'}
                    radius="xl"
                    leftSection={<IconBookmarkFilled size={13} />}
                    disabled={!hasSavedTemplates}
                    onClick={() => setMySavesOnly((v) => !v)}
                    styles={{ root: { height: 36 } }}
                  >
                    My saves{hasSavedTemplates ? ` (${savedTemplateIdsForProduct.size})` : ''}
                  </Button>
                </Tooltip>
                <Select
                  placeholder="Category"
                  clearable
                  data={filterOptions?.productCategories ?? []}
                  value={filterCategory}
                  onChange={setFilterCategory}
                  size="sm"
                  w={isMobile ? '100%' : 150}
                />
                <Select
                  placeholder="Style"
                  clearable
                  data={filterOptions?.imageStyles ?? []}
                  value={filterImageStyle}
                  onChange={setFilterImageStyle}
                  size="sm"
                  w={isMobile ? '100%' : 150}
                />
                <Select
                  placeholder="Setting"
                  clearable
                  data={filterOptions?.settings ?? []}
                  value={filterSetting}
                  onChange={setFilterSetting}
                  size="sm"
                  w={isMobile ? '100%' : 150}
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
                  w={isMobile ? '100%' : 150}
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
                  w={isMobile ? '100%' : 110}
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
                  display: 'grid',
                  gridTemplateColumns: isMobile
                    ? 'repeat(2, 1fr)'
                    : 'repeat(4, 1fr)',
                  gap: 1,
                }}>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Box
                      key={i}
                      className="shimmer"
                      style={{
                        borderRadius: 'var(--mantine-radius-sm)',
                        aspectRatio: i % 3 === 0 ? '4/5' : i % 3 === 1 ? '9/16' : '1/1',
                      }}
                    />
                  ))}
                </Box>
              ) : templates.length === 0 ? (
                <Text c="dark.2" ta="center" py={48}>No templates available.</Text>
              ) : (
                <>
                  {/* Masonic caches cell positions and crashes when items
                      shrink. Re-key on filter changes so it remounts. */}
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
                    render={({ data: tpl }) => {
                      const picked = pickedIds.includes(tpl._id)
                      const aspectRatio =
                        tpl.aspectRatio === '4:5'
                          ? '4/5'
                          : tpl.aspectRatio === '9:16'
                            ? '9/16'
                            : '1/1'
                      return (
                        <UnstyledButton
                          onClick={() => toggleTemplate(tpl._id)}
                          w="100%"
                          className="template-card-selectable"
                          data-testid={`template-card-${tpl._id}`}
                          aria-pressed={picked}
                          aria-label={`Select template: ${[tpl.imageStyle, tpl.setting, tpl.productCategory].filter(Boolean).join(', ') || 'Ad template'}`}
                          style={{
                            borderRadius: 'var(--mantine-radius-sm)',
                            overflow: 'hidden',
                            boxShadow: picked
                              ? 'inset 0 0 0 3px var(--mantine-color-brand-5), 0 0 0 2px rgba(84, 116, 180, 0.35)'
                              : 'none',
                            position: 'relative',
                            display: 'block',
                            transition: 'all 200ms ease',
                            transform: picked ? 'scale(1.02)' : 'scale(1)',
                          }}
                        >
                          <Box style={{ aspectRatio }}>
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
                    }}
                  />
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
            order: isMobile ? 1 : 2,
          }}
        >
          {/* Source image picker */}
          <Box mb="md">
            <Text size="xs" tt="uppercase" fw={700} c="dark.2" mb="xs">
              Source image
            </Text>
            <Paper p="sm" bg="dark.7" radius="md" style={{ border: '1px solid var(--mantine-color-dark-5)' }}>
              {prefillEditAdId ? (
                /* ── Editing flow: show the source ad as the reference image ── */
                <Group gap="sm" align="center">
                  <Box
                    w={56}
                    h={56}
                    style={{
                      borderRadius: 6,
                      overflow: 'hidden',
                      flexShrink: 0,
                      border: '1px solid var(--mantine-color-violet-6)',
                    }}
                  >
                    <Image
                      src={editSourceAd?.outputUrl || ''}
                      alt="Source ad"
                      fit="cover"
                      w="100%"
                      h="100%"
                    />
                  </Box>
                  <Box style={{ flex: 1, minWidth: 0 }}>
                    <Text size="sm" fw={600} c="white" lineClamp={1}>
                      Editing from ad
                    </Text>
                    <Text size="xs" c="dark.2">
                      Source ad image
                    </Text>
                  </Box>
                </Group>
              ) : (
                /* ── Normal flow: product image picker ── */
                <>
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
                </>
              )}
              {/* Include source image checkbox — visible in both flows */}
              <Box mt="sm" pt="sm" style={{ borderTop: '1px solid var(--mantine-color-dark-6)' }}>
                <Checkbox
                  label="Include source image"
                  checked={includeSourceImage}
                  onChange={(e) => setIncludeSourceImage(e.currentTarget.checked)}
                  size="xs"
                />
                <Text size="xs" c="dark.3" mt={4}>
                  When unchecked, generate purely from your prompt — no visual reference.
                </Text>
              </Box>
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
              disabled={!!prefillEditAdId}
            />
            {prefillEditAdId && (
              <Text size="xs" c="dark.3" mt={4}>
                Locked to 1 when editing an existing ad.
              </Text>
            )}
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

// ── Inspiration Row ──────────────────────────────────────────────────────────

type InspirationItem = {
  _id: Id<'productInspirations'>
  kind: 'template' | 'external'
  templateId?: Id<'adTemplates'>
  imageUrl?: string
  sourceUrl?: string
  note?: string
  template: {
    thumbnailUrl: string
    imageUrl: string
    aspectRatio: string
    productCategory?: string
    imageStyle?: string
    setting?: string
    angleType?: string
  } | null
}

function InspirationRow({
  productId,
  onNewAd,
}: {
  productId: Id<'products'>
  onNewAd: () => void
}) {
  const navigate = useNavigate()
  const { data: inspirations } = useQuery(
    convexQuery(api.productInspirations.listInspirationsForProduct, { productId }),
  )
  const removeInspiration = useConvexMutation(api.productInspirations.removeInspiration)
  const removeMutation = useMutation({ mutationFn: removeInspiration })

  const [addModalOpen, setAddModalOpen] = useState(false)
  const [previewItem, setPreviewItem] = useState<InspirationItem | null>(null)

  const items = (inspirations ?? []) as InspirationItem[]
  const count = items.length

  async function handleRemove(id: Id<'productInspirations'>) {
    try {
      await removeMutation.mutateAsync({ inspirationId: id })
      if (previewItem?._id === id) setPreviewItem(null)
      notifications.show({ message: 'Removed from inspiration', color: 'gray', autoClose: 3000 })
    } catch {
      notifications.show({ title: 'Error', message: 'Failed to remove', color: 'red' })
    }
  }

  return (
    <>
      <Stack gap={6}>
        <Group justify="space-between" align="center">
          <Group gap={6}>
            <Text size="xs" tt="uppercase" fw={700} c="dark.2">
              Inspiration
            </Text>
            {count > 0 && (
              <Badge size="xs" variant="light" color="brand" radius="sm">
                {count}
              </Badge>
            )}
          </Group>
          <Button
            size="xs"
            variant="subtle"
            color="brand"
            leftSection={<IconPlus size={12} />}
            onClick={() => setAddModalOpen(true)}
          >
            Add inspiration
          </Button>
        </Group>

        {count === 0 ? (
          <Paper
            radius="md"
            p="md"
            style={{
              border: '1px dashed var(--mantine-color-dark-4)',
              background: 'rgba(84, 116, 180, 0.03)',
            }}
          >
            <Text size="sm" c="dark.2" mb="xs">
              Save reference ads from /templates or paste URLs here.
              We'll riff on these when you generate new ads.
            </Text>
            <Group gap="xs">
              <Button
                size="xs"
                variant="light"
                color="brand"
                component={Link}
                to="/templates"
              >
                Browse templates
              </Button>
              <Button
                size="xs"
                variant="light"
                color="gray"
                leftSection={<IconLink size={12} />}
                onClick={() => setAddModalOpen(true)}
              >
                Paste URL
              </Button>
            </Group>
          </Paper>
        ) : (
          <ScrollArea scrollbarSize={4} type="hover">
            <Group gap={8} wrap="nowrap" pb={4}>
              {items.map((item) => {
                const thumbUrl =
                  item.kind === 'template'
                    ? item.template?.thumbnailUrl
                    : item.imageUrl
                return (
                  <Box
                    key={item._id}
                    w={150}
                    h={190}
                    pos="relative"
                    style={{
                      borderRadius: 8,
                      overflow: 'hidden',
                      flexShrink: 0,
                      border: '1px solid var(--mantine-color-dark-5)',
                      backgroundColor: 'var(--mantine-color-dark-7)',
                      cursor: 'pointer',
                      transition: 'border-color 120ms ease',
                    }}
                    onClick={() => setPreviewItem(item)}
                  >
                    {thumbUrl ? (
                      <Image
                        src={thumbUrl}
                        alt="Inspiration"
                        fit="cover"
                        w="100%"
                        h="100%"
                      />
                    ) : (
                      <Center h="100%">
                        <IconPhoto size={24} color="var(--mantine-color-dark-3)" />
                      </Center>
                    )}
                    {/* Remove button on hover */}
                    <UnstyledButton
                      pos="absolute"
                      top={4}
                      right={4}
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation()
                        handleRemove(item._id)
                      }}
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        backgroundColor: 'rgba(0, 0, 0, 0.65)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: 0,
                        transition: 'opacity 120ms ease',
                      }}
                      styles={{
                        root: {
                          '&:hover': { opacity: 1 },
                        },
                      }}
                      className="inspiration-remove-btn"
                      aria-label="Remove inspiration"
                    >
                      <IconX size={12} color="white" />
                    </UnstyledButton>
                    {/* Kind indicator */}
                    {item.kind === 'external' && item.sourceUrl && (
                      <Box
                        pos="absolute"
                        bottom={4}
                        left={4}
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
                        URL
                      </Box>
                    )}
                  </Box>
                )
              })}
            </Group>
          </ScrollArea>
        )}
      </Stack>

      {/* Inspiration preview modal */}
      <InspirationPreviewModal
        item={previewItem}
        onClose={() => setPreviewItem(null)}
        onRemove={handleRemove}
        onGenerate={(item) => {
          setPreviewItem(null)
          if (item.kind === 'template' && item.templateId) {
            navigate({
              to: '/studio/$productId',
              params: { productId: productId as string },
              search: { compose: 'true', template: item.templateId as string },
            })
          } else {
            navigate({
              to: '/studio/$productId',
              params: { productId: productId as string },
              search: { compose: 'true' },
            })
          }
        }}
        productId={productId}
      />

      {/* Add Inspiration modal */}
      <AddInspirationModal
        opened={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        productId={productId}
      />

      {/* CSS for hover-reveal remove button */}
      <style>{`
        [class*="inspiration"] .inspiration-remove-btn { opacity: 0; }
        *:hover > .inspiration-remove-btn { opacity: 1 !important; }
      `}</style>
    </>
  )
}

// ── Inspiration Preview Modal ────────────────────────────────────────────────

function InspirationPreviewModal({
  item,
  onClose,
  onRemove,
  onGenerate,
  productId,
}: {
  item: InspirationItem | null
  onClose: () => void
  onRemove: (id: Id<'productInspirations'>) => void
  onGenerate: (item: InspirationItem) => void
  productId: Id<'products'>
}) {
  const updateNote = useConvexMutation(api.productInspirations.updateInspirationNote)
  const updateNoteMutation = useMutation({ mutationFn: updateNote })
  const [editingNote, setEditingNote] = useState(false)
  const [noteText, setNoteText] = useState('')
  const isMobileModal = useMediaQuery('(max-width: 768px)')

  useEffect(() => {
    if (item) {
      setNoteText(item.note ?? '')
      setEditingNote(false)
    }
  }, [item])

  if (!item) return null

  const imageUrl =
    item.kind === 'template'
      ? item.template?.imageUrl
      : item.imageUrl

  async function handleSaveNote() {
    if (!item) return
    try {
      await updateNoteMutation.mutateAsync({
        inspirationId: item._id,
        note: noteText,
      })
      setEditingNote(false)
      notifications.show({ message: 'Note saved', color: 'green', autoClose: 2000 })
    } catch {
      notifications.show({ title: 'Error', message: 'Failed to save note', color: 'red' })
    }
  }

  return (
    <Modal
      opened={!!item}
      onClose={onClose}
      size={isMobileModal ? '100%' : 'lg'}
      fullScreen={isMobileModal}
      radius="md"
      centered
      title="Inspiration"
    >
      <Stack gap="md">
        {imageUrl && (
          <Box
            style={{
              borderRadius: 'var(--mantine-radius-md)',
              overflow: 'hidden',
              border: '1px solid var(--mantine-color-dark-5)',
            }}
          >
            <Image src={imageUrl} alt="Inspiration" fit="contain" mah={400} />
          </Box>
        )}

        {/* Source URL */}
        {item.kind === 'external' && item.sourceUrl && (
          <Anchor href={item.sourceUrl} target="_blank" size="sm" c="brand.4">
            <Group gap={4}>
              <IconExternalLink size={14} />
              {item.sourceUrl.length > 60
                ? item.sourceUrl.slice(0, 60) + '...'
                : item.sourceUrl}
            </Group>
          </Anchor>
        )}

        {/* Template metadata */}
        {item.kind === 'template' && item.template && (
          <Group gap="xs" wrap="wrap">
            {item.template.productCategory && (
              <Badge variant="light" color="gray" size="sm">
                {capitalizeWords(item.template.productCategory)}
              </Badge>
            )}
            {item.template.imageStyle && (
              <Badge variant="light" color="teal" size="sm">
                {capitalizeWords(item.template.imageStyle)}
              </Badge>
            )}
            {item.template.setting && (
              <Badge variant="light" color="indigo" size="sm">
                {capitalizeWords(item.template.setting)}
              </Badge>
            )}
            <Badge variant="light" color="brand" size="sm">
              {item.template.aspectRatio}
            </Badge>
          </Group>
        )}

        {/* Note */}
        <Box>
          <Text size="xs" fw={600} c="dark.2" mb={4}>Note</Text>
          {editingNote ? (
            <Stack gap="xs">
              <Textarea
                value={noteText}
                onChange={(e) => setNoteText(e.currentTarget.value)}
                placeholder="Why did you save this?"
                autosize
                minRows={2}
                maxRows={5}
              />
              <Group gap="xs">
                <Button
                  size="xs"
                  variant="light"
                  color="brand"
                  onClick={handleSaveNote}
                  loading={updateNoteMutation.isPending}
                >
                  Save
                </Button>
                <Button
                  size="xs"
                  variant="subtle"
                  color="gray"
                  onClick={() => setEditingNote(false)}
                >
                  Cancel
                </Button>
              </Group>
            </Stack>
          ) : (
            <UnstyledButton
              onClick={() => setEditingNote(true)}
              style={{
                padding: '6px 8px',
                borderRadius: 'var(--mantine-radius-sm)',
                border: '1px solid var(--mantine-color-dark-5)',
                width: '100%',
                minHeight: 32,
              }}
            >
              <Text size="sm" c={item.note ? 'dark.1' : 'dark.3'} fs={item.note ? undefined : 'italic'}>
                {item.note || 'Add a note...'}
              </Text>
            </UnstyledButton>
          )}
        </Box>

        {/* Actions */}
        <Group gap="sm">
          <Button
            flex={1}
            color="brand"
            leftSection={<IconSparkles size={16} />}
            onClick={() => onGenerate(item)}
          >
            Generate ad inspired by this
          </Button>
          <Button
            variant="light"
            color="red"
            onClick={() => {
              onRemove(item._id)
              onClose()
            }}
          >
            Remove
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

// ── Add Inspiration Modal ────────────────────────────────────────────────────

function AddInspirationModal({
  opened,
  onClose,
  productId,
}: {
  opened: boolean
  onClose: () => void
  productId: Id<'products'>
}) {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const convex = useConvex()

  // ── Paste URL tab state ──────────────────────────────────────────────────
  const [urlInput, setUrlInput] = useState('')
  const [urlNote, setUrlNote] = useState('')
  const [isFetching, setIsFetching] = useState(false)
  const [fetchedPreview, setFetchedPreview] = useState<{ imageUrl: string; sourceUrl: string } | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  const fetchAction = useAction(api.productInspirationsActions.fetchAndSaveExternalInspiration)
  const uploadAction = useAction(api.r2.uploadProductImage)
  const saveExternal = useConvexMutation(api.productInspirations.saveExternalInspiration)
  const saveExternalMutation = useMutation({ mutationFn: saveExternal })

  // ── Template browse tab state ────────────────────────────────────────────
  const [tplSearch, setTplSearch] = useState('')
  const [tplFilterCategory, setTplFilterCategory] = useState<string | null>(null)
  const saveTemplate = useConvexMutation(api.productInspirations.saveTemplateAsInspiration)
  const saveTemplateMutation = useMutation({ mutationFn: saveTemplate })

  const { data: filterOptions } = useQuery(
    convexQuery(api.products.listTemplateFilterOptions, {}),
  )

  const tplFilterArgs = {
    search: tplSearch.trim() || undefined,
    productCategory: tplFilterCategory ?? undefined,
  }

  const {
    data: tplData,
    isLoading: tplLoading,
    fetchNextPage: tplFetchNext,
    hasNextPage: tplHasNext,
    isFetchingNextPage: tplFetchingNext,
  } = useInfiniteQuery({
    queryKey: ['inspoTemplates', tplFilterArgs.search, tplFilterArgs.productCategory],
    queryFn: async ({ pageParam }) => {
      return convex.query(api.products.listTemplates, {
        cursor: pageParam,
        limit: 16,
        ...tplFilterArgs,
      })
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
    enabled: opened,
  })

  const tplItems = tplData?.pages.flatMap((p) => p.items) ?? []

  // Track which templates are already saved to this product
  const { data: currentInspirations } = useQuery({
    ...convexQuery(api.productInspirations.listInspirationsForProduct, { productId }),
    enabled: opened,
  })
  const savedTemplateIds = new Set(
    (currentInspirations ?? [])
      .filter((i: { kind: string; templateId?: string }) => i.kind === 'template' && i.templateId)
      .map((i: { templateId?: string }) => i.templateId),
  )

  const tplObserverRef = useRef<IntersectionObserver | null>(null)
  const tplLoadMoreRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (tplFetchingNext) return
      if (tplObserverRef.current) tplObserverRef.current.disconnect()
      tplObserverRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && tplHasNext) tplFetchNext()
      })
      if (node) tplObserverRef.current.observe(node)
    },
    [tplFetchingNext, tplHasNext, tplFetchNext],
  )

  async function handleFetchUrl() {
    if (!urlInput.trim()) return
    setIsFetching(true)
    setFetchedPreview(null)
    try {
      const result = await fetchAction({
        productId,
        sourceUrl: urlInput.trim(),
        note: urlNote.trim() || undefined,
      })
      notifications.show({ message: 'Saved from URL', color: 'green', autoClose: 3000 })
      setUrlInput('')
      setUrlNote('')
      setFetchedPreview(null)
    } catch (err) {
      notifications.show({
        title: 'Could not fetch',
        message: err instanceof Error ? err.message : 'Try uploading an image instead.',
        color: 'red',
        autoClose: 6000,
      })
    } finally {
      setIsFetching(false)
    }
  }

  async function handleDropUpload(files: File[]) {
    const file = files[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      notifications.show({ title: 'Too large', message: 'Image must be under 10 MB', color: 'red' })
      return
    }
    setIsUploading(true)
    try {
      const arrayBuffer = await file.arrayBuffer()
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          '',
        ),
      )
      const { url, key } = await uploadAction({
        name: file.name,
        base64,
        contentType: file.type,
      })
      await saveExternalMutation.mutateAsync({
        productId,
        imageUrl: url,
        imageStorageKey: key,
        note: urlNote.trim() || undefined,
      })
      setUrlNote('')
      notifications.show({ message: 'Image saved as inspiration', color: 'green', autoClose: 3000 })
    } catch (err) {
      notifications.show({
        title: 'Upload failed',
        message: err instanceof Error ? err.message : 'Try again',
        color: 'red',
      })
    } finally {
      setIsUploading(false)
    }
  }

  async function handleSaveTemplate(templateId: Id<'adTemplates'>) {
    try {
      await saveTemplateMutation.mutateAsync({ productId, templateId })
      notifications.show({ message: 'Template saved', color: 'green', autoClose: 2000 })
    } catch {
      notifications.show({ title: 'Error', message: 'Failed to save', color: 'red' })
    }
  }

  function handleClose() {
    setUrlInput('')
    setUrlNote('')
    setFetchedPreview(null)
    setTplSearch('')
    setTplFilterCategory(null)
    onClose()
  }

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      size={isMobile ? '100%' : 'xl'}
      fullScreen={isMobile}
      radius="md"
      title="Add inspiration"
      styles={{
        body: { padding: 'var(--mantine-spacing-md)', minHeight: 400 },
      }}
    >
      <Tabs defaultValue="browse">
        <Tabs.List mb="md">
          <Tabs.Tab value="browse">Browse templates</Tabs.Tab>
          <Tabs.Tab value="url">Paste URL or upload</Tabs.Tab>
        </Tabs.List>

        {/* ── Browse templates tab ── */}
        <Tabs.Panel value="browse">
          <Group gap="sm" mb="md" wrap="wrap">
            <TextInput
              placeholder="Search templates..."
              value={tplSearch}
              onChange={(e) => setTplSearch(e.currentTarget.value)}
              leftSection={<IconPhoto size={14} />}
              size="sm"
              style={{ flex: 1, minWidth: 180 }}
            />
            <Select
              placeholder="Category"
              clearable
              data={filterOptions?.productCategories ?? []}
              value={tplFilterCategory}
              onChange={setTplFilterCategory}
              size="sm"
              w={150}
            />
          </Group>

          {tplLoading && tplItems.length === 0 ? (
            <Center py="xl"><Loader size="sm" color="brand" /></Center>
          ) : tplItems.length === 0 ? (
            <Text c="dark.2" ta="center" py="xl">No templates found.</Text>
          ) : (
            <ScrollArea h={isMobile ? 300 : 400} scrollbarSize={4}>
              <Box style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
                gap: '0.5rem',
              }}>
                {tplItems.map((tpl) => {
                  const alreadySaved = savedTemplateIds.has(tpl._id)
                  return (
                    <UnstyledButton
                      key={tpl._id}
                      onClick={() => !alreadySaved && handleSaveTemplate(tpl._id)}
                      style={{
                        borderRadius: 'var(--mantine-radius-md)',
                        overflow: 'hidden',
                        border: `2px solid ${alreadySaved ? 'var(--mantine-color-brand-5)' : 'var(--mantine-color-dark-5)'}`,
                        position: 'relative',
                        opacity: alreadySaved ? 0.7 : 1,
                      }}
                    >
                      <AspectRatio ratio={4 / 5}>
                        <Image src={tpl.thumbnailUrl} alt="Template" fit="cover" />
                      </AspectRatio>
                      {alreadySaved && (
                        <Box
                          pos="absolute"
                          top={6}
                          right={6}
                          w={22}
                          h={22}
                          bg="brand"
                          style={{
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <IconCheck size={13} color="white" strokeWidth={3} />
                        </Box>
                      )}
                      {tpl.productCategory && (
                        <Badge
                          size="xs"
                          variant="filled"
                          color="dark"
                          pos="absolute"
                          bottom={6}
                          left={6}
                          style={{ opacity: 0.85 }}
                        >
                          {capitalizeWords(tpl.productCategory)}
                        </Badge>
                      )}
                    </UnstyledButton>
                  )
                })}
              </Box>
              {tplHasNext && (
                <Center ref={tplLoadMoreRef} py="md">
                  {tplFetchingNext ? (
                    <Loader size="sm" color="brand" />
                  ) : (
                    <Text size="sm" c="dark.3">Scroll for more</Text>
                  )}
                </Center>
              )}
            </ScrollArea>
          )}
        </Tabs.Panel>

        {/* ── Paste URL / upload tab ── */}
        <Tabs.Panel value="url">
          <Stack gap="md">
            <Box>
              <Text size="sm" fw={500} c="white" mb="xs">
                Paste a URL (FB Ad Library, Pinterest, any page with an image)
              </Text>
              <Group gap="sm" align="flex-end">
                <TextInput
                  placeholder="https://www.facebook.com/ads/library/..."
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.currentTarget.value)}
                  leftSection={<IconLink size={14} />}
                  size="sm"
                  style={{ flex: 1 }}
                  onKeyDown={(e) => e.key === 'Enter' && handleFetchUrl()}
                />
                <Button
                  size="sm"
                  color="brand"
                  onClick={handleFetchUrl}
                  loading={isFetching}
                  disabled={!urlInput.trim()}
                >
                  Fetch image
                </Button>
              </Group>
            </Box>

            <Box>
              <Text size="sm" fw={500} c="white" mb="xs">
                Or upload an image directly
              </Text>
              <Dropzone
                onDrop={handleDropUpload}
                accept={IMAGE_MIME_TYPE}
                maxSize={10 * 1024 * 1024}
                multiple={false}
                disabled={isUploading}
                radius="md"
                style={{
                  borderStyle: 'dashed',
                  borderWidth: 2,
                  borderColor: 'var(--mantine-color-dark-4)',
                  backgroundColor: 'var(--mantine-color-dark-7)',
                  minHeight: 100,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Stack align="center" gap="xs">
                  {isUploading ? (
                    <Loader size="sm" color="brand" />
                  ) : (
                    <>
                      <ThemeIcon size={36} radius="md" color="brand" variant="light">
                        <IconUpload size={18} />
                      </ThemeIcon>
                      <Text size="sm" c="dark.2">Drop a screenshot or click to upload (PNG/JPG)</Text>
                    </>
                  )}
                </Stack>
              </Dropzone>
            </Box>

            <Textarea
              label="Note (optional)"
              placeholder="Why is this reference interesting?"
              value={urlNote}
              onChange={(e) => setUrlNote(e.currentTarget.value)}
              autosize
              minRows={2}
              maxRows={4}
            />
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Modal>
  )
}
