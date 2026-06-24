import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { DefaultCatchBoundary } from '~/components/DefaultCatchBoundary'
import { useQuery, useMutation, useInfiniteQuery } from '@tanstack/react-query'
import { useConvexMutation, convexQuery } from '@convex-dev/react-query'
import { useAction, useQuery as useConvexQuery } from 'convex/react'
import { useState, useRef, useCallback, useEffect } from 'react'
import { notifications } from '@mantine/notifications'
import { modals } from '@mantine/modals'
import { useMediaQuery, useDisclosure } from '@mantine/hooks'
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
  Image,
  Badge,
  Loader,
  TextInput,
  Checkbox,
  Radio,
  ActionIcon,
  Anchor,
  UnstyledButton,
  Modal,
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
  Collapse,
  Switch,
  ColorSwatch,
  SimpleGrid,
} from '@mantine/core'
import { Dropzone, IMAGE_MIME_TYPE } from '@mantine/dropzone'
import {
  IconChevronLeft,
  IconArrowRight,
  IconCheck,
  IconTag,
  IconDownload,
  IconTrash,
  IconSparkles,
  IconPhoto,
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
import { mapGenerationError } from '../lib/billing/mapBillingError'
import { OutOfCreditsModal } from '../components/billing/OutOfCreditsModal'
import { ConvexError } from 'convex/values'
import { fetchDownloadAsset } from '../utils/downloads'
import { AdDetailPanel } from '../components/ads/AdDetailPanel'
import { AdTestReviewView } from '../components/ads/AdTestReviewView'
import { AdTestsSection } from '../components/ads/AdTestsSection'
import type { TemplateFilters } from '../components/product/types'
import { angleTypeLabel } from '../components/product/MarketingAnalysisPanel'
import { BrandPicker } from '../components/brand/BrandPicker'
import { useCustomTemplateUpload } from '../utils/customTemplateUpload'
import { MAX_TEMPLATE_IMAGE_SIZE } from '../utils/constants'

type ProductSearch = { compose?: string; ad?: string; template?: string; angle?: string; concept?: string; editAd?: string; adTestId?: string }

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
    if (typeof search.concept === 'string' && /^\d+$/.test(search.concept)) {
      out.concept = search.concept
    }
    if (typeof search.editAd === 'string' && search.editAd.length > 0) {
      out.editAd = search.editAd
    }
    if (typeof search.adTestId === 'string' && search.adTestId.length > 0) {
      out.adTestId = search.adTestId
    }
    return out
  },
  component: ProductWorkspacePage,
  errorComponent: DefaultCatchBoundary,
})

type AspectRatio = '1:1' | '4:5' | '9:16'
type Mode = 'exact' | 'remix'
type View = 'gallery' | 'generate'

// Type for generation data from the query
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
  const createAdTest = useConvexMutation(api.adTests.createDraft)

  // "New ad test": create an empty (template-based) draft and drop the user
  // straight into the generate wizard scoped to it. Creatives + copy are added
  // inside the test.
  const handleNewAdTest = async () => {
    try {
      const id = await createAdTest({
        productId: productId as Id<'products'>,
        name: `Ad test ${new Date().toLocaleDateString()}`,
        source: 'custom',
        angles: [],
        placements: ['feed_square', 'feed_vertical', 'story_reel'],
      })
      navigate({
        to: '/studio/$productId',
        params: { productId },
        search: { ...search, adTestId: id as string, compose: 'true' },
      })
    } catch (err) {
      notifications.show({
        color: 'red',
        message:
          err instanceof Error ? err.message : 'Could not create ad test',
      })
    }
  }
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  // Nested routes (e.g. /studio/$productId/strategy) take over the page —
  // render only the child Outlet and skip the workspace content.
  const isChildActive = pathname !== `/studio/${productId}`
  const isAdTestReview = !!search.adTestId
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
    if (search.compose || search.template || search.angle || search.concept || search.editAd) {
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
      <Container fluid p="lg">
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
      <Container fluid p="lg">
        <Box py={80} ta="center">
          <Title order={2} fz="xl" fw={500} c="white" mb="xs">Product not found</Title>
          <Anchor component={Link} to="/studio" c="brand.5">
            Back to products
          </Anchor>
        </Box>
      </Container>
    )
  }

  const anglesCount = product.marketingAngles?.length ?? 0

  return (
    <Container fluid p="lg">
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

      {/* Rich product card — hidden in generate mode and ad test review mode */}
      {view !== 'generate' && !isAdTestReview && (
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

      {/* Ad Test review mode — takes over the whole content area. With
          ?compose=true it shows the generate wizard scoped to the test
          (creatives attach to the test); otherwise the review screen. */}
      {isAdTestReview && search.compose === 'true' && (
        <GenerateWizard
          productId={productId as Id<'products'>}
          product={product}
          primaryImageUrl={primaryImageUrl}
          creditsExhausted={creditsExhausted}
          initialFilters={initialFilters}
          adTestId={search.adTestId as Id<'adTests'>}
          prefillAngleIndex={
            search.angle != null ? Number(search.angle) : null
          }
          prefillConceptIndex={
            search.concept != null ? Number(search.concept) : null
          }
          onBack={() => {
            const { compose: _omit, angle: _angle, concept: _concept, ...rest } = search
            navigate({
              to: '/studio/$productId',
              params: { productId },
              search: rest,
              replace: true,
            })
          }}
          onComplete={() => {
            const { compose: _omit, angle: _angle, concept: _concept, ...rest } = search
            navigate({
              to: '/studio/$productId',
              params: { productId },
              search: rest,
              replace: true,
            })
          }}
        />
      )}

      {isAdTestReview && search.compose !== 'true' && (
        <>
          <AdTestReviewView
            adTestId={search.adTestId as Id<'adTests'>}
            productName={product.name}
            // `free_user` is a real (truthy) plan slug, so `!!plan` would treat
            // starter users as paid. Export is a paid-only feature: exclude it.
            hasPaidPlan={
              billingStatus?.plan != null && billingStatus.plan !== 'free_user'
            }
            onBack={() => {
              // Reset view: entering the in-test wizard flips view→'generate'
              // (via the compose effect); without resetting, backing out of the
              // review would land on the standalone wizard instead of gallery.
              setView('gallery')
              const { adTestId: _omit, ad: _omit2, compose: _omit3, ...rest } =
                search
              navigate({
                to: '/studio/$productId',
                params: { productId },
                search: rest,
                replace: true,
              })
            }}
            onGenerate={() =>
              navigate({
                to: '/studio/$productId',
                params: { productId },
                search: { ...search, compose: 'true' },
              })
            }
            onOpenAd={(id) =>
              navigate({
                to: '/studio/$productId',
                params: { productId },
                search: { ...search, ad: id as string },
              })
            }
          />
          {/* Reuse the existing AdDetailPanel for full ad detail view */}
          <AdDetailPanel
            opened={!!search.ad}
            onClose={() => {
              const { ad: _omit, ...rest } = search
              navigate({
                to: '/studio/$productId',
                params: { productId },
                search: rest,
                replace: true,
              })
            }}
            adId={(search.ad ?? null) as Id<'templateGenerations'> | null}
            siblings={[]}
          />
        </>
      )}

      {!isAdTestReview && view === 'gallery' && (
        <AdTestsSection
          productId={productId as Id<'products'>}
          onOpenTest={(id) =>
            navigate({
              to: '/studio/$productId',
              params: { productId },
              search: { ...search, adTestId: id as string },
            })
          }
          onNewTest={handleNewAdTest}
          creditsExhausted={creditsExhausted}
        />
      )}

      {/* The flat "all generations" grid was removed: creatives now live inside
          their ad test (each test card on the product page shows its own photo
          mosaic). Past standalone generations remain browsable in /library. */}

      {!isAdTestReview && view === 'generate' && (
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
          prefillConceptIndex={
            search.concept != null ? Number(search.concept) : null
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
    valueProposition?: string
    marketingAngles?: Array<{
      title: string
      description: string
      hook: string
      suggestedAdStyle: string
      angleType?: string
    }>
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
      const info = mapGenerationError(err)
      notifications.show({
        title: info.title,
        message: info.message,
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
            value="angles"
            leftSection={<Box visibleFrom="sm"><IconTarget size={14} /></Box>}
            rightSection={
              anglesCount > 0 ? (
                <Badge size="xs" variant="light" color="brand" radius="sm">
                  {anglesCount}
                </Badge>
              ) : null
            }
          >
            Recommended angles
          </Tabs.Tab>
        </Tabs.List>

        <Paper
          radius="lg"
          p={isMobile ? 'md' : 'xl'}
          mt="md"
          mih={isMobile ? 280 : 280}
          style={{
            // Solid elevated surface (lighter than the page) + a visible border
            // + soft shadow so the hero clearly reads as a raised card instead of
            // dissolving into the background. Brand tint kept as a subtle overlay.
            background:
              'linear-gradient(135deg, rgba(84, 116, 180, 0.12) 0%, rgba(84, 116, 180, 0) 55%), var(--mantine-color-dark-6)',
            border: '1px solid var(--mantine-color-dark-4)',
            borderTopLeftRadius: 0,
            boxShadow: '0 6px 24px rgba(0, 0, 0, 0.35)',
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

          {/* ── Recommended angles ──────────────────────────────────── */}
          <Tabs.Panel value="angles">
            <RecommendedAnglesPanel
              productId={productId}
              status={product.status}
              valueProposition={product.valueProposition}
              angles={product.marketingAngles ?? []}
              creditsExhausted={creditsExhausted}
            />
          </Tabs.Panel>

        </Paper>
      </Tabs>

      {/* Generation is ad-test-centric now: the "Ad tests" section below is the
          single entry point ("New ad test"). The old standalone "New ad" button
          was removed to avoid a competing "generate ad" vs "generate ad test"
          CTA on the same page. */}

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

type RecommendedAngle = {
  title: string
  description: string
  hook: string
  suggestedAdStyle: string
  angleType?: string
}

type CreativeConcept = {
  title: string
  format: string
  idea: string
  opening: string
}

function buildCreativeConcepts(angle: RecommendedAngle): CreativeConcept[] {
  const style = angle.suggestedAdStyle || 'UGC-style product ad'
  const hook = angle.hook || `Why this ${angle.title.toLowerCase()} angle matters`
  return [
    {
      title: 'Day-in-the-life proof',
      format: style,
      idea: `Show the product naturally solving the "${angle.title}" job across a normal day. Use quick cuts that move from the starting problem into the satisfying end state.`,
      opening: hook,
    },
    {
      title: 'Problem to payoff demo',
      format: 'Problem/solution sequence',
      idea: `Open on the specific friction behind this angle, then show the product as the practical fix. Make the before state obvious, the product use simple, and the payoff easy to read.`,
      opening: angle.description,
    },
    {
      title: 'Comparison frame',
      format: 'Side-by-side or replacement story',
      idea: `Compare the old way buyers handle this need against the product-led way. Keep the contrast concrete: what feels harder, slower, less comfortable, or less desirable without the product.`,
      opening: `The old way vs. the ${angle.title.toLowerCase()} way.`,
    },
  ]
}

function RecommendedAnglesPanel({
  productId,
  status,
  valueProposition,
  angles,
  creditsExhausted,
}: {
  productId: Id<'products'>
  status: 'analyzing' | 'ready' | 'failed'
  valueProposition?: string
  angles: RecommendedAngle[]
  creditsExhausted: boolean
}) {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const navigate = useNavigate()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [creatingKey, setCreatingKey] = useState<string | null>(null)
  const createAdTest = useConvexMutation(api.adTests.createDraft)
  const createConceptTestMutation = useMutation({ mutationFn: createAdTest })
  const selectedAngle = angles[selectedIndex] ?? angles[0]
  const concepts = selectedAngle ? buildCreativeConcepts(selectedAngle) : []

  useEffect(() => {
    if (selectedIndex >= angles.length) setSelectedIndex(0)
  }, [angles.length, selectedIndex])

  async function handleChooseTemplates(concept: CreativeConcept, conceptIndex: number) {
    const key = `${selectedIndex}-${conceptIndex}`
    setCreatingKey(key)
    try {
      const adTestId = await createConceptTestMutation.mutateAsync({
        productId,
        name: `${selectedAngle?.title ?? 'Ad test'} - ${concept.title}`,
        source: 'custom',
        angles: selectedAngle
          ? [{
              key: `product-angle-${selectedIndex}`,
              title: selectedAngle.title,
              description: selectedAngle.description,
              hook: selectedAngle.hook,
              suggestedAdStyle: selectedAngle.suggestedAdStyle,
              productAngleIndex: selectedIndex,
            }]
          : [],
        placements: ['feed_square', 'feed_vertical', 'story_reel'],
      })
      navigate({
        to: '/studio/$productId',
        params: { productId: productId as string },
        search: {
          adTestId: adTestId as string,
          compose: 'true',
          angle: String(selectedIndex),
          concept: String(conceptIndex),
        },
      })
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
      setCreatingKey(null)
    }
  }

  if (status === 'analyzing') {
    return (
      <Center py={64}>
        <Stack align="center" gap="sm">
          <Loader size="sm" color="brand" />
          <Text size="sm" c="dark.1" ta="center">
            Analyzing your product to recommend angles...
          </Text>
        </Stack>
      </Center>
    )
  }

  if (status === 'failed') {
    return (
      <Alert
        color="red"
        variant="light"
        title="Product analysis failed"
        icon={<IconAlertTriangle size={16} />}
      >
        Retry analysis from the Overview tab to generate recommended angles.
      </Alert>
    )
  }

  if (angles.length === 0) {
    return (
      <Center py={64}>
        <Text size="sm" c="dark.1" ta="center">
          No recommended angles yet. Re-run product analysis to generate them.
        </Text>
      </Center>
    )
  }

  return (
    <Stack gap="lg">
      {valueProposition && (
        <Box>
          <Text size="xs" tt="uppercase" fw={700} c="dark.2" mb={6}>
            Product promise
          </Text>
          <Text size="sm" c="dark.0" maw={760} lh={1.6}>
            {valueProposition}
          </Text>
        </Box>
      )}

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
        {angles.map((angle, index) => {
          const selected = index === selectedIndex
          return (
            <UnstyledButton
              key={`${angle.title}-${index}`}
              onClick={() => setSelectedIndex(index)}
              style={{ height: '100%' }}
            >
              <Paper
                withBorder
                radius="md"
                p="md"
                h="100%"
                style={{
                  background: selected
                    ? 'rgba(84, 116, 180, 0.16)'
                    : 'rgba(255, 255, 255, 0.025)',
                  borderColor: selected
                    ? 'var(--mantine-color-brand-5)'
                    : 'var(--mantine-color-dark-5)',
                  transition: 'border-color 120ms ease, background-color 120ms ease',
                }}
              >
                <Stack gap="sm">
                  <Group gap={6}>
                    {angle.angleType && (
                      <Badge size="xs" variant="light" color="grape" radius="sm">
                        {angleTypeLabel(angle.angleType)}
                      </Badge>
                    )}
                    {angle.suggestedAdStyle && (
                      <Badge size="xs" variant="outline" color="gray" radius="sm">
                        {angle.suggestedAdStyle}
                      </Badge>
                    )}
                  </Group>

                  <Box>
                    <Text size="xs" tt="uppercase" fw={700} c="dark.3" mb={4}>
                      Angle
                    </Text>
                    <Text size="sm" fw={800} c="white" lh={1.35}>
                      {angle.title}
                    </Text>
                  </Box>

                  <Box>
                    <Text size="xs" tt="uppercase" fw={700} c="dark.3" mb={4}>
                      Insight
                    </Text>
                    <Text size="sm" c="dark.1" lh={1.5}>
                      {angle.description}
                    </Text>
                  </Box>
                </Stack>
              </Paper>
            </UnstyledButton>
          )
        })}
      </SimpleGrid>

      {selectedAngle && (
        <Paper
          withBorder
          radius="md"
          p={isMobile ? 'md' : 'lg'}
          style={{
            background: 'rgba(0, 0, 0, 0.16)',
            borderColor: 'var(--mantine-color-dark-5)',
          }}
        >
          <Stack gap="md">
            <Group justify="space-between" align="flex-start" gap="md">
              <Box>
                <Text size="xs" tt="uppercase" fw={700} c="dark.2" mb={4}>
                  Creative concepts for this angle
                </Text>
                <Title order={3} fz={isMobile ? 18 : 22} c="white">
                  {selectedAngle.title}
                </Title>
              </Box>
              <Badge variant="light" color="brand" radius="sm">
                3 concepts
              </Badge>
            </Group>

            {selectedAngle.hook && (
              <Box
                p="sm"
                style={{
                  borderRadius: 8,
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--mantine-color-dark-6)',
                }}
              >
                <Text size="xs" tt="uppercase" fw={700} c="dark.3" mb={4}>
                  Hook
                </Text>
                <Text size="sm" c="dark.0" fs="italic">
                  "{selectedAngle.hook}"
                </Text>
              </Box>
            )}

            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
              {concepts.map((concept, index) => (
                <Paper
                  key={concept.title}
                  withBorder
                  radius="md"
                  p="md"
                  style={{
                    background: 'rgba(255, 255, 255, 0.025)',
                    borderColor: 'var(--mantine-color-dark-6)',
                  }}
                >
                  <Stack gap="sm">
                    <Badge size="xs" variant="light" color="dark" radius="sm" w="fit-content">
                      Concept {index + 1}
                    </Badge>
                    <Text size="sm" fw={800} c="white">
                      {concept.title}
                    </Text>
                    <Text size="xs" c="brand.2" fw={700}>
                      {concept.format}
                    </Text>
                    <Text size="sm" c="dark.1" lh={1.55}>
                      {concept.idea}
                    </Text>
                    <Box>
                      <Text size="xs" tt="uppercase" fw={700} c="dark.3" mb={4}>
                        Opening frame
                      </Text>
                      <Text size="xs" c="dark.0" lh={1.45}>
                        {concept.opening}
                      </Text>
                    </Box>
	                    <Button
	                      size="xs"
	                      mt="auto"
	                      color="brand"
	                      variant="light"
	                      leftSection={<IconLayoutGrid size={13} />}
	                      disabled={creditsExhausted}
	                      loading={creatingKey === `${selectedIndex}-${index}`}
	                      onClick={() => handleChooseTemplates(concept, index)}
	                    >
	                      Choose templates
	                    </Button>
                  </Stack>
                </Paper>
              ))}
            </SimpleGrid>
          </Stack>
        </Paper>
      )}
    </Stack>
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
  const navigate = useNavigate()
  const [deleteTarget, setDeleteTarget] = useState<{ imageId: Id<'productImages'>; isLast: boolean } | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [oocOpen, setOocOpen] = useState(false)

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
      if (err instanceof ConvexError && (err.data as { code?: string })?.code === 'CREDITS_EXHAUSTED') {
        setOocOpen(true)
      } else {
        notifications.show({
          title: 'Error',
          message: err instanceof Error ? err.message : 'Failed to start',
          color: 'red',
        })
      }
    }
  }

  async function handleSetPrimary(imageId: Id<'productImages'>) {
    try {
      await setPrimaryMutation.mutateAsync({ productId, imageId })
      notifications.show({ title: 'Success', message: 'Primary image updated', color: 'green' })
    } catch (err) {
      if (err instanceof ConvexError && (err.data as { code?: string })?.code === 'CREDITS_EXHAUSTED') {
        setOocOpen(true)
      } else {
        const info = mapGenerationError(err)
        notifications.show({
          title: info.title,
          message: info.message,
          color: 'red',
        })
      }
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
      // In-app navigation back to the dashboard (avoids a full page reload).
      navigate({ to: '/home' })
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
    <>
    <OutOfCreditsModal opened={oocOpen} onClose={() => setOocOpen(false)} />
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
          width: '100%',
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
    </>
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
              <Loader size="md" color="brand" type="dots" mb="xs" />
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
  prefillConceptIndex,
  prefillEditAdId,
  adTestId,
}: {
  productId: Id<'products'>
  product: {
    name: string
    primaryImageId?: Id<'productImages'>
    brandKitId?: Id<'brandKits'>
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
  prefillConceptIndex?: number | null
  prefillEditAdId?: Id<'templateGenerations'> | null
  /** When set, generated creatives attach to this Ad Test (template path). */
  adTestId?: Id<'adTests'> | null
}) {
  // ── Segment state ──────────────────────────────────────────────────────────
  // Default to Template — picking from the curated library is the recommended
  // path for most users; Custom is for explicit "I want to write my own
  // prompt" intent. Editing an existing ad still lands in Custom (the prefill
  // effect overrides this when needed).
  const [activeSegment, setActiveSegment] = useState<WizardSegment>(
    prefillEditAdId ? 'custom' : 'template',
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
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [oocOpen, setOocOpen] = useState(false)

  // ── Brand application toggles (default on — preserves the prior behaviour
  //    where a tagged/primary brand kit was always applied to every gen) ─────
  const [applyBrand, setApplyBrand] = useState(true)
  const [applyVoice, setApplyVoice] = useState(true)
  // Resolve the brand kit that will actually be applied: the one explicitly
  // assigned to THIS product (no primary fallback — brand is a per-product
  // choice). null when the product has no brand assigned.
  const brandKits = useConvexQuery(api.brandKits.listBrandKits)
  const activeBrandKit = product.brandKitId
    ? (brandKits ?? []).find((k) => k._id === product.brandKitId) ?? null
    : null
  const hasAnyBrand = (brandKits?.length ?? 0) > 0
  const hasVoiceData =
    !!activeBrandKit?.voice || (activeBrandKit?.customerLanguage?.length ?? 0) > 0

  // ── Per-segment state (all preserved regardless of active segment) ─────────
  const [prompt, setPrompt] = useState('')
  const [pickedIds, setPickedIds] = useState<Id<'adTemplates'>[]>(
    prefillTemplateId ? [prefillTemplateId] : [],
  )
  const [selectedAngleIndex, setSelectedAngleIndex] = useState<number | null>(null)
  const [selectedConceptIndex, setSelectedConceptIndex] = useState<number | null>(
    prefillConceptIndex ?? null,
  )

  // Ensure the prefilled template ends up selected even when this wizard was
  // NOT freshly mounted — e.g. navigating from the Inspiration tab's "Generate
  // ad inspired by this" stays on /studio/$productId, so the useState
  // initializer above may not re-run. Applies once per prefill id and never
  // fights a later manual deselect.
  const appliedPrefillRef = useRef<string | null>(null)
  useEffect(() => {
    if (!prefillTemplateId) return
    if (appliedPrefillRef.current === (prefillTemplateId as string)) return
    appliedPrefillRef.current = prefillTemplateId as string
    setPickedIds((prev) =>
      prev.includes(prefillTemplateId)
        ? prev
        : [prefillTemplateId, ...prev].slice(0, 3),
    )
  }, [prefillTemplateId])

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
  const { data: prefillAd } = useQuery(
    convexQuery(
      api.templateGenerations.getAdById,
      prefillFromAdId ? { adId: prefillFromAdId } : 'skip',
    ),
  )

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
      if (prefillConceptIndex != null) {
        const conceptCount = buildCreativeConcepts(product.marketingAngles[prefillAngleIndex]).length
        setSelectedConceptIndex(
          prefillConceptIndex >= 0 && prefillConceptIndex < conceptCount
            ? prefillConceptIndex
            : null,
        )
        setActiveSegment('template')
      } else {
        setActiveSegment('custom')
        // Seed the prompt with the angle's hook (matches chip-click behavior)
        if (prompt.trim().length === 0) {
          setPrompt(product.marketingAngles[prefillAngleIndex].hook)
        }
      }
      setAnglePrefillApplied(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillAngleIndex, prefillConceptIndex, product.marketingAngles, anglePrefillApplied, prefillTemplateId, prefillFromAdId])

  // ── Source ad for "Edit with custom prompt" ───────────────────────────────
  const { data: editSourceAd } = useQuery(
    convexQuery(
      api.templateGenerations.getById,
      prefillEditAdId ? { generationId: prefillEditAdId } : 'skip',
    ),
  )

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

  // ── Template source toggle: curated library vs. the user's own customs ─────
  const [templateSource, setTemplateSource] = useState<'library' | 'mine'>('library')

  // ── The user's own custom templates (any visibility — all are valid seeds
  //    for the owner) + the inline upload flow ──────────────────────────────
  const myCustomTemplatesRaw = useConvexQuery(api.customTemplates.listMyCustomTemplates)
  const myCustomTemplates = myCustomTemplatesRaw ?? []
  const { uploadCustomTemplate, isUploading } = useCustomTemplateUpload()

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

  // Fetch the prefilled template directly so it can be pinned (already
  // selected) at the top of the picker. Without this it's invisible unless it
  // happens to be on the first loaded page — which reads as "not pre-selected"
  // even though it is. Mirrors the templates-gallery deep-link behaviour.
  const { data: prefillTemplate } = useQuery({
    ...convexQuery(api.templates.getViewableById, {
      id: (prefillTemplateId ?? undefined) as Id<'adTemplates'>,
    }),
    enabled: !!prefillTemplateId,
  })
  const pinnedPrefill =
    prefillTemplate && !templates.some((t) => t._id === prefillTemplate._id)
      ? prefillTemplate
      : null
  const displayTemplates = pinnedPrefill
    ? [pinnedPrefill, ...templates]
    : templates

  const observerRef = useRef<IntersectionObserver | null>(null)
  const loadMoreRef = useCallback(
    (node: HTMLDivElement | null) => {
      // Always disconnect the previous observer; bailing early during a
      // fetch (the prior bug) caused observation to get lost when the
      // callback identity changed mid-fetch. The fetch-in-flight guard
      // belongs INSIDE the intersection callback, not at the top.
      if (observerRef.current) observerRef.current.disconnect()
      if (!node) return
      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
            fetchNextPage()
          }
        },
        // Pre-fetch before the user reaches the actual bottom so the next
        // page is in flight while they're still seeing the current rows.
        // Reduces the "scroll into blank space" window.
        { rootMargin: '400px' },
      )
      observerRef.current.observe(node)
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

  // ── Upload-your-own → create custom template → auto-select as a seed ───────
  // The convex query is reactive, so the new row appears in "My templates" on
  // its own. We just auto-select it (respecting the max-3 cap) and toast.
  async function handleCustomTemplateUpload(file: File) {
    try {
      const newId = await uploadCustomTemplate(file, file.name)
      let selected = false
      setPickedIds((prev) => {
        if (prev.includes(newId)) {
          selected = true
          return prev
        }
        if (prev.length >= 3) return prev
        selected = true
        return [...prev, newId]
      })
      if (selected) {
        notifications.show({
          title: 'Template added',
          message: 'Your image was uploaded and selected.',
          color: 'green',
        })
      } else {
        notifications.show({
          title: 'Template uploaded',
          message: 'Added to My templates. Remove one to select it (max 3).',
          color: 'yellow',
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      notifications.show({ title: 'Upload failed', message: msg, color: 'red' })
    }
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
    const apply = () => {
      setPrompt(assembled)
      setBuilderOpen(false)
    }
    if (prompt.trim().length === 0) {
      apply()
      return
    }
    modals.openConfirmModal({
      title: 'Replace your prompt?',
      children: <Text size="sm">This will overwrite your current prompt.</Text>,
      labels: { confirm: 'Replace', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: apply,
    })
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
    const apply = () => {
      setPrompt(text)
      setSelectedAngleIndex(null)
    }
    if (prompt.trim().length === 0) {
      apply()
      return
    }
    modals.openConfirmModal({
      title: 'Replace your prompt?',
      children: <Text size="sm">This will overwrite your current prompt.</Text>,
      labels: { confirm: 'Replace', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: apply,
    })
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
  const selectedAngle =
    selectedAngleIndex !== null ? product.marketingAngles?.[selectedAngleIndex] : undefined
  const selectedConcept =
    selectedAngle && selectedConceptIndex !== null
      ? buildCreativeConcepts(selectedAngle)[selectedConceptIndex]
      : undefined
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
          model: 'nano-banana-2',
          productImageId: sourceImageId ?? undefined,
          applyBrand,
          applyVoice,
          adTestId: adTestId ?? undefined,
          angleSeed: selectedAngle
            ? {
                title: selectedAngle.title,
                description: selectedAngle.description,
                hook: selectedAngle.hook,
                suggestedAdStyle: selectedAngle.suggestedAdStyle,
              }
            : undefined,
          creativeConcept: selectedConcept,
        })
        notifications.show({
          title: 'Success',
          message: adTestId
            ? 'Generating creatives for your ad test!'
            : 'Generation started!',
          color: 'green',
        })
      } else if (usePromptPath) {
        await submitPromptMutation({
          productId,
          prompt: prompt.trim(),
          aspectRatio,
          count: variationsCount,
          model: 'nano-banana-2',
          productImageId: includeSourceImage && !prefillEditAdId ? (sourceImageId ?? undefined) : undefined,
          sourceAdId: includeSourceImage && prefillEditAdId ? prefillEditAdId : undefined,
          useSourceImage: includeSourceImage,
          applyBrand,
          applyVoice,
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
          model: 'nano-banana-2',
          productImageId: sourceImageId ?? undefined,
          applyBrand,
          applyVoice,
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
      if (err instanceof ConvexError && (err.data as { code?: string })?.code === 'CREDITS_EXHAUSTED') {
        setOocOpen(true)
      } else {
        const info = mapGenerationError(err)
        notifications.show({
          title: info.title,
          message: info.action ? (
            <>{info.message}{' '}<Anchor href={info.action.href} size="sm" fw={600}>{info.action.label} →</Anchor></>
          ) : info.message,
          color: 'red',
          autoClose: 8000,
        })
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Helper: get generate button label ──────────────────────────────────────
  function getGenerateLabel(): string {
    if (isSubmitting) return 'Starting...'
    if (!canGenerate) return 'Generate'
    const cost = totalCount * 10
    return `Generate ${totalCount} Image${totalCount !== 1 ? 's' : ''} — ${cost} credits`
  }

  // ── Marketing angles surfaced as chips inside the Custom segment ──────────
  const angles = product.marketingAngles ?? []

  return (
    <>
    <OutOfCreditsModal opened={oocOpen} onClose={() => setOocOpen(false)} />
    <Box>
      {/* Wizard Header */}
      <Group
        justify="space-between"
        mb="md"
        py="sm"
        px="md"
        wrap="wrap"
        gap="xs"
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
          <Text fw={600} size="lg" c="white">
            {adTestId ? 'Generate creatives' : 'Create ad'}
          </Text>
        </Group>
        <Group gap="xs" wrap="wrap">
          {hasTemplates && (
            <Badge size="sm" variant="light" color="brand" radius="md">
              {pickedIds.length}/3 templates
            </Badge>
          )}
          {hasPrompt && (
            <Badge size="sm" variant="light" color="grape" radius="md">
              Prompt ({prompt.trim().length} chars)
            </Badge>
          )}
          {hasAngle && !hasPrompt && (
            <Badge size="sm" variant="light" color="teal" radius="md">
              {angles[selectedAngleIndex!]?.title ?? 'Angle'}
            </Badge>
          )}
        </Group>
      </Group>

      {selectedAngle && (
        <Box px="md" mb="md">
          <Paper
            p="sm"
            radius="md"
            bg="dark.7"
            style={{ border: '1px solid var(--mantine-color-brand-7)' }}
          >
            <Group justify="space-between" align="flex-start" gap="sm" wrap="nowrap">
              <Group gap="sm" align="flex-start" wrap="nowrap" style={{ minWidth: 0 }}>
                <ThemeIcon variant="light" color="brand" radius="xl" size="md">
                  <IconTarget size={16} />
                </ThemeIcon>
                <Box style={{ minWidth: 0 }}>
                  <Text size="xs" fw={700} c="brand.3" tt="uppercase">
                    Using recommended strategy
                  </Text>
                  <Text size="sm" fw={700} c="white" lineClamp={1}>
                    {selectedAngle.title}
                  </Text>
                  {selectedConcept && (
                    <Text size="xs" c="dark.1" lineClamp={2}>
                      Concept: {selectedConcept.title} - {selectedConcept.idea}
                    </Text>
                  )}
                </Box>
              </Group>
              <Button
                size="xs"
                variant="subtle"
                color="gray"
                onClick={() => {
                  setSelectedAngleIndex(null)
                  setSelectedConceptIndex(null)
                }}
              >
                Clear
              </Button>
            </Group>
          </Paper>
        </Box>
      )}

      {/* Segmented control — hidden when editing an existing ad, and when
          generating into an ad test (template-only path). */}
      {!prefillEditAdId && !adTestId && (
        <Box px="md" mb="lg">
          <SegmentedControl
            value={activeSegment}
            onChange={(val) => setActiveSegment(val as WizardSegment)}
            data={[
              { value: 'template', label: 'Template' },
              { value: 'custom', label: 'Custom' },
            ]}
            color="brand"
            fullWidth={!!isMobile}
          />
        </Box>
      )}

      <Box style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) 360px',
        gap: 'var(--mantine-spacing-md)',
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
                            setSelectedConceptIndex(null)
                          } else {
                            setSelectedAngleIndex(idx)
                            setSelectedConceptIndex(null)
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
                        setSelectedConceptIndex(null)
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
              {/* Source toggle: curated library vs. the user's own customs */}
              <SegmentedControl
                value={templateSource}
                onChange={(v) => setTemplateSource(v as 'library' | 'mine')}
                data={[
                  { value: 'library', label: 'Library' },
                  {
                    value: 'mine',
                    label: `My templates${myCustomTemplates.length > 0 ? ` (${myCustomTemplates.length})` : ''}`,
                  },
                ]}
                size="sm"
                radius="xl"
                mb="md"
                fullWidth={isMobile}
              />

            {templateSource === 'mine' ? (
              <Box>
                {pickedIds.length > 0 && (
                  <Group justify="flex-end" mb="sm">
                    <Button
                      variant="subtle"
                      size="sm"
                      color="red"
                      leftSection={<IconX size={14} />}
                      onClick={() => setPickedIds([])}
                    >
                      Clear selection ({pickedIds.length})
                    </Button>
                  </Group>
                )}
                <Box
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile
                      ? 'repeat(2, 1fr)'
                      : 'repeat(auto-fill, minmax(180px, 1fr))',
                    gap: 8,
                  }}
                >
                  {/* Upload-your-own tile */}
                  <Dropzone
                    onDrop={(files) => {
                      if (files[0]) void handleCustomTemplateUpload(files[0])
                    }}
                    accept={IMAGE_MIME_TYPE}
                    multiple={false}
                    maxSize={MAX_TEMPLATE_IMAGE_SIZE}
                    loading={isUploading}
                    radius="sm"
                    style={{
                      aspectRatio: '1/1',
                      border: '1px dashed var(--mantine-color-dark-4)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Stack gap={4} align="center" justify="center" style={{ pointerEvents: 'none' }}>
                      <ThemeIcon variant="light" color="brand" radius="xl" size="lg">
                        <IconUpload size={18} />
                      </ThemeIcon>
                      <Text size="xs" c="dark.1" ta="center" fw={600}>
                        Upload your own
                      </Text>
                      <Text size="xs" c="dark.3" ta="center">
                        PNG / JPG, up to 20 MB
                      </Text>
                    </Stack>
                  </Dropzone>

                  {myCustomTemplates.map((tpl) => {
                    const picked = pickedIds.includes(tpl._id)
                    const aspectRatio =
                      tpl.aspectRatio === '4:5'
                        ? '4/5'
                        : tpl.aspectRatio === '9:16'
                          ? '9/16'
                          : '1/1'
                    const visibility = tpl.visibility ?? 'private'
                    const visColor =
                      visibility === 'public'
                        ? 'teal'
                        : visibility === 'pending'
                          ? 'yellow'
                          : 'gray'
                    const visLabel =
                      visibility.charAt(0).toUpperCase() + visibility.slice(1)
                    return (
                      <UnstyledButton
                        key={tpl._id}
                        onClick={() => toggleTemplate(tpl._id)}
                        w="100%"
                        className="template-card-selectable"
                        data-testid={`my-template-card-${tpl._id}`}
                        aria-pressed={picked}
                        aria-label={`Select your template: ${tpl.name}`}
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
                          <Image
                            src={tpl.thumbnailUrl ?? tpl.imageUrl}
                            alt={`Template: ${tpl.name}`}
                            fit="cover"
                            h="100%"
                            w="100%"
                          />
                        </Box>
                        <Badge
                          size="xs"
                          variant="filled"
                          color={visColor}
                          pos="absolute"
                          bottom={6}
                          left={6}
                          style={{ opacity: 0.85 }}
                        >
                          {visLabel}
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
                {myCustomTemplates.length === 0 && (
                  <Text c="dark.2" ta="center" pt="md" size="sm">
                    No custom templates yet — upload one above to get started.
                  </Text>
                )}
              </Box>
            ) : (
            <>
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

              {templatesLoading && displayTemplates.length === 0 ? (
                <Box style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile
                    ? 'repeat(2, 1fr)'
                    : 'repeat(auto-fill, minmax(180px, 1fr))',
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
              ) : displayTemplates.length === 0 ? (
                <Text c="dark.2" ta="center" py={48}>No templates available.</Text>
              ) : (
                <>
                  {/* CSS-columns masonry: non-virtualized, reliable for the
                      ~100-200 template scale. Replaces masonic, which was
                      not rendering newly-fetched cells reliably. */}
                  <Box
                    style={{
                      // CSS columns "as many 180px+ columns as fit". Gives
                      // 5 cols at ~960px main column, 6 at ~1080px, 7+ on
                      // wide displays — denser than the previous fixed 4.
                      columnWidth: isMobile ? 'auto' : 180,
                      columnCount: isMobile ? 2 : undefined,
                      columnGap: 1,
                    }}
                  >
                    {displayTemplates.map((tpl) => {
                      const picked = pickedIds.includes(tpl._id)
                      const aspectRatio =
                        tpl.aspectRatio === '4:5'
                          ? '4/5'
                          : tpl.aspectRatio === '9:16'
                            ? '9/16'
                            : '1/1'
                      return (
                        <UnstyledButton
                          key={tpl._id}
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
                            marginBottom: 1,
                            breakInside: 'avoid',
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
            position: isMobile ? 'relative' : 'fixed',
            top: isMobile ? undefined : 'var(--mantine-spacing-sm)',
            right: isMobile ? undefined : 'var(--mantine-spacing-lg)',
            order: isMobile ? 1 : 2,
            width: isMobile ? undefined : 360,
            height: isMobile
              ? undefined
              : 'calc(100dvh - var(--mantine-spacing-sm) - var(--mantine-spacing-sm))',
            maxHeight: isMobile
              ? undefined
              : 'calc(100dvh - var(--mantine-spacing-sm) - var(--mantine-spacing-sm))',
            display: 'flex',
            flexDirection: 'column',
            overflow: isMobile ? undefined : 'hidden',
            boxSizing: 'border-box',
            zIndex: isMobile ? undefined : 10,
          }}
        >
          <Box
            style={{
              flex: '1 1 0',
              height: isMobile ? undefined : 0,
              minHeight: 0,
              overflowY: isMobile ? 'visible' : 'auto',
              overscrollBehavior: isMobile ? undefined : 'contain',
              paddingRight: isMobile ? undefined : 4,
              marginRight: isMobile ? undefined : -4,
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
                      const tpl =
                        templates.find((t) => t._id === id) ??
                        myCustomTemplates.find((t) => t._id === id)
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

            {/* Brand application — applies the user's brand kit + voice to this run.
              Hidden when the user has no brand kit (nothing to apply), mirroring
              the BrandPicker's behaviour. */}
            {activeBrandKit && (
              <Paper mb="md" p="sm" radius="md" withBorder bg="dark.7">
              <Group justify="space-between" mb="xs" wrap="nowrap">
                <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                  {activeBrandKit.logoUrl ? (
                    <Image
                      src={activeBrandKit.logoUrl}
                      w={24}
                      h={24}
                      fit="contain"
                      radius="sm"
                      alt=""
                    />
                  ) : null}
                  <Text size="sm" fw={600} c="white" truncate>
                    {activeBrandKit.name || 'Your brand'}
                  </Text>
                </Group>
                <Anchor
                  component={Link}
                  to="/account/brand"
                  size="xs"
                  c="dark.2"
                  style={{ whiteSpace: 'nowrap' }}
                >
                  Edit
                </Anchor>
              </Group>

              <Switch
                checked={applyBrand}
                onChange={(e) => setApplyBrand(e.currentTarget.checked)}
                color="brand"
                label="Apply brand theme"
                description="Colors, fonts, tagline & current offer"
                styles={{ label: { fontWeight: 500 } }}
              />
              {applyBrand && (activeBrandKit.colors?.length ?? 0) > 0 && (
                <Group gap={6} mt={8} mb="sm" pl={44}>
                  {activeBrandKit.colors!.slice(0, 6).map((c, i) => (
                    <ColorSwatch key={`${c}-${i}`} color={c} size={16} radius="sm" withShadow={false} />
                  ))}
                </Group>
              )}

              <Switch
                mt={applyBrand && (activeBrandKit.colors?.length ?? 0) > 0 ? 0 : 'sm'}
                checked={applyVoice}
                onChange={(e) => setApplyVoice(e.currentTarget.checked)}
                color="brand"
                label="Write in your customer voice"
                description={
                  hasVoiceData
                    ? 'Brand voice & real customer phrases'
                    : 'Add a voice or customer phrases on your brand to use this'
                }
                disabled={!hasVoiceData}
                styles={{ label: { fontWeight: 500 } }}
              />
              </Paper>
            )}

            {/* Product has no brand assigned but the user has brands — explain
              why there's no brand styling and where to assign one. */}
            {!activeBrandKit && hasAnyBrand && (
              <Paper mb="md" p="sm" radius="md" withBorder bg="dark.7">
              <Group gap="xs" wrap="nowrap" align="flex-start">
                <IconTag size={14} color="var(--mantine-color-dark-2)" style={{ marginTop: 2, flexShrink: 0 }} />
                <Text size="xs" c="dark.2">
                  No brand assigned to this product — its ads won't use brand
                  colors or voice. Assign one from the product header (
                  <Anchor component="button" type="button" onClick={onBack} size="xs" c="brand.4">
                    go back
                  </Anchor>
                  ) to apply your theme.
                </Text>
              </Group>
              </Paper>
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
          </Box>

          {/* Summary & Submit */}
          <Box
            pt="md"
            mt="md"
            style={{
              borderTop: '1px solid var(--mantine-color-dark-5)',
              flexShrink: 0,
            }}
          >
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
            <Tooltip
              label="Not enough credits — buy more or upgrade"
              disabled={!creditsExhausted}
              position="top"
            >
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
            </Tooltip>
          </Box>
        </Paper>
      </Box>
    </Box>
    </>
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
      if (tplObserverRef.current) tplObserverRef.current.disconnect()
      if (!node) return
      tplObserverRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && tplHasNext && !tplFetchingNext) {
            tplFetchNext()
          }
        },
        { rootMargin: '400px' },
      )
      tplObserverRef.current.observe(node)
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
      size={isMobile ? '100%' : 'min(1100px, 92vw)'}
      fullScreen={isMobile}
      radius="md"
      title="Add inspiration"
      styles={{
        body: { padding: 'var(--mantine-spacing-md)' },
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
            <ScrollArea
              h={isMobile ? 'calc(100dvh - 200px)' : 'min(72vh, 760px)'}
              scrollbarSize={4}
            >
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
