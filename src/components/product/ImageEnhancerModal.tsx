/**
 * Expanded source-image viewer with action sidebar. Triggered when the user
 * clicks a source image tile in the product card. Inspired by Creatify's
 * image-detail view: large preview on the left, contextual actions stacked
 * on the right, ESC / X to close.
 */
import { useState } from 'react'
import {
  Badge,
  Box,
  Button,
  Center,
  Group,
  Image,
  Loader,
  Modal,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core'
import { useMutation } from '@tanstack/react-query'
import { useConvexMutation } from '@convex-dev/react-query'
import { notifications } from '@mantine/notifications'
import { modals } from '@mantine/modals'
import { useMediaQuery } from '@mantine/hooks'
import {
  IconDownload,
  IconStar,
  IconStarFilled,
  IconTrash,
  IconWand,
  IconArrowsMaximize,
  IconBulb,
  IconPalette,
} from '@tabler/icons-react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { fetchDownloadAsset } from '../../utils/downloads'

export type ImageEnhancerImage = {
  _id: Id<'productImages'>
  imageUrl: string
  type: 'original' | 'background-removed'
  status: 'processing' | 'ready' | 'failed'
  parentImageId?: Id<'productImages'>
  error?: string
  _creationTime?: number
}

export type ImageEnhancerModalProps = {
  opened: boolean
  onClose: () => void
  image: ImageEnhancerImage | null
  productId: Id<'products'>
  productName: string
  isPrimary: boolean
  /** Total number of original-type images for this product (deletion safety) */
  originalCount: number
}

export function ImageEnhancerModal({
  opened,
  onClose,
  image,
  productId,
  productName,
  isPrimary,
  originalCount,
}: ImageEnhancerModalProps) {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [downloading, setDownloading] = useState(false)

  const setPrimary = useConvexMutation(api.productImages.setPrimaryImage)
  const setPrimaryMutation = useMutation({ mutationFn: setPrimary })

  const removeBackground = useConvexMutation(api.productImages.removeImageBackground)
  const removeBgMutation = useMutation({ mutationFn: removeBackground })

  const deleteImage = useConvexMutation(api.productImages.deleteProductImage)
  const deleteMutation = useMutation({ mutationFn: deleteImage })

  if (!image) return null

  const isOriginal = image.type === 'original'
  const isProcessing = image.status === 'processing'
  const isFailed = image.status === 'failed'
  const blocksActions = isProcessing || isFailed

  async function handleDownload() {
    if (!image) return
    setDownloading(true)
    try {
      const { base64, contentType } = await fetchDownloadAsset({
        data: { url: image.imageUrl },
      })
      const binary = atob(base64)
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
      const blob = new Blob([bytes], {
        type: contentType || 'application/octet-stream',
      })
      const ext = (contentType?.split('/')[1] ?? 'png').split('+')[0]
      const filename = `${productName.replace(/\s+/g, '-')}-${image.type}.${ext}`
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    } catch (err) {
      notifications.show({
        title: 'Download failed',
        message: err instanceof Error ? err.message : 'Try again',
        color: 'red',
      })
    } finally {
      setDownloading(false)
    }
  }

  async function handleSetPrimary() {
    if (!image || isPrimary) return
    try {
      await setPrimaryMutation.mutateAsync({
        productId,
        imageId: image._id,
      })
      notifications.show({
        title: 'Primary image updated',
        message: 'New ads will use this image.',
        color: 'green',
      })
    } catch (err) {
      notifications.show({
        title: 'Could not update',
        message: err instanceof Error ? err.message : 'Try again',
        color: 'red',
      })
    }
  }

  async function handleRemoveBackground() {
    if (!image) return
    try {
      await removeBgMutation.mutateAsync({ imageId: image._id })
      notifications.show({
        title: 'Removing background',
        message: "This usually takes ~10s. We'll show the result when it's ready.",
        color: 'blue',
      })
      onClose()
    } catch (err) {
      notifications.show({
        title: 'Could not start',
        message: err instanceof Error ? err.message : 'Try again',
        color: 'red',
      })
    }
  }

  async function handleDelete() {
    if (!image) return
    if (isOriginal && originalCount <= 1) {
      notifications.show({
        title: 'Cannot delete',
        message: 'A product needs at least one source image.',
        color: 'orange',
      })
      return
    }
    modals.openConfirmModal({
      title: 'Delete this image?',
      children: <Text size="sm">This cannot be undone.</Text>,
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await deleteMutation.mutateAsync({ imageId: image._id })
          notifications.show({ title: 'Deleted', message: 'Image removed.', color: 'green' })
          onClose()
        } catch (err) {
          notifications.show({
            title: 'Delete failed',
            message: err instanceof Error ? err.message : 'Try again',
            color: 'red',
          })
        }
      },
    })
  }

  // Shared sidebar content (header + actions + enhance buttons)
  const sidebarContent = (
    <>
      <Stack gap={4}>
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Box>
            <Text size="xs" tt="uppercase" fw={700} c="dark.2">
              Source image
            </Text>
            <Text fw={600} c="white" size="sm" mt={2}>
              {productName}
            </Text>
          </Box>
          <Tooltip label="Close (Esc)">
            <Button
              variant="subtle"
              color="gray"
              size="compact-sm"
              onClick={onClose}
              px={8}
            >
              ✕
            </Button>
          </Tooltip>
        </Group>
        <Group gap={6} mt={6}>
          <Badge size="xs" variant="light" color="gray" radius="sm">
            {image.type === 'original' ? 'Original' : 'Background removed'}
          </Badge>
          {isPrimary && (
            <Badge size="xs" variant="light" color="brand" radius="sm">
              Primary
            </Badge>
          )}
        </Group>
      </Stack>

      <Stack gap={6}>
        <Text size="xs" tt="uppercase" fw={700} c="dark.2">
          Actions
        </Text>
        <Button
          variant="default"
          leftSection={<IconDownload size={14} />}
          onClick={handleDownload}
          loading={downloading}
          disabled={blocksActions}
          fullWidth
          justify="flex-start"
        >
          Download
        </Button>
        <Button
          variant="default"
          leftSection={
            isPrimary ? (
              <IconStarFilled size={14} color="var(--mantine-color-brand-5)" />
            ) : (
              <IconStar size={14} />
            )
          }
          onClick={handleSetPrimary}
          disabled={isPrimary || blocksActions}
          loading={setPrimaryMutation.isPending}
          fullWidth
          justify="flex-start"
        >
          {isPrimary ? 'Already primary' : 'Set as primary'}
        </Button>
        <Button
          variant="default"
          color="red"
          leftSection={<IconTrash size={14} />}
          onClick={handleDelete}
          loading={deleteMutation.isPending}
          fullWidth
          justify="flex-start"
        >
          Delete
        </Button>
      </Stack>

      <Stack gap={6}>
        <Text size="xs" tt="uppercase" fw={700} c="dark.2">
          Enhance
        </Text>
        <Button
          variant="default"
          leftSection={<IconWand size={14} />}
          onClick={handleRemoveBackground}
          disabled={blocksActions || image.type === 'background-removed'}
          loading={removeBgMutation.isPending}
          fullWidth
          justify="flex-start"
        >
          {image.type === 'background-removed'
            ? 'Background already removed'
            : 'Remove background'}
        </Button>
        <ComingSoonButton icon={<IconArrowsMaximize size={14} />} label="Upscale" />
        <ComingSoonButton icon={<IconBulb size={14} />} label="Lighting" />
        <ComingSoonButton icon={<IconPalette size={14} />} label="Color correct" />
      </Stack>
    </>
  )

  // Shared image preview content
  const imagePreview = isProcessing ? (
    <Stack align="center" gap="md">
      <Loader size="md" color="brand" />
      <Text c="dark.1" size="sm">
        Processing this image…
      </Text>
    </Stack>
  ) : isFailed ? (
    <Stack align="center" gap="xs" maw={320} ta="center">
      <ThemeIcon size={42} radius="xl" color="red" variant="light">
        <IconWand size={20} />
      </ThemeIcon>
      <Text c="white" fw={600}>
        Processing failed
      </Text>
      <Text c="dark.2" size="sm">
        {image.error ?? 'Try again or pick a different source image.'}
      </Text>
    </Stack>
  ) : null

  const bgImage =
    image.type === 'background-removed'
      ? 'repeating-conic-gradient(#222 0% 25%, #1a1a1a 25% 50%) 0 0 / 16px 16px'
      : undefined

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      fullScreen
      padding={0}
      withCloseButton={false}
      styles={{
        content: {
          backgroundColor: 'var(--mantine-color-dark-7)',
        },
        body: { padding: 0, height: '100vh' },
      }}
    >
      {isMobile ? (
        <Stack gap={0} style={{ minHeight: '100vh' }}>
          {/* Image preview — mobile: top, capped at 60vh */}
          <Box
            style={{
              backgroundColor: 'var(--mantine-color-dark-8, #050505)',
              backgroundImage: bgImage,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              minHeight: '40vh',
              maxHeight: '60vh',
            }}
          >
            {imagePreview ?? (
              <Image
                src={image.imageUrl}
                alt={productName}
                fit="contain"
                w="100%"
                h="100%"
                style={{ maxHeight: '60vh', padding: 16 }}
              />
            )}
          </Box>

          {/* Action sidebar — mobile: below image, full width */}
          <Stack
            w="100%"
            gap="lg"
            p="lg"
            style={{
              borderTop: '1px solid var(--mantine-color-dark-5)',
              backgroundColor: 'var(--mantine-color-dark-7)',
            }}
          >
            {sidebarContent}
          </Stack>
        </Stack>
      ) : (
        <Group gap={0} align="stretch" wrap="nowrap" style={{ minHeight: '100vh' }}>
          {/* Image preview — desktop */}
          <Box
            style={{
              flex: 1,
              backgroundColor: 'var(--mantine-color-dark-8, #050505)',
              backgroundImage: bgImage,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              minHeight: '100vh',
            }}
          >
            {imagePreview ?? (
              <Image
                src={image.imageUrl}
                alt={productName}
                fit="contain"
                w="100%"
                h="100%"
                style={{ maxHeight: '90vh', padding: 32 }}
              />
            )}
          </Box>

          {/* Action sidebar — desktop */}
          <Stack
            w={280}
            gap="lg"
            p="lg"
            style={{
              borderLeft: '1px solid var(--mantine-color-dark-5)',
              backgroundColor: 'var(--mantine-color-dark-7)',
            }}
          >
            {sidebarContent}
          </Stack>
        </Group>
      )}
    </Modal>
  )
}

function ComingSoonButton({
  icon,
  label,
}: {
  icon: React.ReactNode
  label: string
}) {
  return (
    <Tooltip label="Coming soon" position="left">
      <Button
        variant="default"
        leftSection={icon}
        rightSection={
          <Badge size="xs" variant="light" color="gray">
            Soon
          </Badge>
        }
        disabled
        fullWidth
        justify="flex-start"
        styles={{
          root: { opacity: 0.65 },
        }}
      >
        {label}
      </Button>
    </Tooltip>
  )
}
