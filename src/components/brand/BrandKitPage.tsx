/**
 * /account/brand page. Lets the user define their brand kit (logo, colors,
 * font, voice, tagline) which downstream features (#3 ad copy, #4 from-scratch
 * generation) consume to keep outputs on-brand.
 *
 * Reads from:
 *   - api.brandKits.getBrandKit
 * Writes via:
 *   - api.brandKits.updateBrandKit
 *   - api.brandKits.clearBrandLogo
 *   - api.r2.uploadProductImage (logo upload)
 */
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { convexQuery, useConvexMutation } from '@convex-dev/react-query'
import { useAction } from 'convex/react'
import {
  ActionIcon,
  Box,
  Button,
  ColorInput,
  Container,
  FileButton,
  Group,
  Image,
  Loader,
  Paper,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconTrash, IconUpload, IconCheck } from '@tabler/icons-react'
import { api } from '../../../convex/_generated/api'

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

export function BrandKitPage() {
  const { data: kit, isLoading } = useQuery(convexQuery(api.brandKits.getBrandKit, {}))
  const updateBrandKit = useConvexMutation(api.brandKits.updateBrandKit)
  const clearLogo = useConvexMutation(api.brandKits.clearBrandLogo)
  const uploadImage = useAction(api.r2.uploadProductImage)
  const resetRef = useRef<() => void>(null)

  const [logoUrl, setLogoUrl] = useState<string | undefined>()
  const [logoStorageKey, setLogoStorageKey] = useState<string | undefined>()
  const [colors, setColors] = useState<string[]>(['', '', ''])
  const [primaryFont, setPrimaryFont] = useState('')
  const [voice, setVoice] = useState('')
  const [tagline, setTagline] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!kit) return
    setLogoUrl(kit.logoUrl)
    setLogoStorageKey(kit.logoStorageKey)
    const next = [...(kit.colors ?? [])]
    while (next.length < 3) next.push('')
    setColors(next.slice(0, 3))
    setPrimaryFont(kit.primaryFont ?? '')
    setVoice(kit.voice ?? '')
    setTagline(kit.tagline ?? '')
  }, [kit])

  if (isLoading) {
    return (
      <Container size="sm" py="xl">
        <Group justify="center" py="xl">
          <Loader size="md" />
        </Group>
      </Container>
    )
  }

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
      notifications.show({ title: 'Logo uploaded', message: 'Save changes to apply.', color: 'green' })
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
    await clearLogo({})
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await updateBrandKit({
        logoUrl,
        logoStorageKey,
        colors: colors.filter((c) => c.trim().length > 0),
        primaryFont: primaryFont.trim() || undefined,
        voice: voice.trim() || undefined,
        tagline: tagline.trim() || undefined,
      })
      notifications.show({
        title: 'Saved',
        message: 'Brand kit updated.',
        color: 'green',
        icon: <IconCheck size={14} />,
      })
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
    <Container size="sm" py="xl">
      <Stack gap="xl">
        <Box>
          <Title order={2}>Brand kit</Title>
          <Text size="sm" c="dark.2" mt="xs">
            Used to keep generated ads and ad copy on-brand. Optional — fill out what you want.
          </Text>
        </Box>

        <Paper withBorder radius="md" p="lg">
          <Stack gap="md">
            <Text size="sm" fw={600} c="white">
              Logo
            </Text>
            {logoUrl ? (
              <Group align="center" gap="md">
                <Image
                  src={logoUrl}
                  alt="Brand logo"
                  h={80}
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
        </Paper>

        <Paper withBorder radius="md" p="lg">
          <Stack gap="md">
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
        </Paper>

        <Paper withBorder radius="md" p="lg">
          <Stack gap="md">
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
              description="How your brand sounds in writing — used to steer ad copy."
              placeholder="e.g. Confident but warm. Plain English, no jargon. Skips superlatives."
              autosize
              minRows={3}
              maxRows={6}
              value={voice}
              onChange={(e) => setVoice(e.currentTarget.value)}
            />
          </Stack>
        </Paper>

        <Group justify="flex-end">
          <Button color="brand" loading={isSaving} onClick={handleSave}>
            Save brand kit
          </Button>
        </Group>
      </Stack>
    </Container>
  )
}
