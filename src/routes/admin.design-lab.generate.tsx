import { useState, useRef, useEffect } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useAction, useMutation } from 'convex/react'
import { useLocalStorage } from '@mantine/hooks'
import { api } from '../../convex/_generated/api'
import {
  Container, Stack, Group, Text, Title, Button, Paper, Textarea,
  SimpleGrid, ActionIcon, Tooltip, Image, Center, Loader, Alert,
  Checkbox, Badge,
} from '@mantine/core'
import {
  IconPlus, IconSparkles, IconUpload, IconX, IconCheck,
  IconAlertCircle, IconArrowLeft, IconPlayerPlay, IconRefresh, IconTrash,
} from '@tabler/icons-react'

export const Route = createFileRoute('/admin/design-lab/generate')({
  validateSearch: (search: Record<string, unknown>): { ref?: string } =>
    typeof search.ref === 'string' && search.ref ? { ref: search.ref } : {},
  component: BatchGenerate,
})

// ─── Types ────────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 11)

const toBase64 = (file: File): Promise<string> =>
  new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res((r.result as string).split(',')[1])
    r.onerror = rej
    r.readAsDataURL(file)
  })

type GenStatus = 'idle' | 'uploading' | 'generating' | 'review' | 'approving' | 'approved' | 'error'

type GenRef = {
  id: string
  file: File | null     // null when the ref is a remote URL (e.g. seeded from the library)
  previewUrl: string    // object URL for files, or the remote URL directly
  r2Url: string | null  // set immediately for remote refs; set after upload for files
}

// Snapshot of everything needed to persist an approved design, captured at
// generation time so a later change to the shared prompt can't affect it.
type SavePayload = {
  prompt: string
  promptTitle: string
  conceptTitle: string
  referenceImageUrls: string[]
  nicheDescription?: string
}

type GenCard = {
  id: string
  prompt: string
  references: GenRef[]
  status: GenStatus
  preview: { imageUrl: string; storageKey: string } | null
  savePayload: SavePayload | null
  selected: boolean
  error: string | null
}

function makeCard(seedRefUrl: string | null = null): GenCard {
  return {
    id: uid(),
    prompt: '',
    references: seedRefUrl
      ? [{ id: uid(), file: null, previewUrl: seedRefUrl, r2Url: seedRefUrl }]
      : [],
    status: 'idle',
    preview: null,
    savePayload: null,
    selected: false,
    error: null,
  }
}

// ─── Main page ────────────────────────────────────────────────────────────────

function BatchGenerate() {
  const { ref: seedRef } = Route.useSearch()
  const [sharedPrompt, setSharedPrompt] = useLocalStorage({
    key: 'prodsnap-generate-shared-prompt',
    defaultValue: '',
  })
  const [cards, setCards] = useState<GenCard[]>(() => [makeCard(seedRef ?? null)])

  const uploadImage = useAction(api.r2.uploadProductImage)
  const generatePreview = useAction(api.designLabActions.generateDesignPreview)
  const approvePreview = useMutation(api.designLab.approveDesignPreview)
  const discardPreview = useMutation(api.designLab.discardDesignPreview)

  const updateCard = (id: string, patch: Partial<GenCard>) =>
    setCards(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))

  const handlePromptChange = (id: string, prompt: string) => {
    setCards(prev => {
      const updated = prev.map(c => c.id === id ? { ...c, prompt } : c)
      const last = updated[updated.length - 1]
      if (last && (last.prompt.trim() || last.status !== 'idle')) {
        return [...updated, makeCard(seedRef ?? null)]
      }
      return updated
    })
  }

  const addCard = () => setCards(prev => [...prev, makeCard(seedRef ?? null)])

  const removeCard = (id: string) => {
    setCards(prev => {
      const card = prev.find(c => c.id === id)
      card?.references.forEach(r => { if (r.file) URL.revokeObjectURL(r.previewUrl) })
      return prev.filter(c => c.id !== id)
    })
  }

  const addReference = (id: string, file: File) => {
    setCards(prev => prev.map(c => c.id === id
      ? {
          ...c,
          references: [
            ...c.references,
            { id: uid(), file, previewUrl: URL.createObjectURL(file), r2Url: null },
          ],
        }
      : c))
  }

  const removeReference = (id: string, refId: string) => {
    setCards(prev => prev.map(c => {
      if (c.id !== id) return c
      const ref = c.references.find(r => r.id === refId)
      if (ref?.file) URL.revokeObjectURL(ref.previewUrl)
      return { ...c, references: c.references.filter(r => r.id !== refId) }
    }))
  }

  const generateCard = async (id: string) => {
    const card = cards.find(c => c.id === id)
    if (!card || !card.prompt.trim()) return

    const fullPrompt = sharedPrompt.trim()
      ? `${sharedPrompt.trim()}\n\n${card.prompt.trim()}`
      : card.prompt.trim()

    try {
      // Upload any references that are local files not yet on R2; remote refs
      // (e.g. the seeded library image) already have an r2Url.
      const needsUpload = card.references.some(r => r.file && !r.r2Url)
      if (needsUpload) updateCard(id, { status: 'uploading', error: null })

      const resolved: GenRef[] = []
      for (const ref of card.references) {
        if (ref.r2Url) { resolved.push(ref); continue }
        if (!ref.file) continue
        const base64 = await toBase64(ref.file)
        const { url } = await uploadImage({
          name: ref.file.name,
          contentType: ref.file.type,
          base64,
        })
        resolved.push({ ...ref, r2Url: url })
      }
      updateCard(id, { references: resolved })

      const referenceImageUrls = resolved
        .map(r => r.r2Url)
        .filter((u): u is string => !!u)

      // Snapshot the save payload now so a later shared-prompt edit can't change it.
      const savePayload: SavePayload = {
        prompt: fullPrompt,
        promptTitle: card.prompt.trim().slice(0, 60),
        conceptTitle: sharedPrompt.trim().slice(0, 60) || 'Batch Generate',
        referenceImageUrls,
        nicheDescription: sharedPrompt.trim() || undefined,
      }

      updateCard(id, { status: 'generating', error: null })
      const preview = await generatePreview({ prompt: fullPrompt, referenceImageUrls })
      updateCard(id, { status: 'review', preview, savePayload, selected: false })
    } catch (err) {
      updateCard(id, {
        status: 'error',
        error: err instanceof Error ? err.message : 'Generation failed',
      })
    }
  }

  const approveCard = async (id: string) => {
    const card = cards.find(c => c.id === id)
    if (!card || !card.preview || !card.savePayload) return
    updateCard(id, { status: 'approving', error: null })
    try {
      await approvePreview({
        ...card.savePayload,
        imageUrl: card.preview.imageUrl,
        storageKey: card.preview.storageKey,
      })
      updateCard(id, { status: 'approved', selected: false })
    } catch (err) {
      updateCard(id, { status: 'review', error: err instanceof Error ? err.message : 'Could not save' })
    }
  }

  // Dismiss: discard the unreviewed result, delete its R2 object, drop the card.
  const dismissCard = (id: string) => {
    const card = cards.find(c => c.id === id)
    if (card?.preview) discardPreview({ storageKey: card.preview.storageKey }).catch(() => {})
    card?.references.forEach(r => { if (r.file) URL.revokeObjectURL(r.previewUrl) })
    setCards(prev => prev.filter(c => c.id !== id))
  }

  // Redo: delete the old R2 object, then regenerate with the same prompt + refs.
  const redoCard = (id: string) => {
    const card = cards.find(c => c.id === id)
    if (card?.preview) discardPreview({ storageKey: card.preview.storageKey }).catch(() => {})
    updateCard(id, { status: 'idle', preview: null, savePayload: null, selected: false, error: null })
    generateCard(id)
  }

  const toggleCardSelected = (id: string) =>
    setCards(prev => prev.map(c => c.id === id ? { ...c, selected: !c.selected } : c))

  const reviewCards = cards.filter(c => c.status === 'review')
  const selectedReview = reviewCards.filter(c => c.selected)
  const allReviewSelected = reviewCards.length > 0 && selectedReview.length === reviewCards.length

  const toggleSelectAll = () =>
    setCards(prev => prev.map(c => c.status === 'review' ? { ...c, selected: !allReviewSelected } : c))

  const approveSelected = () => { selectedReview.forEach(c => approveCard(c.id)) }
  const dismissSelected = () => { selectedReview.slice().forEach(c => dismissCard(c.id)) }

  const generateAll = () => {
    const idle = cards.filter(c => c.status === 'idle' && c.prompt.trim())
    idle.forEach(c => generateCard(c.id))
  }

  const idleCount = cards.filter(c => c.status === 'idle' && c.prompt.trim()).length

  // Revoke object URLs on unmount
  useEffect(() => {
    return () => {
      // capture current cards at unmount time
      setCards(prev => {
        prev.forEach(c => {
          c.references.forEach(r => { if (r.file) URL.revokeObjectURL(r.previewUrl) })
          // Best-effort: don't leave un-reviewed previews orphaned in R2.
          if (c.status === 'review' && c.preview) {
            discardPreview({ storageKey: c.preview.storageKey }).catch(() => {})
          }
        })
        return prev
      })
    }
  }, [])

  return (
    <Container size="xl" py={40}>
      <Stack gap="xl">

        {/* Header */}
        <Group justify="space-between" align="flex-end">
          <div>
            <Title order={2} fw={600} c="white">Batch Generate</Title>
            <Text size="sm" c="dark.2" mt={4}>Generate multiple designs in parallel</Text>
          </div>
          <Group>
            {idleCount > 0 && (
              <Button
                onClick={generateAll}
                color="brand"
                leftSection={<IconSparkles size={16} />}
              >
                Generate all ({idleCount})
              </Button>
            )}
            <Button
              component={Link}
              to="/admin/design-lab"
              variant="subtle"
              color="dark.3"
              size="sm"
              leftSection={<IconArrowLeft size={14} />}
            >
              Design Library
            </Button>
          </Group>
        </Group>

        {/* Seed reference (from the library "Generate variations from this") */}
        {seedRef && (
          <Paper
            p="sm"
            radius="lg"
            withBorder
            style={{ borderColor: 'var(--mantine-color-brand-8)', backgroundColor: 'var(--mantine-color-dark-8)' }}
          >
            <Group gap="sm" wrap="nowrap">
              <Image
                src={seedRef}
                w={44}
                h={44}
                radius="sm"
                style={{ objectFit: 'contain', backgroundColor: '#fff', flexShrink: 0 }}
              />
              <Text size="sm" c="dark.1">
                Generating from this reference — it's pre-applied to every prompt below. Write a
                prompt per variation, then <strong>Generate all</strong>.
              </Text>
            </Group>
          </Paper>
        )}

        {/* Shared context */}
        <Paper
          p="md"
          radius="lg"
          withBorder
          style={{ borderColor: 'var(--mantine-color-dark-4)', backgroundColor: 'var(--mantine-color-dark-8)' }}
        >
          <Stack gap="xs">
            <Group gap="xs">
              <Text size="sm" fw={600} c="white">Shared context</Text>
              <Text size="xs" c="dark.3">· prepended to every prompt · saved to browser</Text>
            </Group>
            <Textarea
              placeholder="e.g. Flat vector illustration, print-on-demand t-shirt graphic, MTB / mountain biking niche, 2–3 colors max, no product mockup..."
              value={sharedPrompt}
              onChange={e => setSharedPrompt(e.currentTarget.value)}
              autosize
              minRows={2}
              maxRows={5}
              styles={{
                input: {
                  backgroundColor: 'var(--mantine-color-dark-7)',
                  color: 'var(--mantine-color-white)',
                  fontSize: 13,
                },
              }}
            />
          </Stack>
        </Paper>

        {/* Review toolbar — bulk approve / dismiss the pending previews */}
        {reviewCards.length > 0 && (
          <Paper
            p="sm"
            radius="lg"
            withBorder
            style={{ borderColor: 'var(--mantine-color-brand-8)', backgroundColor: 'var(--mantine-color-dark-8)' }}
          >
            <Group justify="space-between" wrap="wrap" gap="sm">
              <Group gap="sm">
                <Checkbox
                  checked={allReviewSelected}
                  indeterminate={selectedReview.length > 0 && !allReviewSelected}
                  onChange={toggleSelectAll}
                  label={`Select all (${reviewCards.length})`}
                  color="brand"
                />
                <Text size="sm" c="dark.2">
                  {selectedReview.length} selected · {reviewCards.length} awaiting review
                </Text>
              </Group>
              <Group gap="sm">
                <Button
                  size="compact-sm"
                  color="brand"
                  leftSection={<IconCheck size={14} />}
                  disabled={selectedReview.length === 0}
                  onClick={approveSelected}
                >
                  Approve {selectedReview.length || ''}
                </Button>
                <Button
                  size="compact-sm"
                  color="red"
                  variant="light"
                  leftSection={<IconTrash size={14} />}
                  disabled={selectedReview.length === 0}
                  onClick={dismissSelected}
                >
                  Dismiss {selectedReview.length || ''}
                </Button>
              </Group>
            </Group>
          </Paper>
        )}

        {/* Cards grid */}
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
            {cards.map(card => (
              <GenCardItem
                key={card.id}
                card={card}
                onPromptChange={p => handlePromptChange(card.id, p)}
                onAddReference={f => addReference(card.id, f)}
                onRemoveReference={refId => removeReference(card.id, refId)}
                onGenerate={() => generateCard(card.id)}
                onRemove={() => removeCard(card.id)}
                onApprove={() => approveCard(card.id)}
                onDismiss={() => dismissCard(card.id)}
                onRedo={() => redoCard(card.id)}
                onToggleSelected={() => toggleCardSelected(card.id)}
              />
            ))}

          </SimpleGrid>


      </Stack>
    </Container>
  )
}

// ─── GenCardItem ──────────────────────────────────────────────────────────────

function GenCardItem({
  card,
  onPromptChange,
  onAddReference,
  onRemoveReference,
  onGenerate,
  onRemove,
  onApprove,
  onDismiss,
  onRedo,
  onToggleSelected,
}: {
  card: GenCard
  onPromptChange: (p: string) => void
  onAddReference: (f: File) => void
  onRemoveReference: (refId: string) => void
  onGenerate: () => void
  onRemove: () => void
  onApprove: () => void
  onDismiss: () => void
  onRedo: () => void
  onToggleSelected: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isBusy = card.status === 'uploading' || card.status === 'generating' || card.status === 'approving'
  const isReview = card.status === 'review'
  const isApproved = card.status === 'approved'
  const isError = card.status === 'error'
  const isEditable = card.status === 'idle' || card.status === 'error'

  return (
    <Paper
      radius="lg"
      p="md"
      withBorder
      style={{
        borderColor: isApproved
          ? 'var(--mantine-color-green-8)'
          : isReview && card.selected
          ? 'var(--mantine-color-brand-5)'
          : isReview
          ? 'var(--mantine-color-brand-9)'
          : isError
          ? 'var(--mantine-color-red-8)'
          : 'var(--mantine-color-dark-5)',
        backgroundColor: 'var(--mantine-color-dark-8)',
      }}
    >
      <Stack gap="sm">

        {/* Remove button — only while editable (review uses Dismiss) */}
        {isEditable && (
          <Group justify="flex-end" style={{ marginBottom: -4 }}>
            <Tooltip label="Remove">
              <ActionIcon size="xs" color="dark.4" variant="subtle" onClick={onRemove}>
                <IconX size={12} />
              </ActionIcon>
            </Tooltip>
          </Group>
        )}

        {/* Preview (review or approved) */}
        {(isReview || isApproved) && card.preview && (
          <div style={{
            position: 'relative',
            aspectRatio: '1',
            backgroundColor: '#FFFFFF',
            borderRadius: 8,
            overflow: 'hidden',
          }}>
            <Image
              src={card.preview.imageUrl}
              alt="Preview"
              style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 8 }}
            />
            {isReview && (
              <Checkbox
                checked={card.selected}
                onChange={onToggleSelected}
                color="brand"
                styles={{ input: { cursor: 'pointer' } }}
                style={{ position: 'absolute', top: 8, left: 8 }}
              />
            )}
            <Badge
              color={isApproved ? 'green' : 'brand'}
              variant="filled"
              style={{ position: 'absolute', top: 8, right: 8 }}
            >
              {isApproved ? 'Saved' : 'Pending review'}
            </Badge>
          </div>
        )}

        {/* Busy (uploading / generating / saving) */}
        {isBusy && (
          <Center py={48}>
            <Stack align="center" gap="sm">
              <Loader size="md" color="brand" />
              <Text size="xs" c="dark.3">
                {card.status === 'uploading'
                  ? 'Uploading reference…'
                  : card.status === 'approving'
                  ? 'Saving…'
                  : 'Generating…'}
              </Text>
            </Stack>
          </Center>
        )}

        {/* Error */}
        {isError && card.error && (
          <Alert icon={<IconAlertCircle size={14} />} color="red" p="xs" radius="md">
            <Text size="xs">{card.error}</Text>
          </Alert>
        )}

        {/* Editable state */}
        {isEditable && (
          <>
            <Textarea
              placeholder="Describe the design…"
              value={card.prompt}
              onChange={e => onPromptChange(e.currentTarget.value)}
              autosize
              minRows={3}
              maxRows={7}
              styles={{
                input: {
                  backgroundColor: 'var(--mantine-color-dark-7)',
                  color: 'var(--mantine-color-white)',
                  fontSize: 13,
                },
              }}
            />

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={e => {
                if (e.target.files?.[0]) onAddReference(e.target.files[0])
                e.target.value = '' // allow re-selecting / adding more
              }}
            />

            {card.references.length > 0 && (
              <Group gap="xs" align="center">
                {card.references.map(ref => (
                  <div key={ref.id} style={{ position: 'relative', display: 'inline-block' }}>
                    <Image
                      src={ref.previewUrl}
                      w={48}
                      h={48}
                      radius="sm"
                      style={{ objectFit: 'cover', display: 'block', backgroundColor: '#fff' }}
                    />
                    <ActionIcon
                      size="xs"
                      color="red"
                      variant="filled"
                      radius="xl"
                      style={{ position: 'absolute', top: -5, right: -5 }}
                      onClick={() => onRemoveReference(ref.id)}
                    >
                      <IconX size={8} />
                    </ActionIcon>
                  </div>
                ))}
              </Group>
            )}

            <Button
              size="compact-xs"
              variant="subtle"
              color="dark.3"
              leftSection={<IconUpload size={11} />}
              onClick={() => fileInputRef.current?.click()}
              style={{ alignSelf: 'flex-start' }}
            >
              {card.references.length > 0 ? 'Add another image' : 'Add reference image'}
            </Button>

            <Button
              onClick={onGenerate}
              disabled={!card.prompt.trim()}
              color={isError ? 'red' : 'brand'}
              variant={isError ? 'light' : 'filled'}
              leftSection={isError ? <IconRefresh size={14} /> : <IconPlayerPlay size={14} />}
              fullWidth
            >
              {isError ? 'Retry' : 'Generate'}
            </Button>
          </>
        )}

        {/* Review — approve / redo / dismiss */}
        {isReview && (
          <>
            <Text size="xs" c="dark.3" lineClamp={2}>{card.prompt}</Text>
            <Group gap="xs" grow>
              <Button size="compact-sm" color="brand" leftSection={<IconCheck size={14} />} onClick={onApprove}>
                Approve
              </Button>
              <Button size="compact-sm" variant="default" leftSection={<IconRefresh size={14} />} onClick={onRedo}>
                Redo
              </Button>
              <Button size="compact-sm" color="red" variant="light" leftSection={<IconTrash size={14} />} onClick={onDismiss}>
                Dismiss
              </Button>
            </Group>
          </>
        )}

        {/* Approved */}
        {isApproved && (
          <Group gap={6} align="center" justify="center">
            <IconCheck size={14} color="var(--mantine-color-green-5)" />
            <Text size="xs" c="green.4">Saved to library</Text>
          </Group>
        )}

      </Stack>
    </Paper>
  )
}
