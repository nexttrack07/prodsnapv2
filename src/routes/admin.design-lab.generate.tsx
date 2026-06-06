import { useState, useRef, useEffect } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useAction } from 'convex/react'
import { useLocalStorage } from '@mantine/hooks'
import { api } from '../../convex/_generated/api'
import {
  Container, Stack, Group, Text, Title, Button, Paper, Textarea,
  SimpleGrid, ActionIcon, Tooltip, Image, Center, Loader, Alert,
  ThemeIcon,
} from '@mantine/core'
import {
  IconPlus, IconSparkles, IconUpload, IconX, IconCheck,
  IconAlertCircle, IconArrowLeft, IconPlayerPlay, IconRefresh,
} from '@tabler/icons-react'

export const Route = createFileRoute('/admin/design-lab/generate')({
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

type GenStatus = 'idle' | 'uploading' | 'generating' | 'done' | 'error'

type GenCard = {
  id: string
  prompt: string
  referenceFile: File | null
  referencePreviewUrl: string | null
  referenceR2Url: string | null
  status: GenStatus
  resultUrl: string | null
  error: string | null
}

function makeCard(): GenCard {
  return {
    id: uid(),
    prompt: '',
    referenceFile: null,
    referencePreviewUrl: null,
    referenceR2Url: null,
    status: 'idle',
    resultUrl: null,
    error: null,
  }
}

// ─── Main page ────────────────────────────────────────────────────────────────

function BatchGenerate() {
  const [sharedPrompt, setSharedPrompt] = useLocalStorage({
    key: 'prodsnap-generate-shared-prompt',
    defaultValue: '',
  })
  const [cards, setCards] = useState<GenCard[]>([makeCard()])

  const uploadImage = useAction(api.r2.uploadProductImage)
  const generateSingle = useAction(api.designLabActions.generateSingleDesign)

  const updateCard = (id: string, patch: Partial<GenCard>) =>
    setCards(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))

  const handlePromptChange = (id: string, prompt: string) => {
    setCards(prev => {
      const updated = prev.map(c => c.id === id ? { ...c, prompt } : c)
      const last = updated[updated.length - 1]
      if (last && (last.prompt.trim() || last.status !== 'idle')) {
        return [...updated, makeCard()]
      }
      return updated
    })
  }

  const addCard = () => setCards(prev => [...prev, makeCard()])

  const removeCard = (id: string) => {
    setCards(prev => {
      const card = prev.find(c => c.id === id)
      if (card?.referencePreviewUrl) URL.revokeObjectURL(card.referencePreviewUrl)
      return prev.filter(c => c.id !== id)
    })
  }

  const setReference = (id: string, file: File) => {
    const card = cards.find(c => c.id === id)
    if (card?.referencePreviewUrl) URL.revokeObjectURL(card.referencePreviewUrl)
    updateCard(id, {
      referenceFile: file,
      referencePreviewUrl: URL.createObjectURL(file),
      referenceR2Url: null,
    })
  }

  const clearReference = (id: string) => {
    const card = cards.find(c => c.id === id)
    if (card?.referencePreviewUrl) URL.revokeObjectURL(card.referencePreviewUrl)
    updateCard(id, { referenceFile: null, referencePreviewUrl: null, referenceR2Url: null })
  }

  const generateCard = async (id: string) => {
    const card = cards.find(c => c.id === id)
    if (!card || !card.prompt.trim()) return

    const fullPrompt = sharedPrompt.trim()
      ? `${sharedPrompt.trim()}\n\n${card.prompt.trim()}`
      : card.prompt.trim()

    try {
      let r2Url: string | null = card.referenceR2Url

      if (card.referenceFile && !r2Url) {
        updateCard(id, { status: 'uploading', error: null })
        const base64 = await toBase64(card.referenceFile)
        const { url } = await uploadImage({
          name: card.referenceFile.name,
          contentType: card.referenceFile.type,
          base64,
        })
        r2Url = url
        updateCard(id, { referenceR2Url: url })
      }

      updateCard(id, { status: 'generating', error: null })
      const { imageUrl } = await generateSingle({
        prompt: fullPrompt,
        promptTitle: card.prompt.trim().slice(0, 60),
        conceptTitle: sharedPrompt.trim().slice(0, 60) || 'Batch Generate',
        referenceImageUrls: r2Url ? [r2Url] : [],
        nicheDescription: sharedPrompt.trim() || undefined,
      })
      updateCard(id, { status: 'done', resultUrl: imageUrl })
    } catch (err) {
      updateCard(id, {
        status: 'error',
        error: err instanceof Error ? err.message : 'Generation failed',
      })
    }
  }

  const retryCard = (id: string) => {
    updateCard(id, { status: 'idle', error: null, resultUrl: null })
  }

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
        prev.forEach(c => { if (c.referencePreviewUrl) URL.revokeObjectURL(c.referencePreviewUrl) })
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

        {/* Cards grid */}
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
            {cards.map(card => (
              <GenCardItem
                key={card.id}
                card={card}
                onPromptChange={p => handlePromptChange(card.id, p)}
                onSetReference={f => setReference(card.id, f)}
                onClearReference={() => clearReference(card.id)}
                onGenerate={() => generateCard(card.id)}
                onRetry={() => retryCard(card.id)}
                onRemove={() => removeCard(card.id)}
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
  onSetReference,
  onClearReference,
  onGenerate,
  onRetry,
  onRemove,
}: {
  card: GenCard
  onPromptChange: (p: string) => void
  onSetReference: (f: File) => void
  onClearReference: () => void
  onGenerate: () => void
  onRetry: () => void
  onRemove: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isActive = card.status === 'uploading' || card.status === 'generating'
  const isDone = card.status === 'done'
  const isError = card.status === 'error'

  return (
    <Paper
      radius="lg"
      p="md"
      withBorder
      style={{
        borderColor: isDone
          ? 'var(--mantine-color-green-8)'
          : isError
          ? 'var(--mantine-color-red-8)'
          : 'var(--mantine-color-dark-5)',
        backgroundColor: 'var(--mantine-color-dark-8)',
      }}
    >
      <Stack gap="sm">

        {/* Remove button (top-right) */}
        {!isActive && (
          <Group justify="flex-end" style={{ marginBottom: -4 }}>
            <Tooltip label="Remove">
              <ActionIcon size="xs" color="dark.4" variant="subtle" onClick={onRemove}>
                <IconX size={12} />
              </ActionIcon>
            </Tooltip>
          </Group>
        )}

        {/* Result image */}
        {isDone && card.resultUrl && (
          <div style={{
            position: 'relative',
            aspectRatio: '1',
            backgroundColor: '#FFFFFF',
            borderRadius: 8,
            overflow: 'hidden',
          }}>
            <Image
              src={card.resultUrl}
              alt="Result"
              style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 8 }}
            />
            <ThemeIcon
              size={24}
              color="green"
              variant="filled"
              radius="xl"
              style={{ position: 'absolute', bottom: 8, right: 8 }}
            >
              <IconCheck size={12} />
            </ThemeIcon>
          </div>
        )}

        {/* Generating / uploading */}
        {isActive && (
          <Center py={48}>
            <Stack align="center" gap="sm">
              <Loader size="md" color="brand" />
              <Text size="xs" c="dark.3">
                {card.status === 'uploading' ? 'Uploading reference…' : 'Generating…'}
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
        {!isActive && !isDone && (
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
              onChange={e => e.target.files?.[0] && onSetReference(e.target.files[0])}
            />

            {card.referencePreviewUrl ? (
              <Group gap="sm" align="center">
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <Image
                    src={card.referencePreviewUrl}
                    w={48}
                    h={48}
                    radius="sm"
                    style={{ objectFit: 'cover', display: 'block' }}
                  />
                  <ActionIcon
                    size="xs"
                    color="red"
                    variant="filled"
                    radius="xl"
                    style={{ position: 'absolute', top: -5, right: -5 }}
                    onClick={onClearReference}
                  >
                    <IconX size={8} />
                  </ActionIcon>
                </div>
                <Text size="xs" c="dark.3">Reference image</Text>
              </Group>
            ) : (
              <Button
                size="compact-xs"
                variant="subtle"
                color="dark.3"
                leftSection={<IconUpload size={11} />}
                onClick={() => fileInputRef.current?.click()}
                style={{ alignSelf: 'flex-start' }}
              >
                Add reference image
              </Button>
            )}

            <Button
              onClick={isError ? onRetry : onGenerate}
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

        {/* Done — show prompt summary + regenerate option */}
        {isDone && (
          <>
            <Text size="xs" c="dark.3" lineClamp={2}>{card.prompt}</Text>
            <Button
              size="compact-xs"
              variant="subtle"
              color="dark.3"
              onClick={onRetry}
              leftSection={<IconRefresh size={11} />}
              style={{ alignSelf: 'flex-start' }}
            >
              Regenerate
            </Button>
          </>
        )}

      </Stack>
    </Paper>
  )
}
