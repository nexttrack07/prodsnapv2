import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useInfiniteQuery } from '@tanstack/react-query'
import { useConvexMutation, convexQuery } from '@convex-dev/react-query'
import { useState, useRef, useCallback, useEffect } from 'react'
import { notifications } from '@mantine/notifications'
import { useMediaQuery, useHotkeys } from '@mantine/hooks'
import { useConvex } from 'convex/react'
import {
  Container,
  Title,
  Text,
  Box,
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
} from '@mantine/core'
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
} from '@tabler/icons-react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { capitalizeWords } from '../utils/strings'

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
  aspectRatio?: string
  mode?: 'exact' | 'remix' | 'variation'
  templateSnapshot?: { name?: string; aspectRatio?: string }
}

function ProductWorkspacePage() {
  const { productId } = Route.useParams()
  const [view, setView] = useState<View>('gallery')

  const { data: product, isLoading: productLoading } = useQuery(
    convexQuery(api.products.getProductWithStats, { productId: productId as Id<'products'> }),
  )

  const { data: generations } = useQuery(
    convexQuery(api.products.getProductGenerations, { productId: productId as Id<'products'> }),
  )

  if (productLoading) {
    return (
      <Container size="lg" py={40}>
        <Box py={80} ta="center">
          <Loader size="lg" color="brand" />
        </Box>
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

  return (
    <Container size="lg" py={40}>
      {/* Breadcrumb */}
      <Box mb="md">
        <Anchor component={Link} to="/studio" size="sm" c="dark.2">
          <Group gap={4}>
            <IconChevronLeft size={16} />
            Back to products
          </Group>
        </Anchor>
      </Box>

      {/* Product Header - hidden in generate mode */}
      {view === 'gallery' && <ProductHeader product={product} />}

      {/* View Toggle */}
      {view === 'gallery' ? (
        <GalleryView
          product={product}
          productId={productId as Id<'products'>}
          completedGenerations={completedGenerations}
          pendingGenerations={pendingGenerations}
          onGenerateMore={() => setView('generate')}
        />
      ) : (
        <GenerateWizard
          productId={productId as Id<'products'>}
          product={product}
          onBack={() => setView('gallery')}
          onComplete={() => setView('gallery')}
        />
      )}
    </Container>
  )
}

function ProductHeader({
  product,
}: {
  product: {
    _id: Id<'products'>
    name: string
    imageUrl: string
    status: 'analyzing' | 'ready' | 'failed'
    category?: string
    productDescription?: string
    generationCount: number
  }
}) {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [isEditingName, setIsEditingName] = useState(false)
  const [editedName, setEditedName] = useState('')

  const updateProduct = useConvexMutation(api.products.updateProduct)
  const updateMutation = useMutation({ mutationFn: updateProduct })

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

  const imageSize = isMobile ? 80 : 120

  return (
    <Paper
      radius="lg"
      p={isMobile ? 'md' : 'xl'}
      mb="xl"
      style={{
        background: 'linear-gradient(135deg, rgba(84, 116, 180, 0.08) 0%, rgba(0, 0, 0, 0) 60%)',
        border: '1px solid var(--mantine-color-dark-6)',
      }}
    >
      <Group align="flex-start" gap={isMobile ? 'md' : 'xl'} wrap={isMobile ? 'wrap' : 'nowrap'}>
        <Box
          w={imageSize}
          h={imageSize}
          style={{
            borderRadius: 'var(--mantine-radius-lg)',
            overflow: 'hidden',
            flexShrink: 0,
            border: '1px solid var(--mantine-color-dark-5)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          }}
          bg="dark.7"
        >
          <Image src={product.imageUrl} alt={product.name} fit="cover" h="100%" w="100%" />
        </Box>
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
              <Button size="xs" variant="subtle" color="gray" onClick={() => setIsEditingName(false)}>
                Cancel
              </Button>
            </Group>
          ) : (
            <Title
              order={1}
              fz={isMobile ? 20 : 28}
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
          <Group gap="sm" mt="sm">
            {product.category && (
              <Badge size="sm" variant="light" color="brand" radius="sm">
                {product.category}
              </Badge>
            )}
            <Badge size="sm" variant="outline" color="gray" radius="sm">
              {product.generationCount} {product.generationCount === 1 ? 'generation' : 'generations'}
            </Badge>
            <StatusBadge status={product.status} />
          </Group>
          {product.productDescription && (
            <Text size="sm" c="dark.1" mt="md" lh={1.6} maw={600}>
              {product.productDescription}
            </Text>
          )}
        </Box>
      </Group>
    </Paper>
  )
}

function GalleryView({
  product,
  productId,
  completedGenerations,
  pendingGenerations,
  onGenerateMore,
}: {
  product: { status: string; imageUrl: string; name: string }
  productId: Id<'products'>
  completedGenerations: Array<{
    _id: Id<'templateGenerations'>
    status: string
    outputUrl?: string
    currentStep?: string
    error?: string
    aspectRatio?: string
  }>
  pendingGenerations: Array<{
    _id: Id<'templateGenerations'>
    status: string
    outputUrl?: string
    currentStep?: string
    error?: string
    aspectRatio?: string
  }>
  onGenerateMore: () => void
}) {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [variationTarget, setVariationTarget] = useState<{ _id: Id<'templateGenerations'>; outputUrl: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Id<'templateGenerations'> | null>(null)
  const hasAny = completedGenerations.length > 0 || pendingGenerations.length > 0

  // Keyboard shortcuts
  useHotkeys([
    ['Escape', () => {
      if (lightboxUrl) setLightboxUrl(null)
      else if (variationTarget) setVariationTarget(null)
      else if (deleteTarget) setDeleteTarget(null)
    }],
  ])

  const deleteGeneration = useConvexMutation(api.products.deleteGeneration)
  const deleteMutation = useMutation({ mutationFn: deleteGeneration })

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

  return (
    <Box>
      {/* Action bar */}
      <Group justify="space-between" mb="lg">
        <Box>
          <Title order={2} fz="xl" fw={600} c="white" mb={4}>Generations</Title>
          <Text size="sm" c="dark.2">Your AI-generated ad variations</Text>
        </Box>
        <Tooltip
          label={product.status === 'analyzing' ? 'Product is still being analyzed...' : 'Product analysis failed'}
          disabled={product.status === 'ready'}
          withArrow
          position="bottom"
        >
          <span>
            <Button
              onClick={onGenerateMore}
              disabled={product.status !== 'ready'}
              color="brand"
              size="md"
              rightSection={<IconArrowRight size={16} />}
              styles={{
                root: {
                  boxShadow: '0 4px 14px rgba(84, 116, 180, 0.25)',
                },
              }}
            >
              Generate More
            </Button>
          </span>
        </Tooltip>
      </Group>

      {/* Pending generations */}
      {pendingGenerations.length > 0 && (
        <Box mb="xl">
          <Text size="sm" fw={500} c="dark.2" mb="sm">In Progress</Text>
          <Box style={{
            columnCount: isMobile ? 2 : 4,
            columnGap: '1rem',
          }}>
            {pendingGenerations.map((gen, index) => (
              <GenerationCard
                key={gen._id}
                generation={gen}
                title={`${product.name} #${completedGenerations.length + index + 1}`}
                onExpand={setLightboxUrl}
                onDelete={handleDelete}
                onCreateVariations={setVariationTarget}
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
          <IconSparkles size={48} style={{ color: 'var(--mantine-color-brand-5)', marginBottom: 16 }} />
          <Title order={3} fz="lg" fw={600} c="white" mb={8}>No generations yet</Title>
          <Text c="dark.2" mb="xl" maw={400} mx="auto">
            Create stunning ad variations from your product photo. Pick templates and let AI do the magic.
          </Text>
          <Button
            onClick={onGenerateMore}
            disabled={product.status !== 'ready'}
            color="brand"
            size="md"
            rightSection={<IconArrowRight size={16} />}
            styles={{
              root: {
                boxShadow: '0 4px 14px rgba(84, 116, 180, 0.25)',
              },
            }}
          >
            Generate Ads
          </Button>
        </Paper>
      ) : completedGenerations.length > 0 ? (
        <Box style={{
          columnCount: isMobile ? 2 : 4,
          columnGap: '1rem',
        }}>
          {completedGenerations.map((gen, index) => (
            <GenerationCard
              key={gen._id}
              generation={gen}
              title={`${product.name} #${index + 1}`}
              onExpand={setLightboxUrl}
              onDelete={handleDelete}
              onCreateVariations={setVariationTarget}
            />
          ))}
        </Box>
      ) : null}

      {/* Lightbox Modal */}
      <Modal
        opened={!!lightboxUrl}
        onClose={() => setLightboxUrl(null)}
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
          onClick={() => setLightboxUrl(null)}
          aria-label="Close image viewer"
        />
        {lightboxUrl && (
          <Image
            src={lightboxUrl}
            alt="Full size generated ad image"
            fit="contain"
            maw="90vw"
            mah="90vh"
          />
        )}
      </Modal>

      {/* Variation Drawer */}
      <VariationDrawer
        opened={!!variationTarget}
        onClose={() => setVariationTarget(null)}
        generation={variationTarget}
        productId={productId}
        productImageUrl={product.imageUrl}
        onComplete={() => setVariationTarget(null)}
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
}: {
  opened: boolean
  onClose: () => void
  generation: { _id: Id<'templateGenerations'>; outputUrl: string } | null
  productId: Id<'products'>
  productImageUrl: string
  onComplete: () => void
}) {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [changeText, setChangeText] = useState(false)
  const [changeIcons, setChangeIcons] = useState(false)
  const [changeColors, setChangeColors] = useState(false)
  const [variationCount, setVariationCount] = useState('2')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Reset state when drawer opens
  useEffect(() => {
    if (opened) {
      setChangeText(false)
      setChangeIcons(false)
      setChangeColors(false)
      setVariationCount('2')
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
      })
      notifications.show({ title: 'Success', message: 'Variations started!', color: 'green' })
      onComplete()
    } catch (err) {
      notifications.show({ title: 'Error', message: err instanceof Error ? err.message : 'Failed to start', color: 'red' })
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
                    border: `2px solid ${changeText ? 'var(--mantine-color-dark-9)' : 'var(--mantine-color-dark-5)'}`,
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
                    border: `2px solid ${changeIcons ? 'var(--mantine-color-dark-9)' : 'var(--mantine-color-dark-5)'}`,
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
                    border: `2px solid ${changeColors ? 'var(--mantine-color-dark-9)' : 'var(--mantine-color-dark-5)'}`,
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

          {/* Generate button */}
          <Button
            fullWidth
            size="md"
            color="brand"
            onClick={handleGenerate}
            disabled={!hasSelection}
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
}: {
  generation: GenerationData
  title: string
  onExpand: (url: string) => void
  onDelete: (id: Id<'templateGenerations'>) => void
  onCreateVariations: (generation: { _id: Id<'templateGenerations'>; outputUrl: string }) => void
}) {
  const isComplete = generation.status === 'complete' && generation.outputUrl
  const isFailed = generation.status === 'failed'
  const isPending = !isComplete && !isFailed

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
      default: return mode
    }
  }

  const getModeColor = (mode: string): string => {
    switch (mode) {
      case 'variation': return 'violet'
      case 'remix': return 'orange'
      default: return 'teal'
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
            onClick={() => onExpand(generation.outputUrl!)}
          >
            <Image
              src={generation.outputUrl}
              alt="Generated ad"
              style={{ display: 'block' }}
            />
          </Box>
        )}

        {isPending && (
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
              <Text size="sm" fw={500} c="red.5">Failed</Text>
              {generation.error && (
                <Text size="xs" c="red.4" mt={4} px="xs" ta="center" lineClamp={2}>{generation.error}</Text>
              )}
            </Box>
          </AspectRatio>
        )}
      </Card.Section>

      {/* Title Row */}
      <Group justify="space-between" mt="md" mx="md" align="center">
        <Text fw={500} fz="sm" c="white" lineClamp={1}>
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
            component="a"
            href={generation.outputUrl}
            download
            variant="light"
            color="gray"
            size="xs"
            radius="md"
            leftSection={<IconDownload size={14} />}
            onClick={(e) => e.stopPropagation()}
          >
            Save
          </Button>
          <ActionIcon
            variant="subtle"
            color="red"
            size="md"
            radius="md"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(generation._id)
            }}
            title="Delete"
            aria-label="Delete generation"
          >
            <IconTrash size={16} />
          </ActionIcon>
        </Group>
      )}

      {/* Show minimal footer for pending/failed */}
      {!isComplete && (
        <Box mt="md" mb="md" mx="md">
          <Text fz="xs" c="dimmed">
            {formatDate(generation._creationTime || Date.now())}
          </Text>
        </Box>
      )}
    </Card>
  )
}

function GenerateWizard({
  productId,
  product,
  onBack,
  onComplete,
}: {
  productId: Id<'products'>
  product: { imageUrl: string; name: string }
  onBack: () => void
  onComplete: () => void
}) {
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1')
  const [mode, setMode] = useState<Mode>('exact')
  const [colorAdapt, setColorAdapt] = useState(false)
  const [variationsPerTemplate, setVariationsPerTemplate] = useState('2')
  const [pickedIds, setPickedIds] = useState<Id<'adTemplates'>[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Mobile detection for responsive layout
  const isMobile = useMediaQuery('(max-width: 768px)')

  const convex = useConvex()
  const generateFromProduct = useConvexMutation(api.products.generateFromProduct)
  const generateMutation = useMutation({ mutationFn: generateFromProduct })

  const {
    data: templatesData,
    isLoading: templatesLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['listTemplates'],
    queryFn: async ({ pageParam }) => {
      return convex.query(api.products.listTemplates, {
        cursor: pageParam,
        limit: 24,
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
      })
      notifications.show({ title: 'Success', message: 'Generation started!', color: 'green' })
      onComplete()
    } catch (err) {
      notifications.show({ title: 'Error', message: err instanceof Error ? err.message : 'Generation failed', color: 'red' })
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
          {/* Placeholder for future filters */}
          <Badge size="md" variant="light" color="brand" radius="md">
            {pickedIds.length}/3 selected
          </Badge>
        </Group>
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
              display: 'grid',
              gridTemplateColumns: `repeat(${isMobile ? 2 : 4}, 1fr)`,
              gap: '0.75rem',
              alignItems: 'start',
            }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <Box
                  key={i}
                  className="shimmer"
                  style={{
                    borderRadius: 'var(--mantine-radius-lg)',
                    aspectRatio: i % 3 === 0 ? '4/5' : i % 3 === 1 ? '9/16' : '1/1',
                  }}
                />
              ))}
            </Box>
          ) : templates.length === 0 ? (
            <Text c="dark.2" ta="center" py={48}>No templates available.</Text>
          ) : (
            <>
              <Box style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${isMobile ? 2 : 4}, 1fr)`,
                gap: '0.75rem',
                alignItems: 'start',
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
                      mb="md"
                      style={{
                        borderRadius: 'var(--mantine-radius-lg)',
                        overflow: 'hidden',
                        border: `2px solid ${picked ? 'var(--mantine-color-brand-5)' : 'var(--mantine-color-dark-5)'}`,
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
              <Image src={product.imageUrl} alt={product.name} w={40} h={40} radius="sm" fit="cover" style={{ border: '1px solid var(--mantine-color-dark-5)' }} />
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
              onClick={handleGenerate}
              disabled={pickedIds.length === 0}
              loading={isSubmitting}
              styles={{
                root: {
                  boxShadow: pickedIds.length > 0 ? '0 4px 14px rgba(84, 116, 180, 0.3)' : 'none',
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
  const colorMap = {
    analyzing: 'yellow',
    ready: 'teal',
    failed: 'red',
  }
  return (
    <Badge size="sm" variant="light" color={colorMap[status]} tt="capitalize">
      {status}
    </Badge>
  )
}
