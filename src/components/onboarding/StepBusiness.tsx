import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import {
  Anchor,
  Box,
  Button,
  Group,
  Image,
  Loader,
  Paper,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconArrowRight, IconLink, IconCheck } from '@tabler/icons-react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'

type Phase = 'input' | 'scraping' | 'preview'

export function StepBusiness({
  onNext,
  onBack,
}: {
  onNext: () => void
  onBack: () => void
}) {
  const [phase, setPhase] = useState<Phase>('input')
  const [url, setUrl] = useState('')
  const [activeImportId, setActiveImportId] =
    useState<Id<'urlImports'> | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const createUrlImport = useMutation(api.urlImports.createUrlImport)
  const advance = useMutation(api.onboardingProfiles.advanceToPlanStep)
  const importStatus = useQuery(
    api.urlImports.getUrlImport,
    activeImportId ? { importId: activeImportId } : 'skip',
  )
  const brandKit = useQuery(api.brandKits.getBrandKit, {})

  // Drive phase transitions from import status
  useEffect(() => {
    if (!activeImportId || !importStatus) return
    if (importStatus.status === 'done') {
      setPhase('preview')
    } else if (importStatus.status === 'failed') {
      notifications.show({
        title: "Couldn't read that page",
        message:
          importStatus.error ??
          "We couldn't pull brand info from that URL. You can skip and add it later.",
        color: 'orange',
        autoClose: 7000,
      })
      setActiveImportId(null)
      setPhase('input')
    } else {
      setPhase('scraping')
    }
  }, [importStatus, activeImportId])

  const handleSubmit = async () => {
    if (!url.trim() || submitting) return
    setSubmitting(true)
    try {
      const importId = await createUrlImport({
        url: url.trim(),
        mode: 'brand-only',
      })
      setActiveImportId(importId)
      setPhase('scraping')
    } catch (err) {
      notifications.show({
        title: "Couldn't start",
        message: err instanceof Error ? err.message : 'Try again',
        color: 'red',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleSkip = async () => {
    try {
      await advance()
      onNext()
    } catch (err) {
      notifications.show({
        title: "Couldn't continue",
        message: err instanceof Error ? err.message : 'Try again',
        color: 'red',
      })
    }
  }

  const handleConfirm = async () => {
    try {
      await advance()
      onNext()
    } catch (err) {
      notifications.show({
        title: "Couldn't continue",
        message: err instanceof Error ? err.message : 'Try again',
        color: 'red',
      })
    }
  }

  return (
    <Stack gap="lg">
      <Stack gap="xs" align="center">
        <Title order={1} fz={28} fw={600} ta="center">
          Set up your business
        </Title>
        <Text c="dark.2" ta="center" maw={460}>
          Paste your website URL — we'll pull your logo, voice, and styling
          automatically. You can skip and add it later if you'd rather.
        </Text>
      </Stack>

      {phase === 'input' && (
        <Stack gap="md">
          <TextInput
            placeholder="https://your-store.com"
            leftSection={<IconLink size={14} />}
            value={url}
            onChange={(e) => setUrl(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleSubmit()
              }
            }}
            size="md"
            disabled={submitting}
          />

          <Text size="xs" c="dark.3">
            Have multiple websites? You'll be able to add more brands after
            onboarding.
          </Text>

          <Group justify="space-between" mt="md">
            <Button variant="subtle" color="gray" onClick={onBack}>
              ← Back
            </Button>
            <Group gap="xs">
              <Button variant="subtle" color="gray" onClick={handleSkip}>
                Skip this step
              </Button>
              <Button
                color="brand"
                size="md"
                disabled={!url.trim()}
                loading={submitting}
                rightSection={<IconArrowRight size={16} />}
                onClick={handleSubmit}
              >
                Continue
              </Button>
            </Group>
          </Group>
        </Stack>
      )}

      {phase === 'scraping' && (
        <Paper p="xl" radius="lg" withBorder bg="dark.7">
          <Stack align="center" gap="md">
            <Loader size="md" color="brand" />
            <Text c="white" fw={500}>
              {importStatus?.currentStep ?? 'Reading your website…'}
            </Text>
            <Text size="xs" c="dark.3">
              This usually takes 10–20 seconds.
            </Text>
          </Stack>
        </Paper>
      )}

      {phase === 'preview' && (
        <Stack gap="md">
          <BrandPreviewCard brandKit={brandKit ?? undefined} />
          <Text size="xs" c="dark.3" ta="center">
            You can edit any of this later in your Brand kit page.
          </Text>
          <Group justify="space-between" mt="md">
            <Button variant="subtle" color="gray" onClick={onBack}>
              ← Back
            </Button>
            <Button
              color="brand"
              size="md"
              rightSection={<IconArrowRight size={16} />}
              onClick={handleConfirm}
            >
              Looks good, continue
            </Button>
          </Group>
        </Stack>
      )}
    </Stack>
  )
}

function BrandPreviewCard({
  brandKit,
}: {
  brandKit:
    | {
        logoUrl?: string
        tagline?: string
        websiteUrl?: string
        colors?: Array<string>
      }
    | undefined
}) {
  const hasAny =
    brandKit &&
    (brandKit.logoUrl ||
      brandKit.tagline ||
      (brandKit.colors && brandKit.colors.length > 0))

  return (
    <Paper p="lg" radius="lg" withBorder bg="dark.7">
      <Stack gap="md">
        <Group gap="xs">
          <ThemeIcon size="sm" radius="xl" color="teal" variant="light">
            <IconCheck size={14} />
          </ThemeIcon>
          <Text fw={600} c="white">
            Here's what we found
          </Text>
        </Group>

        {!hasAny && (
          <Text size="sm" c="dark.2">
            We couldn't pull much brand info from that page. No worries — you
            can add it manually anytime in Brand kit.
          </Text>
        )}

        {hasAny && (
          <Group gap="md" align="flex-start" wrap="nowrap">
            {brandKit?.logoUrl && (
              <Box
                w={64}
                h={64}
                style={{
                  borderRadius: 8,
                  overflow: 'hidden',
                  backgroundColor: 'var(--mantine-color-dark-6)',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Image
                  src={brandKit.logoUrl}
                  alt="Brand logo"
                  fit="contain"
                  w="100%"
                  h="100%"
                />
              </Box>
            )}
            <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
              {brandKit?.tagline && (
                <Text size="sm" c="white" fw={500}>
                  {brandKit.tagline}
                </Text>
              )}
              {brandKit?.websiteUrl && (
                <Anchor
                  href={brandKit.websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  size="xs"
                  c="dark.2"
                >
                  {brandKit.websiteUrl}
                </Anchor>
              )}
              {brandKit?.colors && brandKit.colors.length > 0 && (
                <Group gap={6} mt={4}>
                  {brandKit.colors.slice(0, 4).map((c) => (
                    <Box
                      key={c}
                      w={18}
                      h={18}
                      style={{
                        borderRadius: 4,
                        backgroundColor: c,
                        border: '1px solid var(--mantine-color-dark-5)',
                      }}
                    />
                  ))}
                </Group>
              )}
            </Stack>
          </Group>
        )}
      </Stack>
    </Paper>
  )
}
