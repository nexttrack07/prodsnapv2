import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery as useConvexQuery, useMutation as useConvexMutation, useAction } from 'convex/react'
import { useState, useEffect } from 'react'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import {
  Container,
  SimpleGrid,
  Paper,
  Title,
  Text,
  Box,
  Group,
  Stack,
  Button,
  Checkbox,
  Badge,
  Image,
  AspectRatio,
  Code,
  ScrollArea,
  CopyButton,
  ActionIcon,
  Tooltip,
  Modal,
  Textarea,
  Accordion,
  Skeleton,
  Alert,
  ThemeIcon,
  Tabs,
  Anchor,
  Breadcrumbs,
  UnstyledButton,
} from '@mantine/core'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import {
  IconFlask2,
  IconClipboard,
  IconCheck,
  IconDownload,
  IconPhoto,
  IconSparkles,
  IconRefresh,
  IconAlertCircle,
  IconAlignLeft,
  IconPalette,
} from '@tabler/icons-react'

// ─── Route ────────────────────────────────────────────────────────────────────

type PlaygroundSearch = {
  runId?: string
}

export const Route = createFileRoute('/admin/playground')({
  validateSearch: (search: Record<string, unknown>): PlaygroundSearch => {
    return {
      runId: typeof search.runId === 'string' ? search.runId : undefined,
    }
  },
  component: PlaygroundPage,
})

// ─── Types ────────────────────────────────────────────────────────────────────

type Generation = {
  _id: Id<'templateGenerations'>
  outputUrl?: string
  productName?: string
  productUserId?: string
  mode?: string
  aspectRatio?: string
  createdAt: number
  productImageUrl?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseAspectRatio(ar: string | undefined): number {
  if (!ar) return 1
  const [w, h] = ar.split(':').map(Number)
  if (!w || !h) return 1
  return w / h
}

function formatAspectRatio(ar: string | undefined): number {
  return parseAspectRatio(ar)
}

function statusColor(status: string): string {
  switch (status) {
    case 'draft': return 'gray'
    case 'composing': return 'blue'
    case 'composed': return 'cyan'
    case 'generating': return 'orange'
    case 'complete': return 'green'
    case 'failed': return 'red'
    default: return 'gray'
  }
}

function msToSecs(ms?: number): string {
  if (!ms) return '—'
  return `${(ms / 1000).toFixed(1)}s`
}

// ─── Lightbox Modal ───────────────────────────────────────────────────────────

function LightboxModal({ src, opened, onClose }: { src: string; opened: boolean; onClose: () => void }) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="auto"
      centered
      withCloseButton
      styles={{
        header: { backgroundColor: 'var(--mantine-color-dark-8)' },
        body: { backgroundColor: 'var(--mantine-color-dark-8)', padding: 8 },
      }}
    >
      <Image src={src} maw="90vw" mah="90vh" fit="contain" radius="md" />
    </Modal>
  )
}

// ─── Generation thumbnail card ─────────────────────────────────────────────

function GenerationCard({
  gen,
  selected,
  onSelect,
}: {
  gen: Generation
  selected: boolean
  onSelect: () => void
}) {
  const ratio = formatAspectRatio(gen.aspectRatio)
  const [hovered, setHovered] = useState(false)
  const [lightboxOpen, { open: openLightbox, close: closeLightbox }] = useDisclosure(false)

  return (
    <>
      {gen.outputUrl && (
        <LightboxModal src={gen.outputUrl} opened={lightboxOpen} onClose={closeLightbox} />
      )}
      <Box
        style={{
          borderRadius: 'var(--mantine-radius-lg)',
          overflow: 'hidden',
          border: `2px solid ${selected ? 'var(--mantine-color-brand-5)' : 'var(--mantine-color-dark-5)'}`,
          boxShadow: selected ? '0 0 0 3px rgba(84, 116, 180, 0.3)' : 'none',
          transition: 'all 200ms ease',
          cursor: 'pointer',
          backgroundColor: 'var(--mantine-color-dark-7)',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <Box style={{ position: 'relative' }}>
          <AspectRatio ratio={ratio}>
            {gen.outputUrl ? (
              <Image
                src={gen.outputUrl}
                alt={gen.productName ?? 'Generation'}
                fit="cover"
                radius={0}
              />
            ) : (
              <Box
                style={{
                  backgroundColor: 'var(--mantine-color-dark-6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <IconPhoto size={32} color="var(--mantine-color-dark-3)" />
              </Box>
            )}
          </AspectRatio>

          {/* Hover overlay */}
          {hovered && gen.outputUrl && (
            <Box
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: 'rgba(0,0,0,0.55)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <Button
                size="xs"
                color="brand"
                fz="sm"
                onClick={(e) => { e.stopPropagation(); onSelect() }}
              >
                Use as source
              </Button>
              <ActionIcon
                variant="subtle"
                color="white"
                onClick={(e) => { e.stopPropagation(); openLightbox() }}
              >
                <IconPhoto size={16} />
              </ActionIcon>
            </Box>
          )}
        </Box>

        {/* Metadata row */}
        <Box p={8}>
          <Group justify="space-between" gap={4} wrap="nowrap">
            <Text size="xs" fw={500} c="white" truncate style={{ maxWidth: '60%' }}>
              {gen.productName ?? 'Unknown product'}
            </Text>
            {gen.mode && (
              <Badge size="xs" variant="light" color="brand">{gen.mode}</Badge>
            )}
          </Group>
          <Group gap={6} mt={4}>
            <Text size="xs" c="dark.3">
              {gen.productUserId ? gen.productUserId.slice(0, 8) : '—'}
            </Text>
            {gen.aspectRatio && (
              <Text size="xs" c="dark.3">{gen.aspectRatio}</Text>
            )}
          </Group>
        </Box>
      </Box>
    </>
  )
}

// ─── Browse Tab ───────────────────────────────────────────────────────────────

function BrowseTab({
  selectedId,
  onSelect,
}: {
  selectedId: Id<'templateGenerations'> | null
  onSelect: (gen: Generation) => void
}) {
  const generations = useConvexQuery(api.admin.playground.listAllGenerations)

  if (generations === undefined) {
    return (
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} height={200} radius="lg" />
        ))}
      </SimpleGrid>
    )
  }

  if (generations.length === 0) {
    return (
      <Box ta="center" py={48}>
        <ThemeIcon size={48} radius="xl" variant="light" color="dark" mb="md">
          <IconPhoto size={24} />
        </ThemeIcon>
        <Text c="dark.2" size="sm">No completed generations found</Text>
      </Box>
    )
  }

  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
      {generations.map((gen) => (
        <GenerationCard
          key={gen._id}
          gen={gen as Generation}
          selected={selectedId === gen._id}
          onSelect={() => onSelect(gen as Generation)}
        />
      ))}
    </SimpleGrid>
  )
}

// ─── History Tab ─────────────────────────────────────────────────────────────

function HistoryTab({ onOpenRun }: { onOpenRun: (runId: string) => void }) {
  const runs = useConvexQuery(api.admin.playground.listMyDebugRuns)

  if (runs === undefined) {
    return (
      <Stack gap="xs">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} height={56} radius="md" />
        ))}
      </Stack>
    )
  }

  if (runs.length === 0) {
    return (
      <Box ta="center" py={48}>
        <Text c="dark.2" size="sm">No runs yet — create one from the Browse tab</Text>
      </Box>
    )
  }

  return (
    <Stack gap="xs">
      {runs.map((run) => (
        <UnstyledButton
          key={run._id}
          onClick={() => onOpenRun(run._id)}
          style={{ width: '100%' }}
        >
          <Paper
            p="sm"
            radius="md"
            withBorder
            style={{
              borderColor: 'var(--mantine-color-dark-5)',
              backgroundColor: 'var(--mantine-color-dark-7)',
              transition: 'border-color 150ms ease',
            }}
          >
            <Group justify="space-between" wrap="nowrap">
              <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                <Group gap="xs">
                  <Badge size="xs" color={statusColor(run.status)} variant="light">
                    {run.status}
                  </Badge>
                  <Text size="xs" c="dark.2" truncate>
                    Source: {run.sourceGenerationId.slice(-8)}
                  </Text>
                </Group>
                <Text size="xs" c="dark.3">
                  {new Date(run.createdAt).toLocaleString()}
                </Text>
              </Stack>
              {run.generatorOutputUrl && (
                <Image
                  src={run.generatorOutputUrl}
                  w={44}
                  h={44}
                  fit="cover"
                  radius="sm"
                  style={{ flexShrink: 0 }}
                />
              )}
            </Group>
          </Paper>
        </UnstyledButton>
      ))}
    </Stack>
  )
}

// ─── Stage 0 — Source ─────────────────────────────────────────────────────────

function Stage0Source({
  source,
  onClear,
}: {
  source: Generation | null
  onClear: () => void
}) {
  return (
    <Paper
      radius="md"
      p="md"
      withBorder
      style={{
        borderColor: 'var(--mantine-color-dark-5)',
        backgroundColor: 'var(--mantine-color-dark-7)',
      }}
    >
      <Group justify="space-between" mb="sm">
        <Text size="sm" fw={500} c="white">Stage 1 — Source generation</Text>
        {source && (
          <Button size="xs" variant="subtle" color="gray" onClick={onClear}>
            Clear
          </Button>
        )}
      </Group>

      {!source ? (
        <Box ta="center" py={24}>
          <ThemeIcon size={40} radius="xl" variant="light" color="dark" mb="sm">
            <IconPhoto size={20} />
          </ThemeIcon>
          <Text size="sm" c="dark.2">Pick a generation from the Browse tab</Text>
        </Box>
      ) : (
        <Group align="flex-start" gap="md">
          {source.outputUrl && (
            <Box style={{ width: 80, flexShrink: 0 }}>
              <AspectRatio ratio={formatAspectRatio(source.aspectRatio)}>
                <Image src={source.outputUrl} fit="cover" radius="sm" />
              </AspectRatio>
            </Box>
          )}
          <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
            <Text size="sm" fw={500} c="white">{source.productName ?? 'Unknown product'}</Text>
            <Text size="xs" c="dark.2">User: {source.productUserId?.slice(0, 12) ?? '—'}</Text>
            <Group gap="xs">
              {source.mode && <Badge size="xs" variant="light" color="brand">{source.mode}</Badge>}
              {source.aspectRatio && <Badge size="xs" variant="outline" color="dark">{source.aspectRatio}</Badge>}
            </Group>
            <Text size="xs" c="dark.3">{new Date(source.createdAt).toLocaleString()}</Text>
          </Stack>
        </Group>
      )}
    </Paper>
  )
}

// ─── Stage 1 — Compose prompt ─────────────────────────────────────────────────

function Stage1Compose({
  source,
  runId,
  run,
  onRunCreated,
  editedPrompt,
  setEditedPrompt,
}: {
  source: Generation | null
  runId: string | null
  run: Record<string, unknown> | null | undefined
  onRunCreated: (runId: string) => void
  editedPrompt: string | null
  setEditedPrompt: (value: string | null) => void
}) {
  const [changeText, setChangeText] = useState(false)
  const [changeIcons, setChangeIcons] = useState(false)
  const [changeColors, setChangeColors] = useState(false)
  const [sourceChecked, setSourceChecked] = useState(true)
  const [productChecked, setProductChecked] = useState(true)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const createDebugRun = useConvexMutation(api.admin.playground.createDebugRun)
  const runComposer = useAction(api.admin.playgroundActions.runComposer)

  const hasChanges = changeText || changeIcons || changeColors
  const checkedImages = [
    sourceChecked && source?.outputUrl ? { url: source.outputUrl, label: 'source' } : null,
    productChecked && source?.productImageUrl ? { url: source.productImageUrl, label: 'product' } : null,
  ].filter(Boolean) as { url: string; label: string }[]

  const composerPrompt = run?.composerPrompt as string | undefined
  const effectivePrompt = editedPrompt ?? composerPrompt ?? ''

  const isComposing = run?.status === 'composing'
  const hasComposerResult = run && (run.status === 'composed' || run.status === 'generating' || run.status === 'complete' || run.status === 'failed')
  const composerError = run?.composerError as string | undefined
  const systemPrompt = run?.composerSystemPrompt as string | undefined
  const userPrompt = run?.composerUserPrompt as string | undefined

  async function handleCreateAndCompose() {
    if (!source) return
    if (!hasChanges) {
      notifications.show({ title: 'Error', message: 'Select at least one thing to change', color: 'red' })
      return
    }
    if (checkedImages.length === 0) {
      notifications.show({ title: 'Error', message: 'Select at least one image', color: 'red' })
      return
    }
    setIsCreating(true)
    try {
      const { runId: newRunId } = await createDebugRun({
        sourceGenerationId: source._id,
        changeText,
        changeIcons,
        changeColors,
        composerImageUrls: checkedImages.map((i) => i.url),
        composerImageLabels: checkedImages.map((i) => i.label),
      })
      onRunCreated(newRunId)
      // Fire-and-forget — UI subscribes reactively
      runComposer({ runId: newRunId }).catch((err: unknown) => {
        notifications.show({
          title: 'Composer error',
          message: err instanceof Error ? err.message : 'Composer failed',
          color: 'red',
        })
      })
    } catch (err) {
      notifications.show({
        title: 'Error',
        message: err instanceof Error ? err.message : 'Failed to create run',
        color: 'red',
      })
    } finally {
      setIsCreating(false)
    }
  }

  const disabled = !source

  return (
    <>
      {lightboxSrc && (
        <LightboxModal src={lightboxSrc} opened={!!lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
      <Paper
        radius="md"
        p="md"
        withBorder
        style={{
          borderColor: disabled ? 'var(--mantine-color-dark-6)' : 'var(--mantine-color-dark-5)',
          backgroundColor: 'var(--mantine-color-dark-7)',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Text size="sm" fw={500} c="white" mb="md">Stage 2 — Compose prompt</Text>

        {/* Pre-run UI — only when no run exists yet */}
        {!runId && (
          <Stack gap="md">
            {/* What to change checkboxes */}
            <Box>
              <Text size="xs" fw={500} c="dark.2" mb="xs">What to change?</Text>
              <Stack gap="xs">
                <Checkbox
                  checked={changeText}
                  onChange={(e) => setChangeText(e.currentTarget.checked)}
                  disabled={disabled}
                  label={
                    <Group gap="xs">
                      <IconAlignLeft size={14} color="var(--mantine-color-dark-2)" />
                      <Box>
                        <Text fw={500} size="sm">Text</Text>
                        <Text size="xs" c="dark.2">Generate new headlines, copy, and messaging</Text>
                      </Box>
                    </Group>
                  }
                  styles={{
                    root: {
                      padding: 'var(--mantine-spacing-xs)',
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
                  disabled={disabled}
                  label={
                    <Group gap="xs">
                      <IconPhoto size={14} color="var(--mantine-color-dark-2)" />
                      <Box>
                        <Text fw={500} size="sm">Icons & Graphics</Text>
                        <Text size="xs" c="dark.2">Replace icons, badges, and decorative elements</Text>
                      </Box>
                    </Group>
                  }
                  styles={{
                    root: {
                      padding: 'var(--mantine-spacing-xs)',
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
                  disabled={disabled}
                  label={
                    <Group gap="xs">
                      <IconPalette size={14} color="var(--mantine-color-dark-2)" />
                      <Box>
                        <Text fw={500} size="sm">Colors</Text>
                        <Text size="xs" c="dark.2">Adjust color scheme and tones</Text>
                      </Box>
                    </Group>
                  }
                  styles={{
                    root: {
                      padding: 'var(--mantine-spacing-xs)',
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

            {/* Images to pass to composer */}
            {source && (
              <Box>
                <Text size="xs" fw={500} c="dark.2" mb="xs">Images passed to composer</Text>
                <Stack gap="xs">
                  {source.outputUrl && (
                    <Group gap="sm" align="center">
                      <Checkbox
                        checked={sourceChecked}
                        onChange={(e) => setSourceChecked(e.currentTarget.checked)}
                      />
                      <Image src={source.outputUrl} w={40} h={40} fit="cover" radius="sm" />
                      <Badge size="xs" variant="outline" color="brand">source</Badge>
                    </Group>
                  )}
                  {source.productImageUrl && (
                    <Group gap="sm" align="center">
                      <Checkbox
                        checked={productChecked}
                        onChange={(e) => setProductChecked(e.currentTarget.checked)}
                      />
                      <Image src={source.productImageUrl} w={40} h={40} fit="cover" radius="sm" />
                      <Badge size="xs" variant="outline" color="cyan">product</Badge>
                    </Group>
                  )}
                </Stack>
              </Box>
            )}

            <Button
              color="brand"
              fz="sm"
              disabled={!hasChanges || checkedImages.length === 0 || !source}
              loading={isCreating}
              leftSection={!isCreating && <IconSparkles size={16} />}
              onClick={handleCreateAndCompose}
            >
              Create run & Compose
            </Button>
          </Stack>
        )}

        {/* Loading skeleton while composing */}
        {isComposing && (
          <Stack gap="sm">
            <Group gap="xs">
              <Skeleton height={16} width={80} radius="sm" />
              <Text size="xs" c="dark.2">Composing…</Text>
            </Group>
            <Skeleton height={60} radius="sm" />
            <Skeleton height={120} radius="sm" />
          </Stack>
        )}

        {/* Post-run composer results */}
        {hasComposerResult && run && (
          <Stack gap="md">
            {/* Duration pill */}
            <Group gap="xs">
              <Badge size="sm" variant="light" color={composerError ? 'red' : 'green'}>
                {msToSecs(run.composerDurationMs as number | undefined)}
              </Badge>
              <Text size="xs" c="dark.3">gemini-2.5-flash</Text>
            </Group>

            {/* Error banner */}
            {composerError && (
              <Alert color="red" icon={<IconAlertCircle size={16} />} radius="md">
                <Text size="xs">{composerError}</Text>
              </Alert>
            )}

            <Accordion
              multiple
              defaultValue={['output', 'images']}
              variant="separated"
              radius="md"
              styles={{
                item: {
                  backgroundColor: 'var(--mantine-color-dark-8)',
                  borderColor: 'var(--mantine-color-dark-5)',
                },
              }}
            >
              {systemPrompt && (
                <Accordion.Item value="system">
                  <Accordion.Control>
                    <Text size="xs" fw={500} c="white">System prompt</Text>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Group gap="xs" mb="xs" justify="flex-end">
                      <CopyButton value={systemPrompt}>
                        {({ copied, copy }) => (
                          <Tooltip label={copied ? 'Copied!' : 'Copy'}>
                            <ActionIcon size="sm" variant="subtle" color={copied ? 'green' : 'gray'} onClick={copy}>
                              {copied ? <IconCheck size={13} /> : <IconClipboard size={13} />}
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </CopyButton>
                    </Group>
                    <ScrollArea.Autosize mah={300}>
                      <Code block style={{ fontSize: 11 }}>{systemPrompt}</Code>
                    </ScrollArea.Autosize>
                  </Accordion.Panel>
                </Accordion.Item>
              )}

              {userPrompt && (
                <Accordion.Item value="user">
                  <Accordion.Control>
                    <Text size="xs" fw={500} c="white">User prompt</Text>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Group gap="xs" mb="xs" justify="flex-end">
                      <CopyButton value={userPrompt}>
                        {({ copied, copy }) => (
                          <Tooltip label={copied ? 'Copied!' : 'Copy'}>
                            <ActionIcon size="sm" variant="subtle" color={copied ? 'green' : 'gray'} onClick={copy}>
                              {copied ? <IconCheck size={13} /> : <IconClipboard size={13} />}
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </CopyButton>
                    </Group>
                    <ScrollArea.Autosize mah={200}>
                      <Code block style={{ fontSize: 11 }}>{userPrompt}</Code>
                    </ScrollArea.Autosize>
                  </Accordion.Panel>
                </Accordion.Item>
              )}

              <Accordion.Item value="images">
                <Accordion.Control>
                  <Text size="xs" fw={500} c="white">Input images</Text>
                </Accordion.Control>
                <Accordion.Panel>
                  <InputImageRow
                    urls={run.composerImageUrls as string[]}
                    labels={run.composerImageLabels as string[]}
                  />
                </Accordion.Panel>
              </Accordion.Item>

              <Accordion.Item value="output">
                <Accordion.Control>
                  <Text size="xs" fw={500} c="white">Composer output (editable)</Text>
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="xs">
                    <Textarea
                      value={effectivePrompt}
                      onChange={(e) => setEditedPrompt(e.currentTarget.value)}
                      autosize
                      minRows={4}
                      styles={{
                        input: {
                          fontFamily: 'monospace',
                          fontSize: 12,
                          backgroundColor: 'var(--mantine-color-dark-6)',
                        },
                      }}
                    />
                    {editedPrompt !== null && editedPrompt !== composerPrompt && (
                      <Button
                        size="xs"
                        variant="subtle"
                        color="gray"
                        leftSection={<IconRefresh size={12} />}
                        onClick={() => setEditedPrompt(null)}
                      >
                        Reset to composer output
                      </Button>
                    )}
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          </Stack>
        )}
      </Paper>
    </>
  )
}

// ─── Input Image Row helper ───────────────────────────────────────────────────

function InputImageRow({ urls, labels }: { urls: string[]; labels: string[] }) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  return (
    <>
      {lightboxSrc && (
        <LightboxModal src={lightboxSrc} opened={!!lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
      <Group gap="md">
        {urls.map((url, i) => (
          <Stack key={i} align="center" gap={4}>
            <UnstyledButton onClick={() => setLightboxSrc(url)}>
              <Image src={url} w={64} h={64} fit="cover" radius="sm" />
            </UnstyledButton>
            <Badge size="xs" variant="outline" color={labels[i] === 'source' ? 'brand' : 'cyan'}>
              {labels[i] ?? i}
            </Badge>
          </Stack>
        ))}
      </Group>
    </>
  )
}

// ─── Stage 2 — Generate image ─────────────────────────────────────────────────

function Stage2Generate({
  run,
  editedPromptFromStage1,
}: {
  run: Record<string, unknown> | null | undefined
  editedPromptFromStage1: string
}) {
  const [srcChecked, setSrcChecked] = useState(true)
  const [prodChecked, setProdChecked] = useState(true)
  const [lightboxOpen, { open: openLightbox, close: closeLightbox }] = useDisclosure(false)
  const [isGenerating, setIsGenerating] = useState(false)

  const runGenerator = useAction(api.admin.playgroundActions.runGenerator)

  const hasPrompt = !!editedPromptFromStage1.trim()
  const isEnabled = hasPrompt && !!run && run.status !== 'draft' && run.status !== 'composing'

  const composerImageUrls = (run?.composerImageUrls as string[] | undefined) ?? []
  const composerImageLabels = (run?.composerImageLabels as string[] | undefined) ?? []

  const sourceUrl = composerImageUrls[composerImageLabels.indexOf('source')]
  const productUrl = composerImageUrls[composerImageLabels.indexOf('product')]

  const imageOptions = [
    sourceUrl ? { url: sourceUrl, label: 'source', checked: srcChecked, setChecked: setSrcChecked } : null,
    productUrl ? { url: productUrl, label: 'product', checked: prodChecked, setChecked: setProdChecked } : null,
  ].filter(Boolean) as { url: string; label: string; checked: boolean; setChecked: (v: boolean) => void }[]

  const checkedImages = imageOptions.filter((i) => i.checked)

  async function handleGenerate() {
    if (!run || !isEnabled) return
    if (checkedImages.length === 0) {
      notifications.show({ title: 'Error', message: 'Select at least one image', color: 'red' })
      return
    }
    setIsGenerating(true)
    try {
      await runGenerator({
        runId: run._id as Id<'adminDebugRuns'>,
        editedPrompt: editedPromptFromStage1 !== (run.composerPrompt as string | undefined) ? editedPromptFromStage1 : undefined,
        generatorImageUrls: checkedImages.map((i) => i.url),
        generatorImageLabels: checkedImages.map((i) => i.label),
      })
    } catch (err) {
      notifications.show({
        title: 'Generator error',
        message: err instanceof Error ? err.message : 'Generation failed',
        color: 'red',
      })
    } finally {
      setIsGenerating(false)
    }
  }

  const isGeneratingStatus = run?.status === 'generating'
  const hasOutput = run?.status === 'complete' || run?.generatorOutputUrl
  const generatorError = run?.generatorError as string | undefined
  const outputUrl = run?.generatorOutputUrl as string | undefined

  return (
    <>
      {outputUrl && (
        <LightboxModal src={outputUrl} opened={lightboxOpen} onClose={closeLightbox} />
      )}
      <Paper
        radius="md"
        p="md"
        withBorder
        style={{
          borderColor: isEnabled ? 'var(--mantine-color-dark-5)' : 'var(--mantine-color-dark-6)',
          backgroundColor: 'var(--mantine-color-dark-7)',
          opacity: isEnabled ? 1 : 0.5,
        }}
      >
        <Text size="sm" fw={500} c="white" mb="md">Stage 3 — Generate image</Text>

        {!isEnabled && (
          <Text size="xs" c="dark.3">Complete Stage 2 (compose) first to unlock generation.</Text>
        )}

        {isEnabled && !hasOutput && !isGeneratingStatus && (
          <Stack gap="md">
            {/* Prompt reflection */}
            <Box>
              <Text size="xs" fw={500} c="dark.2" mb="xs">Prompt to send</Text>
              <ScrollArea.Autosize mah={120}>
                <Code block style={{ fontSize: 11 }}>{editedPromptFromStage1}</Code>
              </ScrollArea.Autosize>
            </Box>

            {/* Image checkboxes */}
            {imageOptions.length > 0 && (
              <Box>
                <Text size="xs" fw={500} c="dark.2" mb="xs">Images to pass to image model</Text>
                <Stack gap="xs">
                  {imageOptions.map((img) => (
                    <Group key={img.label} gap="sm" align="center">
                      <Checkbox
                        checked={img.checked}
                        onChange={(e) => img.setChecked(e.currentTarget.checked)}
                      />
                      <Image src={img.url} w={40} h={40} fit="cover" radius="sm" />
                      <Badge size="xs" variant="outline" color={img.label === 'source' ? 'brand' : 'cyan'}>
                        {img.label}
                      </Badge>
                    </Group>
                  ))}
                </Stack>
              </Box>
            )}

            <Button
              color="brand"
              fz="sm"
              disabled={checkedImages.length === 0}
              loading={isGenerating}
              leftSection={!isGenerating && <IconSparkles size={16} />}
              onClick={handleGenerate}
            >
              Generate image
            </Button>
          </Stack>
        )}

        {/* Generating skeleton */}
        {isGeneratingStatus && (
          <Stack gap="sm">
            <Group gap="xs">
              <Skeleton height={16} width={80} radius="sm" />
              <Text size="xs" c="dark.2">Generating…</Text>
            </Group>
            <Skeleton height={300} radius="md" />
          </Stack>
        )}

        {/* Output */}
        {(hasOutput || generatorError) && run && (
          <Stack gap="md">
            {/* Duration pill */}
            <Group gap="xs">
              <Badge size="sm" variant="light" color={generatorError ? 'red' : 'green'}>
                {msToSecs(run.generatorDurationMs as number | undefined)}
              </Badge>
              <Text size="xs" c="dark.3">fal-ai/nano-banana-2/edit</Text>
            </Group>

            {generatorError && (
              <Alert color="red" icon={<IconAlertCircle size={16} />} radius="md">
                <Text size="xs">{generatorError}</Text>
              </Alert>
            )}

            {outputUrl && (
              <Stack gap="xs">
                <UnstyledButton onClick={openLightbox}>
                  <Image src={outputUrl} radius="md" fit="contain" mah={400} />
                </UnstyledButton>
                <Group gap="xs">
                  <Button
                    component="a"
                    href={outputUrl}
                    download
                    size="xs"
                    variant="light"
                    color="brand"
                    leftSection={<IconDownload size={14} />}
                  >
                    Download
                  </Button>
                </Group>
              </Stack>
            )}

            <Accordion
              variant="separated"
              radius="md"
              styles={{
                item: {
                  backgroundColor: 'var(--mantine-color-dark-8)',
                  borderColor: 'var(--mantine-color-dark-5)',
                },
              }}
            >
              {!!(run.generatorPromptUsed) && (
                <Accordion.Item value="prompt">
                  <Accordion.Control>
                    <Text size="xs" fw={500} c="white">Prompt that was sent</Text>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <ScrollArea.Autosize mah={200}>
                      <Code block style={{ fontSize: 11 }}>{String(run.generatorPromptUsed)}</Code>
                    </ScrollArea.Autosize>
                  </Accordion.Panel>
                </Accordion.Item>
              )}

              {!!(run.generatorRawResponse) && (
                <Accordion.Item value="raw">
                  <Accordion.Control>
                    <Text size="xs" fw={500} c="white">Raw response</Text>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <ScrollArea.Autosize mah={300}>
                      <Code block style={{ fontSize: 11 }}>
                        {JSON.stringify(run.generatorRawResponse, null, 2)}
                      </Code>
                    </ScrollArea.Autosize>
                  </Accordion.Panel>
                </Accordion.Item>
              )}
            </Accordion>
          </Stack>
        )}
      </Paper>
    </>
  )
}

// ─── Run Editor (right column) ────────────────────────────────────────────────

function RunEditor({
  source,
  onClearSource,
  runId,
  onRunCreated,
}: {
  source: Generation | null
  onClearSource: () => void
  runId: string | null
  onRunCreated: (runId: string) => void
}) {
  const run = useConvexQuery(
    api.admin.playground.getDebugRun,
    runId ? { runId: runId as Id<'adminDebugRuns'> } : 'skip',
  )

  const [editedPrompt, setEditedPrompt] = useState<string | null>(null)

  // Reset prompt edits whenever the active run changes
  useEffect(() => {
    setEditedPrompt(null)
  }, [runId])

  const runAsRecord = run as Record<string, unknown> | null | undefined
  const composerPrompt = runAsRecord?.composerPrompt as string | undefined
  const effectivePrompt = editedPrompt ?? composerPrompt ?? ''

  return (
    <Stack gap="md">
      <Stage0Source source={source} onClear={onClearSource} />
      <Stage1Compose
        source={source}
        runId={runId}
        run={runAsRecord}
        onRunCreated={onRunCreated}
        editedPrompt={editedPrompt}
        setEditedPrompt={setEditedPrompt}
      />
      <Stage2Generate
        run={runAsRecord}
        editedPromptFromStage1={effectivePrompt}
      />
    </Stack>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

function PlaygroundPage() {
  const navigate = Route.useNavigate()
  const { runId } = Route.useSearch()

  const [selectedSource, setSelectedSource] = useState<Generation | null>(null)

  function handleRunCreated(newRunId: string) {
    navigate({ search: { runId: newRunId } })
  }

  function handleOpenRun(id: string) {
    navigate({ search: { runId: id } })
  }

  return (
    <Container size="xl" py={40}>
      {/* Header */}
      <Paper
        radius="lg"
        p="xl"
        mb={32}
        style={{
          background: 'linear-gradient(135deg, rgba(84, 116, 180, 0.12) 0%, rgba(84, 116, 180, 0.04) 100%)',
          border: '1px solid var(--mantine-color-dark-5)',
        }}
      >
        <Breadcrumbs mb={8}>
          <Anchor component={Link} to="/admin" size="sm" c="dark.2">
            Admin
          </Anchor>
          <Text size="sm" c="dark.1">Variation Playground</Text>
        </Breadcrumbs>
        <Group gap="sm" align="center">
          <ThemeIcon
            size={40}
            radius="lg"
            variant="gradient"
            gradient={{ from: 'brand.7', to: 'brand.5', deg: 135 }}
          >
            <IconFlask2 size={20} />
          </ThemeIcon>
          <Box>
            <Title order={1} fz={28} fw={600} c="white">Variation Playground</Title>
            <Text c="dark.2" size="sm">
              Re-run any user's variation flow with full visibility into prompts and inputs.
            </Text>
          </Box>
        </Group>
      </Paper>

      {/* Two-column layout */}
      <SimpleGrid
        cols={{ base: 1, sm: 2 }}
        spacing="xl"
        style={{ alignItems: 'start' }}
      >
        {/* Left: Browse / History tabs (40%) */}
        <Box style={{ '--col-span': '2 / 5' }}>
          <Paper
            radius="lg"
            p="md"
            withBorder
            style={{
              borderColor: 'var(--mantine-color-dark-5)',
              backgroundColor: 'var(--mantine-color-dark-8)',
            }}
          >
            <Tabs defaultValue="browse" keepMounted={false}>
              <Tabs.List mb="md">
                <Tabs.Tab value="browse" fz="sm">Browse</Tabs.Tab>
                <Tabs.Tab value="history" fz="sm">History</Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="browse">
                <ScrollArea.Autosize mah="70vh">
                  <BrowseTab
                    selectedId={selectedSource?._id ?? null}
                    onSelect={(gen) => setSelectedSource(gen)}
                  />
                </ScrollArea.Autosize>
              </Tabs.Panel>

              <Tabs.Panel value="history">
                <ScrollArea.Autosize mah="70vh">
                  <HistoryTab onOpenRun={handleOpenRun} />
                </ScrollArea.Autosize>
              </Tabs.Panel>
            </Tabs>
          </Paper>
        </Box>

        {/* Right: Run editor (60%) */}
        <Box>
          <RunEditor
            source={selectedSource}
            onClearSource={() => setSelectedSource(null)}
            runId={runId ?? null}
            onRunCreated={handleRunCreated}
          />
        </Box>
      </SimpleGrid>
    </Container>
  )
}
