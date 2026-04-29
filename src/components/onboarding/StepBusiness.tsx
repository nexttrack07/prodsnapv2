import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import {
  ActionIcon,
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
import {
  IconArrowRight,
  IconCheck,
  IconLink,
  IconPlus,
  IconX,
  IconAlertTriangle,
} from '@tabler/icons-react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'

type Phase = 'input' | 'scraping' | 'preview'

/** Tracks one in-flight import. */
interface ImportEntry {
  url: string
  importId: Id<'urlImports'>
  /** Local mirror updated from the reactive sub-component. */
  status: 'pending' | 'scraping' | 'extracting' | 'uploading' | 'done' | 'failed'
  currentStep?: string
  error?: string
}

export function StepBusiness({
  onNext,
  onBack,
}: {
  onNext: () => void
  onBack: () => void
}) {
  const [phase, setPhase] = useState<Phase>('input')
  const [urls, setUrls] = useState<string[]>([''])
  const [imports, setImports] = useState<ImportEntry[]>([])
  const [submitting, setSubmitting] = useState(false)

  const createUrlImport = useMutation(api.urlImports.createUrlImport)
  const advance = useMutation(api.onboardingProfiles.advanceToPlanStep)
  const brandKits = useQuery(api.brandKits.listBrandKits, {})

  // ── URL list helpers ────────────────────────────────────────────────────

  const updateUrl = useCallback((index: number, value: string) => {
    setUrls((prev) => prev.map((u, i) => (i === index ? value : u)))
  }, [])

  const removeUrl = useCallback((index: number) => {
    setUrls((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const addUrl = useCallback(() => {
    setUrls((prev) => [...prev, ''])
  }, [])

  // ── Callback for reactive import watcher to report status ──────────────

  const handleImportUpdate = useCallback(
    (importId: Id<'urlImports'>, patch: Pick<ImportEntry, 'status'> & { currentStep?: string; error?: string }) => {
      setImports((prev) =>
        prev.map((entry) =>
          entry.importId === importId ? { ...entry, ...patch } : entry,
        ),
      )
    },
    [],
  )

  // ── Transition to preview once ALL imports are terminal ─────────────────

  const allTerminal = imports.length > 0 && imports.every((e) => e.status === 'done' || e.status === 'failed')

  useEffect(() => {
    if (phase === 'scraping' && allTerminal) {
      const anyDone = imports.some((e) => e.status === 'done')
      if (anyDone) {
        setPhase('preview')
      } else {
        // All failed — go back to input
        notifications.show({
          title: "Couldn't read those pages",
          message:
            "We couldn't pull brand info from any of the URLs. You can try again or skip and add them later.",
          color: 'orange',
          autoClose: 7000,
        })
        setImports([])
        setPhase('input')
      }
    }
  }, [phase, allTerminal, imports])

  // ── Submit handler ─────────────────────────────────────────────────────

  const handleSubmit = async () => {
    const trimmed = urls.map((u) => u.trim()).filter(Boolean)

    // If no URLs, treat as skip
    if (trimmed.length === 0) {
      await handleSkip()
      return
    }

    // Basic URL validation
    for (const u of trimmed) {
      try {
        new URL(u.startsWith('http') ? u : `https://${u}`)
      } catch {
        notifications.show({
          title: 'Invalid URL',
          message: `"${u}" doesn't look like a valid website URL.`,
          color: 'red',
        })
        return
      }
    }

    setSubmitting(true)
    try {
      const entries: ImportEntry[] = await Promise.all(
        trimmed.map(async (url) => {
          const importId = await createUrlImport({
            url: url.startsWith('http') ? url : `https://${url}`,
            mode: 'brand-only',
          })
          return {
            url,
            importId,
            status: 'pending' as const,
          }
        }),
      )
      setImports(entries)
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

  // ── Brands that were created by the finished imports ────────────────────

  const importedBrands = useMemo(() => {
    if (!brandKits) return []
    const doneUrls = new Set(
      imports
        .filter((e) => e.status === 'done')
        .map((e) => {
          // Normalise so we can match against the brandKit.websiteUrl
          try {
            return new URL(e.url.startsWith('http') ? e.url : `https://${e.url}`).origin
          } catch {
            return e.url
          }
        }),
    )
    if (doneUrls.size === 0) return brandKits
    return brandKits.filter((bk) => {
      if (!bk.websiteUrl) return false
      try {
        return doneUrls.has(new URL(bk.websiteUrl).origin)
      } catch {
        return false
      }
    })
  }, [brandKits, imports])

  return (
    <Stack gap="lg">
      <Stack gap="xs" align="center">
        <Title order={1} fz={28} fw={600} ta="center">
          Set up your business
        </Title>
        <Text c="dark.2" ta="center" maw={460}>
          Paste your website URLs — we'll pull your logo, voice, and styling
          automatically. You can skip and add them later if you'd rather.
        </Text>
      </Stack>

      {/* ── INPUT PHASE ───────────────────────────────────────────────── */}
      {phase === 'input' && (
        <Stack gap="md">
          {urls.map((url, i) => (
            <Group key={i} gap="xs" wrap="nowrap">
              <TextInput
                placeholder="https://your-store.com"
                leftSection={<IconLink size={14} />}
                value={url}
                onChange={(e) => updateUrl(i, e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleSubmit()
                  }
                }}
                size="md"
                disabled={submitting}
                style={{ flex: 1 }}
              />
              {urls.length > 1 && (
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="lg"
                  onClick={() => removeUrl(i)}
                  aria-label="Remove URL"
                  disabled={submitting}
                >
                  <IconX size={16} />
                </ActionIcon>
              )}
            </Group>
          ))}

          <Button
            variant="subtle"
            color="gray"
            size="xs"
            leftSection={<IconPlus size={14} />}
            onClick={addUrl}
            disabled={submitting}
            w="fit-content"
          >
            Add another website
          </Button>

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
                disabled={urls.every((u) => !u.trim())}
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

      {/* ── SCRAPING PHASE ────────────────────────────────────────────── */}
      {phase === 'scraping' && (
        <Paper p="xl" radius="lg" withBorder bg="dark.7">
          <Stack gap="md">
            {imports.map((entry) => (
              <ImportProgressRow
                key={entry.importId}
                entry={entry}
                onUpdate={handleImportUpdate}
              />
            ))}
            <Text size="xs" c="dark.3" ta="center">
              This usually takes 10–20 seconds per site.
            </Text>
          </Stack>
        </Paper>
      )}

      {/* ── PREVIEW PHASE ─────────────────────────────────────────────── */}
      {phase === 'preview' && (
        <Stack gap="md">
          {/* Show failed imports as small warnings */}
          {imports
            .filter((e) => e.status === 'failed')
            .map((entry) => (
              <Paper key={entry.importId} p="sm" radius="md" withBorder bg="dark.7">
                <Group gap="xs" wrap="nowrap">
                  <ThemeIcon size="sm" radius="xl" color="orange" variant="light">
                    <IconAlertTriangle size={14} />
                  </ThemeIcon>
                  <Text size="sm" c="dark.2">
                    Couldn't read {entry.url}
                    {entry.error ? ` — ${entry.error}` : ''}
                  </Text>
                </Group>
              </Paper>
            ))}

          {/* Brand cards */}
          {importedBrands.length > 0 ? (
            importedBrands.map((bk) => (
              <BrandPreviewCard key={bk._id} brandKit={bk} />
            ))
          ) : (
            /* Fallback: show all brand kits if we can't match by URL */
            brandKits && brandKits.length > 0 ? (
              brandKits.map((bk) => (
                <BrandPreviewCard key={bk._id} brandKit={bk} />
              ))
            ) : (
              <Paper p="lg" radius="lg" withBorder bg="dark.7">
                <Text size="sm" c="dark.2">
                  We couldn't pull much brand info from those pages. No worries —
                  you can add it manually anytime in Brand kit.
                </Text>
              </Paper>
            )
          )}

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

// ─── Reactive row that subscribes to a single import's status ─────────────

function ImportProgressRow({
  entry,
  onUpdate,
}: {
  entry: ImportEntry
  onUpdate: (importId: Id<'urlImports'>, patch: Pick<ImportEntry, 'status'> & { currentStep?: string; error?: string }) => void
}) {
  const importStatus = useQuery(api.urlImports.getUrlImport, {
    importId: entry.importId,
  })

  useEffect(() => {
    if (!importStatus) return
    const status = importStatus.status as ImportEntry['status']
    if (status !== entry.status) {
      onUpdate(entry.importId, {
        status,
        currentStep: importStatus.currentStep ?? undefined,
        error: importStatus.error ?? undefined,
      })
    }
  }, [importStatus, entry.importId, entry.status, onUpdate])

  const displayUrl = (() => {
    try {
      return new URL(entry.url.startsWith('http') ? entry.url : `https://${entry.url}`).hostname
    } catch {
      return entry.url
    }
  })()

  const isDone = entry.status === 'done'
  const isFailed = entry.status === 'failed'
  const isActive = !isDone && !isFailed

  return (
    <Group gap="sm" wrap="nowrap">
      {isDone && (
        <ThemeIcon size="sm" radius="xl" color="teal" variant="light">
          <IconCheck size={14} />
        </ThemeIcon>
      )}
      {isFailed && (
        <ThemeIcon size="sm" radius="xl" color="orange" variant="light">
          <IconAlertTriangle size={14} />
        </ThemeIcon>
      )}
      {isActive && <Loader size="xs" color="brand" />}
      <Text size="sm" c={isFailed ? 'dark.3' : 'white'} fw={isActive ? 500 : 400}>
        {isActive
          ? (importStatus?.currentStep ?? `Reading ${displayUrl}...`)
          : isDone
            ? `${displayUrl} — done`
            : `${displayUrl} — failed`}
      </Text>
    </Group>
  )
}

// ─── Brand preview card ──────────────────────────────────────────────────

function BrandPreviewCard({
  brandKit,
}: {
  brandKit:
    | {
        logoUrl?: string
        tagline?: string
        websiteUrl?: string
        name?: string
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
            {brandKit?.name ?? "Here's what we found"}
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
