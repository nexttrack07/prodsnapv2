/**
 * /account/brand page. Multi-brand management: list all brands, inline
 * create/edit form, set primary, delete.
 *
 * Reads from:
 *   - api.brandKits.listBrandKits
 * Writes via:
 *   - api.brandKits.createBrandKit / updateBrandKitById / deleteBrandKit
 *   - api.brandKits.setPrimaryBrandKit / clearBrandLogo
 *   - api.r2.uploadProductImage (logo upload)
 */
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { convexQuery, useConvexMutation } from '@convex-dev/react-query'
import { useAction } from 'convex/react'
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  ColorInput,
  Container,
  FileButton,
  Group,
  Image,
  Loader,
  Menu,
  Paper,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconTrash,
  IconUpload,
  IconCheck,
  IconPlus,
  IconPencil,
  IconDots,
  IconStar,
  IconStarFilled,
  IconX,
} from '@tabler/icons-react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'

const MAX_LOGO_BYTES = 5 * 1024 * 1024 // 5MB

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

type BrandDoc = {
  _id: Id<'brandKits'>
  _creationTime: number
  name?: string
  isPrimary?: boolean
  logoUrl?: string
  logoStorageKey?: string
  colors?: string[]
  primaryFont?: string
  voice?: string
  tagline?: string
  websiteUrl?: string
  currentOffer?: string
  customerLanguage?: string[]
  updatedAt: number
}

export function BrandKitPage() {
  const { data: brands, isLoading } = useQuery(
    convexQuery(api.brandKits.listBrandKits, {}),
  )
  const [editingId, setEditingId] = useState<Id<'brandKits'> | 'new' | null>(null)

  if (isLoading) {
    return (
      <Container size="sm" py="xl">
        <Group justify="center" py="xl">
          <Loader size="md" />
        </Group>
      </Container>
    )
  }

  const hasBrands = brands && brands.length > 0

  return (
    <Container size="sm" py="xl">
      <Stack gap="xl">
        <Group justify="space-between" align="flex-start">
          <Box>
            <Title order={2}>Brands</Title>
            <Text size="sm" c="dark.2" mt="xs">
              Brand kits keep generated ads and copy on-brand.
            </Text>
          </Box>
          {hasBrands && editingId !== 'new' && (
            <Button
              size="xs"
              variant="light"
              color="brand"
              leftSection={<IconPlus size={14} />}
              onClick={() => setEditingId('new')}
            >
              New brand
            </Button>
          )}
        </Group>

        {/* Inline new-brand form */}
        {editingId === 'new' && (
          <BrandForm
            onSave={() => setEditingId(null)}
            onCancel={() => setEditingId(null)}
          />
        )}

        {/* Brand cards */}
        {hasBrands ? (
          (brands as BrandDoc[]).map((brand) =>
            editingId === brand._id ? (
              <BrandForm
                key={brand._id}
                brand={brand}
                onSave={() => setEditingId(null)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <BrandCard
                key={brand._id}
                brand={brand}
                onEdit={() => setEditingId(brand._id)}
              />
            ),
          )
        ) : editingId !== 'new' ? (
          <Paper
            withBorder
            radius="md"
            p="xl"
            ta="center"
            style={{ borderStyle: 'dashed' }}
          >
            <Stack align="center" gap="md">
              <Text size="sm" c="dark.2">
                No brands yet. Create your first to keep ads on-brand.
              </Text>
              <Button
                color="brand"
                leftSection={<IconPlus size={14} />}
                onClick={() => setEditingId('new')}
              >
                Create your first brand
              </Button>
            </Stack>
          </Paper>
        ) : null}
      </Stack>
    </Container>
  )
}

// ─── Brand card (read-only row) ─────────────────────────────────────────────

function BrandCard({
  brand,
  onEdit,
}: {
  brand: BrandDoc
  onEdit: () => void
}) {
  const setPrimary = useConvexMutation(api.brandKits.setPrimaryBrandKit)
  const deleteBrand = useConvexMutation(api.brandKits.deleteBrandKit)
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleSetPrimary() {
    try {
      await setPrimary({ brandKitId: brand._id })
      notifications.show({ title: 'Primary brand updated', message: '', color: 'green' })
    } catch (err) {
      notifications.show({
        title: 'Error',
        message: err instanceof Error ? err.message : 'Failed to set primary',
        color: 'red',
      })
    }
  }

  async function handleDelete() {
    setIsDeleting(true)
    try {
      await deleteBrand({ brandKitId: brand._id })
      notifications.show({ title: 'Brand deleted', message: '', color: 'green' })
    } catch (err) {
      notifications.show({
        title: 'Error',
        message: err instanceof Error ? err.message : 'Failed to delete',
        color: 'red',
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const displayName = brand.name || brand.websiteUrl || 'Unnamed brand'
  const colorSwatches = (brand.colors ?? []).filter((c) => c.trim().length > 0)

  return (
    <Card withBorder radius="md" p="md" style={{ borderColor: brand.isPrimary ? 'var(--mantine-color-brand-7)' : undefined }}>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Group gap="md" wrap="nowrap" style={{ minWidth: 0 }}>
          {brand.logoUrl ? (
            <Image
              src={brand.logoUrl}
              alt={displayName}
              h={48}
              w={48}
              fit="contain"
              radius="sm"
              bg="rgba(255,255,255,0.04)"
              style={{ flexShrink: 0 }}
            />
          ) : (
            <Box
              w={48}
              h={48}
              bg="dark.6"
              style={{
                borderRadius: 'var(--mantine-radius-sm)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Text size="lg" fw={700} c="dark.3">
                {displayName.charAt(0).toUpperCase()}
              </Text>
            </Box>
          )}

          <Stack gap={4} style={{ minWidth: 0 }}>
            <Group gap="xs">
              <Text fw={600} c="white" truncate>
                {displayName}
              </Text>
              {brand.isPrimary && (
                <Badge size="xs" variant="light" color="brand">
                  Primary
                </Badge>
              )}
            </Group>
            <Group gap="xs">
              {colorSwatches.length > 0 && (
                <Group gap={3}>
                  {colorSwatches.map((c, i) => (
                    <Box
                      key={i}
                      w={14}
                      h={14}
                      style={{
                        borderRadius: 3,
                        backgroundColor: c,
                        border: '1px solid var(--mantine-color-dark-4)',
                      }}
                    />
                  ))}
                </Group>
              )}
              {brand.tagline && (
                <Text size="xs" c="dark.2" truncate maw={280}>
                  {brand.tagline}
                </Text>
              )}
            </Group>
          </Stack>
        </Group>

        <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
          <Button
            size="xs"
            variant="subtle"
            color="gray"
            leftSection={<IconPencil size={13} />}
            onClick={onEdit}
          >
            Edit
          </Button>

          <Menu shadow="md" width={180} position="bottom-end">
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray" size="sm">
                <IconDots size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {!brand.isPrimary && (
                <Menu.Item
                  leftSection={<IconStar size={14} />}
                  onClick={handleSetPrimary}
                >
                  Set as primary
                </Menu.Item>
              )}
              <Menu.Item
                color="red"
                leftSection={<IconTrash size={14} />}
                onClick={handleDelete}
                disabled={isDeleting}
              >
                Delete
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
    </Card>
  )
}

// ─── Brand form (create / edit) ─────────────────────────────────────────────

function BrandForm({
  brand,
  onSave,
  onCancel,
}: {
  brand?: BrandDoc
  onSave: () => void
  onCancel: () => void
}) {
  const isNew = !brand
  const createBrandKit = useConvexMutation(api.brandKits.createBrandKit)
  const updateBrandKit = useConvexMutation(api.brandKits.updateBrandKitById)
  const clearLogo = useConvexMutation(api.brandKits.clearBrandLogo)
  const uploadImage = useAction(api.r2.uploadProductImage)
  const resetRef = useRef<() => void>(null)

  const [name, setName] = useState(brand?.name ?? '')
  const [logoUrl, setLogoUrl] = useState<string | undefined>(brand?.logoUrl)
  const [logoStorageKey, setLogoStorageKey] = useState<string | undefined>(brand?.logoStorageKey)
  const [colors, setColors] = useState<string[]>(() => {
    const c = [...(brand?.colors ?? [])]
    while (c.length < 3) c.push('')
    return c.slice(0, 3)
  })
  const [primaryFont, setPrimaryFont] = useState(brand?.primaryFont ?? '')
  const [voice, setVoice] = useState(brand?.voice ?? '')
  const [tagline, setTagline] = useState(brand?.tagline ?? '')
  const [websiteUrl, setWebsiteUrl] = useState(brand?.websiteUrl ?? '')
  const [currentOffer, setCurrentOffer] = useState(brand?.currentOffer ?? '')
  const [customerLanguageText, setCustomerLanguageText] = useState(
    brand?.customerLanguage?.join('\n') ?? '',
  )
  const [isUploading, setIsUploading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const handleLogoUpload = async (file: File | null) => {
    if (!file) return
    if (file.size > MAX_LOGO_BYTES) {
      notifications.show({ title: 'Logo too large', message: 'Max 5 MB.', color: 'red' })
      return
    }
    setIsUploading(true)
    try {
      const base64 = await fileToBase64(file)
      const result = await uploadImage({
        name: file.name,
        contentType: file.type,
        base64,
      })
      setLogoUrl(result.url)
      setLogoStorageKey(result.key)
    } catch (err) {
      notifications.show({
        title: 'Logo upload failed',
        message: err instanceof Error ? err.message : 'Unknown error',
        color: 'red',
      })
    } finally {
      setIsUploading(false)
      resetRef.current?.()
    }
  }

  const handleClearLogo = async () => {
    setLogoUrl(undefined)
    setLogoStorageKey(undefined)
    if (brand) {
      await clearLogo({ brandKitId: brand._id })
    }
  }

  const handleSave = async () => {
    if (!name.trim()) {
      notifications.show({ title: 'Name required', message: 'Enter a brand name.', color: 'red' })
      return
    }
    setIsSaving(true)
    try {
      const payload = {
        name: name.trim(),
        logoUrl,
        logoStorageKey,
        colors: colors.filter((c) => c.trim().length > 0),
        primaryFont: primaryFont.trim() || undefined,
        voice: voice.trim() || undefined,
        tagline: tagline.trim() || undefined,
        websiteUrl: websiteUrl.trim() || undefined,
        currentOffer: currentOffer.trim() || undefined,
        customerLanguage: customerLanguageText
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean),
      }

      if (isNew) {
        await createBrandKit(payload)
        notifications.show({
          title: 'Brand created',
          message: `"${payload.name}" is ready.`,
          color: 'green',
          icon: <IconCheck size={14} />,
        })
      } else {
        await updateBrandKit({ brandKitId: brand._id, ...payload })
        notifications.show({
          title: 'Saved',
          message: 'Brand kit updated.',
          color: 'green',
          icon: <IconCheck size={14} />,
        })
      }
      onSave()
    } catch (err) {
      notifications.show({
        title: 'Save failed',
        message: err instanceof Error ? err.message : 'Unknown error',
        color: 'red',
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Paper withBorder radius="md" p="lg" style={{ borderColor: 'var(--mantine-color-brand-8)' }}>
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={4} c="white">
            {isNew ? 'New brand' : `Edit: ${brand.name || 'Unnamed'}`}
          </Title>
          <ActionIcon variant="subtle" color="gray" onClick={onCancel}>
            <IconX size={16} />
          </ActionIcon>
        </Group>

        <TextInput
          label="Brand name"
          placeholder="e.g. Lumiere Skincare"
          required
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
        />

        {/* Logo */}
        <Stack gap="xs">
          <Text size="sm" fw={600} c="white">
            Logo
          </Text>
          {logoUrl ? (
            <Group align="center" gap="md">
              <Image
                src={logoUrl}
                alt="Brand logo"
                h={64}
                w="auto"
                fit="contain"
                radius="sm"
                bg="rgba(255,255,255,0.04)"
                p="xs"
              />
              <ActionIcon
                variant="subtle"
                color="red"
                onClick={handleClearLogo}
                aria-label="Remove logo"
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          ) : (
            <Text size="xs" c="dark.2">
              No logo yet.
            </Text>
          )}
          <FileButton
            resetRef={resetRef}
            onChange={handleLogoUpload}
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
          >
            {(props) => (
              <Button
                {...props}
                variant="default"
                size="xs"
                leftSection={<IconUpload size={13} />}
                loading={isUploading}
                w="fit-content"
              >
                {logoUrl ? 'Replace logo' : 'Upload logo'}
              </Button>
            )}
          </FileButton>
        </Stack>

        {/* Colors */}
        <Stack gap="xs">
          <Text size="sm" fw={600} c="white">
            Brand colors
          </Text>
          <Text size="xs" c="dark.2">
            First color is your primary. Leave blank to skip.
          </Text>
          {colors.map((color, idx) => (
            <ColorInput
              key={idx}
              label={idx === 0 ? 'Primary' : idx === 1 ? 'Secondary' : 'Accent'}
              placeholder="#000000"
              value={color}
              onChange={(value) =>
                setColors((prev) => prev.map((c, i) => (i === idx ? value : c)))
              }
              format="hex"
              swatches={['#000000', '#ffffff', '#5474b4', '#0d9488', '#a855f7']}
            />
          ))}
        </Stack>

        {/* Identity fields */}
        <TextInput
          label="Website URL"
          placeholder="https://lumiere.shop"
          value={websiteUrl}
          onChange={(e) => setWebsiteUrl(e.currentTarget.value)}
        />
        <TextInput
          label="Primary font"
          placeholder="e.g. Inter, Helvetica, Playfair Display"
          value={primaryFont}
          onChange={(e) => setPrimaryFont(e.currentTarget.value)}
        />
        <TextInput
          label="Tagline"
          placeholder="e.g. Smart skincare for busy people"
          value={tagline}
          onChange={(e) => setTagline(e.currentTarget.value)}
        />
        <Textarea
          label="Brand voice"
          description="How your brand sounds in writing."
          placeholder="e.g. Confident but warm. Plain English, no jargon."
          autosize
          minRows={3}
          maxRows={6}
          value={voice}
          onChange={(e) => setVoice(e.currentTarget.value)}
        />

        {/* Playbook fields */}
        <TextInput
          label="Current offer"
          placeholder="e.g. 15% off your first order"
          description="Shown at the bottom of generated ads."
          value={currentOffer}
          onChange={(e) => setCurrentOffer(e.currentTarget.value)}
        />
        <Textarea
          label="Customer language"
          description="Paste real customer reviews, comments, or DMs. One per line. These ground AI-generated copy in authentic voice."
          placeholder={"My skin felt like glass overnight\nI was shocked at how fast it worked\nFinally a serum that doesn't pill under makeup"}
          autosize
          minRows={3}
          maxRows={10}
          value={customerLanguageText}
          onChange={(e) => setCustomerLanguageText(e.currentTarget.value)}
        />

        {/* Actions */}
        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" color="gray" onClick={onCancel}>
            Cancel
          </Button>
          <Button color="brand" loading={isSaving} onClick={handleSave}>
            {isNew ? 'Create brand' : 'Save changes'}
          </Button>
        </Group>
      </Stack>
    </Paper>
  )
}
