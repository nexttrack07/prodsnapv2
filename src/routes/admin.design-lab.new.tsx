import { useState, useRef, useCallback, useEffect } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useAction } from 'convex/react'
import { api } from '../../convex/_generated/api'
import {
  Container, Stack, Group, Text, Title, Button, Paper, Textarea,
  TextInput, Badge, Loader, Center, ActionIcon, Tooltip, Box,
  Image, ThemeIcon, Alert, Select, SimpleGrid, Checkbox,
  Stepper, Divider, Slider,
} from '@mantine/core'
import {
  IconUpload, IconX, IconCheck, IconRefresh, IconArrowLeft,
  IconAlertCircle, IconSparkles, IconChevronRight,
} from '@tabler/icons-react'

export const Route = createFileRoute('/admin/design-lab/new')({
  component: DesignLabNew,
})

// ─── Types ────────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 11)

type UploadedImage = { id: string; file: File; previewUrl: string; r2Url?: string }

type NicheInfo = {
  description: string
  audience: string
  productType: string
}

type Concept = {
  id: string
  title: string
  rationale: string
  approved: boolean
}

type PromptCard = {
  id: string
  conceptId: string
  conceptTitle: string
  title: string
  typography: string
  imageDescription: string
  style: string
  colorPalette: string
  mood: string
  generationPrompt: string
  approved: boolean
  referenceUrls: string[]
  genStatus: 'pending' | 'generating' | 'done' | 'failed'
  resultUrl?: string
  genError?: string
}

type Step = 'setup' | 'uploading' | 'analyzing' | 'concepts' | 'expanding' | 'prompts' | 'generating' | 'done'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toBase64 = (file: File): Promise<string> =>
  new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res((r.result as string).split(',')[1])
    r.onerror = rej
    r.readAsDataURL(file)
  })

async function runWithLimit(tasks: (() => Promise<void>)[], limit: number): Promise<void> {
  const queue = [...tasks]
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      while (queue.length > 0) {
        const task = queue.shift()
        if (task) await task().catch(() => {})
      }
    }),
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

function DesignLabNew() {
  const filesRef = useRef<UploadedImage[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('setup')
  const [images, setImages] = useState<UploadedImage[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [batchName, setBatchName] = useState('')
  const [niche, setNiche] = useState<NicheInfo>({ description: '', audience: '', productType: 'T-shirt' })
  const [concepts, setConcepts] = useState<Concept[]>([])
  const [prompts, setPrompts] = useState<PromptCard[]>([])
  const [ideasPerConcept, setIdeasPerConcept] = useState(3)
  const [error, setError] = useState<string | null>(null)

  const uploadImage = useAction(api.r2.uploadProductImage)
  const analyzeDesigns = useAction(api.designLabActions.analyzeDesigns)
  const expandConcepts = useAction(api.designLabActions.expandConcepts)
  const generateSingle = useAction(api.designLabActions.generateSingleDesign)

  // Revoke object URLs on unmount
  useEffect(() => { filesRef.current = images }, [images])
  useEffect(() => () => { filesRef.current.forEach(f => URL.revokeObjectURL(f.previewUrl)) }, [])

  // ─── File handling ──────────────────────────────────────────────────────────

  const addFiles = useCallback((incoming: File[]) => {
    const img = incoming.find(f => f.type.startsWith('image/'))
    if (!img) return
    setImages(prev => {
      prev.forEach(f => URL.revokeObjectURL(f.previewUrl))
      return [{ id: uid(), file: img, previewUrl: URL.createObjectURL(img) }]
    })
  }, [])

  const removeImage = useCallback((id: string) => {
    setImages(prev => {
      const f = prev.find(x => x.id === id)
      if (f) URL.revokeObjectURL(f.previewUrl)
      return prev.filter(x => x.id !== id)
    })
  }, [])

  // ─── Step 1: Analyze ────────────────────────────────────────────────────────

  const handleAnalyze = async () => {
    if (images.length === 0 || !niche.description.trim()) return
    setError(null)

    try {
      setStep('uploading')
      const uploaded = await Promise.all(
        images.map(async f => {
          const base64 = await toBase64(f.file)
          const { url } = await uploadImage({ name: f.file.name, contentType: f.file.type, base64 })
          return { id: f.id, r2Url: url }
        }),
      )
      setImages(prev => prev.map(f => ({ ...f, r2Url: uploaded.find(u => u.id === f.id)?.r2Url })))

      setStep('analyzing')
      const result = await analyzeDesigns({
        imageUrl: uploaded[0].r2Url!,
        nicheDescription: niche.description,
        targetAudience: niche.audience,
        productType: niche.productType,
      })

      setConcepts([{ id: uid(), title: result.concept.title, rationale: result.concept.rationale, approved: true }])
      setStep('concepts')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed')
      setStep('setup')
    }
  }

  // ─── Step 2: Expand concepts ────────────────────────────────────────────────

  const handleExpand = async () => {
    const approved = concepts.filter(c => c.approved)
    if (approved.length === 0) return
    setError(null)

    try {
      setStep('expanding')
      const result = await expandConcepts({
        concepts: approved.map(c => ({ title: c.title, rationale: c.rationale })),
        nicheDescription: niche.description,
        targetAudience: niche.audience,
        productType: niche.productType,
        ideasPerConcept,
      })

      type RawIdea = { title: string; typography: string; imageDescription: string; style: string; colorPalette: string; mood: string; generationPrompt: string }
      type RawConcept = { conceptTitle: string; ideas: RawIdea[] }
      const cards: PromptCard[] = (result.concepts as RawConcept[]).flatMap(c =>
        c.ideas.map(p => ({
          id: uid(),
          conceptId: concepts.find(x => x.title === c.conceptTitle)?.id ?? uid(),
          conceptTitle: c.conceptTitle,
          title: p.title,
          typography: p.typography ?? '',
          imageDescription: p.imageDescription,
          style: p.style,
          colorPalette: p.colorPalette,
          mood: p.mood,
          generationPrompt: p.generationPrompt,
          approved: true,
          referenceUrls: [],
          genStatus: 'pending' as const,
        })),
      )
      setPrompts(cards)
      setStep('prompts')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Expansion failed')
      setStep('concepts')
    }
  }

  // ─── Step 3: Generate ───────────────────────────────────────────────────────

  const handleGenerate = async () => {
    const approved = prompts.filter(p => p.approved)
    if (approved.length === 0) return
    setError(null)
    setStep('generating')

    await runWithLimit(
      approved.map(p => async () => {
        setPrompts(prev => prev.map(x => x.id === p.id ? { ...x, genStatus: 'generating' } : x))
        try {
          const { imageUrl } = await generateSingle({
            prompt: p.generationPrompt,
            promptTitle: p.title,
            conceptTitle: p.conceptTitle,
            referenceImageUrls: p.referenceUrls,
            batchName: batchName || undefined,
            nicheDescription: niche.description || undefined,
          })
          setPrompts(prev => prev.map(x => x.id === p.id ? { ...x, genStatus: 'done', resultUrl: imageUrl } : x))
        } catch (err) {
          const genError = err instanceof Error ? err.message : 'Generation failed'
          setPrompts(prev => prev.map(x => x.id === p.id ? { ...x, genStatus: 'failed', genError } : x))
        }
      }),
      4,
    )

    setStep('done')
  }

  const handleRetry = async (p: PromptCard) => {
    setPrompts(prev => prev.map(x => x.id === p.id ? { ...x, genStatus: 'generating', genError: undefined } : x))
    try {
      const { imageUrl } = await generateSingle({
        prompt: p.generationPrompt,
        promptTitle: p.title,
        conceptTitle: p.conceptTitle,
        referenceImageUrls: p.referenceUrls,
        batchName: batchName || undefined,
        nicheDescription: niche.description || undefined,
      })
      setPrompts(prev => prev.map(x => x.id === p.id ? { ...x, genStatus: 'done', resultUrl: imageUrl } : x))
    } catch (err) {
      const genError = err instanceof Error ? err.message : 'Generation failed'
      setPrompts(prev => prev.map(x => x.id === p.id ? { ...x, genStatus: 'failed', genError } : x))
    }
  }

  // ─── Derived ────────────────────────────────────────────────────────────────

  const r2Urls = images.map(f => f.r2Url).filter(Boolean) as string[]
  const approvedConcepts = concepts.filter(c => c.approved).length
  const approvedPrompts = prompts.filter(p => p.approved).length
  const doneCount = prompts.filter(p => p.genStatus === 'done').length
  const failedCount = prompts.filter(p => p.genStatus === 'failed').length

  const activeStepIndex =
    step === 'setup' || step === 'uploading' || step === 'analyzing' ? 0
    : step === 'concepts' || step === 'expanding' ? 1
    : 2

  const isLoading = step === 'uploading' || step === 'analyzing' || step === 'expanding'

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <Container size="lg" py={40}>
      <Stack gap="xl">

        {/* Header */}
        <Group justify="space-between">
          <Title order={2} fw={600} c="dark.0">New Batch</Title>
          <Button
            component={Link}
            to="/admin/design-lab"
            variant="subtle"
            color="dark.3"
            size="sm"
            leftSection={<IconArrowLeft size={14} />}
          >
            Back
          </Button>
        </Group>

        {/* Stepper */}
        <Stepper
          active={activeStepIndex}
          color="brand"
          size="sm"
          styles={{
            stepLabel: { color: 'var(--mantine-color-dark-0)' },
            stepDescription: { color: 'var(--mantine-color-dark-2)' },
          }}
        >
          <Stepper.Step label="Upload & analyze" description="Competitor designs + niche info" />
          <Stepper.Step label="Review concepts" description="Pick what to develop" />
          <Stepper.Step label="Generate" description="Create final designs" />
        </Stepper>

        {/* Error */}
        {error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red" variant="filled" onClose={() => setError(null)} withCloseButton>
            {error}
          </Alert>
        )}

        {/* Loading overlay */}
        {isLoading && (
          <Center py={80}>
            <Stack align="center" gap="md">
              <Loader size="xl" color="brand" />
              <Text c="dark.0" fw={500}>
                {step === 'uploading' && 'Uploading images…'}
                {step === 'analyzing' && 'Analyzing your designs…'}
                {step === 'expanding' && 'Generating prompt ideas…'}
              </Text>
              <Text size="sm" c="dark.3">This takes 15–30 seconds</Text>
            </Stack>
          </Center>
        )}

        {/* ── Step 0: Setup ── */}
        {step === 'setup' && (
          <Stack gap="lg">
            <Paper p="lg" radius="lg" withBorder style={{ borderColor: 'var(--mantine-color-dark-5)', backgroundColor: 'var(--mantine-color-dark-8)' }}>
              <Stack gap="md">
                <Text fw={600} c="dark.0" size="sm">Niche context</Text>
                <Text size="xs" c="dark.3">Help the AI stay focused on your specific market.</Text>
                <Textarea
                  label="Niche description"
                  placeholder="e.g. Hiking and outdoor adventure, focused on US national parks and wilderness. Designs often feature mountain silhouettes, wildlife, and americana-style typography."
                  value={niche.description}
                  onChange={e => setNiche(n => ({ ...n, description: e.currentTarget.value }))}
                  minRows={3}
                  autosize
                  styles={{ label: { color: 'var(--mantine-color-dark-1)', fontSize: 13 } }}
                />
                <Group grow>
                  <Textarea
                    label="Target audience"
                    placeholder="e.g. Outdoor enthusiasts 25–45, largely male, value authenticity"
                    value={niche.audience}
                    onChange={e => setNiche(n => ({ ...n, audience: e.currentTarget.value }))}
                    minRows={2}
                    autosize
                    styles={{ label: { color: 'var(--mantine-color-dark-1)', fontSize: 13 } }}
                  />
                  <Select
                    label="Product type"
                    value={niche.productType}
                    onChange={v => setNiche(n => ({ ...n, productType: v ?? 'T-shirt' }))}
                    data={['T-shirt', 'Hoodie', 'Mug', 'Tote bag', 'Phone case', 'Poster']}
                    styles={{ label: { color: 'var(--mantine-color-dark-1)', fontSize: 13 } }}
                  />
                </Group>
              </Stack>
            </Paper>

            {/* Batch name */}
            <TextInput
              label="Batch name (optional)"
              placeholder="e.g. National Park Designs Vol 1"
              value={batchName}
              onChange={e => setBatchName(e.currentTarget.value)}
              styles={{ label: { color: 'var(--mantine-color-dark-1)', fontSize: 13 } }}
            />

            {/* Upload */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={e => e.target.files && addFiles(Array.from(e.target.files))}
            />
            <Paper
              radius="lg"
              p="xl"
              withBorder
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => { e.preventDefault(); setIsDragging(false); addFiles(Array.from(e.dataTransfer.files)) }}
              style={{
                borderColor: isDragging ? 'var(--mantine-color-brand-5)' : 'var(--mantine-color-dark-4)',
                borderStyle: 'dashed',
                backgroundColor: isDragging ? 'rgba(16, 24, 40,0.08)' : 'var(--mantine-color-dark-8)',
                cursor: 'pointer',
                transition: 'all 150ms ease',
              }}
            >
              <Stack align="center" gap="sm" py="sm">
                <ThemeIcon size={44} radius="xl" variant="light" color="brand">
                  <IconUpload size={20} />
                </ThemeIcon>
                <Text fw={500} c="dark.0">Drop a competitor design here or click to browse</Text>
                <Text size="sm" c="dark.3">1 image · PNG, JPG, WebP</Text>
                {images.length > 0 && <Badge color="brand" variant="light">1 selected</Badge>}
              </Stack>
            </Paper>

            {images.length > 0 && (
              <Group gap="sm">
                {images.map(f => (
                  <Box key={f.id} style={{ position: 'relative' }}>
                    <Image src={f.previewUrl} alt={f.file.name} w={80} h={80} radius="md" style={{ objectFit: 'cover', display: 'block' }} />
                    <ActionIcon
                      size="xs" color="red" variant="filled"
                      style={{ position: 'absolute', top: 3, right: 3 }}
                      onClick={e => { e.stopPropagation(); removeImage(f.id) }}
                    >
                      <IconX size={10} />
                    </ActionIcon>
                  </Box>
                ))}
              </Group>
            )}

            <Button
              onClick={handleAnalyze}
              disabled={images.length === 0 || !niche.description.trim()}
              size="md"
              color="brand"
              rightSection={<IconChevronRight size={16} />}
              style={{ alignSelf: 'flex-start' }}
            >
              Analyze designs
            </Button>
          </Stack>
        )}

        {/* ── Step 1: Concept review ── */}
        {step === 'concepts' && concepts[0] && (
          <Stack gap="lg">
            <Text fw={600} c="dark.0">Concept identified</Text>

            <Paper p="lg" radius="md" withBorder style={{ borderColor: 'var(--mantine-color-brand-7)', backgroundColor: 'var(--mantine-color-dark-8)' }}>
              <Stack gap="sm">
                <Badge color="brand" variant="light" style={{ alignSelf: 'flex-start' }}>{concepts[0].title}</Badge>
                <Text size="sm" c="dark.1">{concepts[0].rationale}</Text>
              </Stack>
            </Paper>

            <Paper p="lg" radius="md" withBorder style={{ borderColor: 'var(--mantine-color-dark-5)', backgroundColor: 'var(--mantine-color-dark-8)' }}>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="sm" fw={600} c="dark.0">Ideas to generate</Text>
                  <Badge variant="light" color="brand">{ideasPerConcept} ideas</Badge>
                </Group>
                <Slider
                  value={ideasPerConcept}
                  onChange={setIdeasPerConcept}
                  min={2}
                  max={5}
                  step={1}
                  marks={[
                    { value: 2, label: '2' },
                    { value: 3, label: '3' },
                    { value: 4, label: '4' },
                    { value: 5, label: '5' },
                  ]}
                  color="brand"
                  styles={{ markLabel: { color: 'var(--mantine-color-dark-3)', fontSize: 11 } }}
                />
              </Stack>
            </Paper>

            <Group>
              <Button
                onClick={handleExpand}
                color="brand"
                rightSection={<IconChevronRight size={16} />}
              >
                Generate {ideasPerConcept} ideas
              </Button>
              <Button variant="subtle" color="dark.3" size="sm" onClick={() => setStep('setup')}>
                ← Back
              </Button>
            </Group>
          </Stack>
        )}

        {/* ── Step 2: Prompt review ── */}
        {(step === 'prompts' || step === 'generating' || step === 'done') && (
          <Stack gap="xl">
            <Group justify="space-between">
              <div>
                <Text fw={600} c="dark.0">
                  {step === 'done' ? `Done — ${doneCount} design${doneCount !== 1 ? 's' : ''} saved` : 'Review prompts and references'}
                </Text>
                <Text size="sm" c="dark.3" mt={2}>
                  {step === 'prompts' && `${approvedPrompts} of ${prompts.length} approved`}
                  {step === 'generating' && `${doneCount + failedCount} / ${prompts.filter(p => p.approved).length} complete`}
                  {step === 'done' && failedCount > 0 && `${failedCount} failed — retry individually`}
                </Text>
              </div>
              {step === 'prompts' && (
                <Button
                  onClick={handleGenerate}
                  disabled={approvedPrompts === 0}
                  color="brand"
                  leftSection={<IconSparkles size={16} />}
                >
                  Generate {approvedPrompts} design{approvedPrompts !== 1 ? 's' : ''}
                </Button>
              )}
              {step === 'done' && (
                <Group gap="sm">
                  <Button component={Link} to="/admin/design-lab" color="brand">
                    View library
                  </Button>
                  <Button
                    variant="subtle"
                    color="dark.3"
                    onClick={() => {
                      images.forEach(f => URL.revokeObjectURL(f.previewUrl))
                      setImages([])
                      setConcepts([])
                      setPrompts([])
                      setBatchName('')
                      setNiche({ description: '', audience: '', productType: 'T-shirt' })
                      setError(null)
                      setStep('setup')
                    }}
                  >
                    New batch
                  </Button>
                </Group>
              )}
            </Group>

            {/* Group prompts by concept */}
            {Array.from(new Set(prompts.map(p => p.conceptTitle))).map(conceptTitle => (
              <Stack key={conceptTitle} gap="sm">
                <Group gap="xs">
                  <Text fw={700} size="sm" c="brand.4">{conceptTitle}</Text>
                  <Divider flex={1} color="dark.5" />
                </Group>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  {prompts.filter(p => p.conceptTitle === conceptTitle).map(p => (
                    <PromptCard
                      key={p.id}
                      card={p}
                      uploadedUrls={r2Urls}
                      editable={step === 'prompts'}
                      onToggle={() => setPrompts(prev => prev.map(x => x.id === p.id ? { ...x, approved: !x.approved } : x))}
                      onFieldChange={(field, value) => setPrompts(prev => prev.map(x => x.id === p.id ? { ...x, [field]: value } : x))}
                      onToggleRef={url => setPrompts(prev => prev.map(x => {
                        if (x.id !== p.id) return x
                        const has = x.referenceUrls.includes(url)
                        return { ...x, referenceUrls: has ? x.referenceUrls.filter(u => u !== url) : [...x.referenceUrls, url] }
                      }))}
                      onRetry={() => handleRetry(p)}
                    />
                  ))}
                </SimpleGrid>
              </Stack>
            ))}

            {step === 'prompts' && (
              <Button variant="subtle" color="dark.3" size="sm" onClick={() => setStep('concepts')} style={{ alignSelf: 'flex-start' }}>
                ← Back to concepts
              </Button>
            )}
          </Stack>
        )}
      </Stack>
    </Container>
  )
}

// ─── ConceptCard ──────────────────────────────────────────────────────────────

function ConceptCard({ concept, onToggle }: { concept: Concept; onToggle: () => void }) {
  return (
    <Paper
      radius="lg"
      p="lg"
      withBorder
      onClick={onToggle}
      style={{
        borderColor: concept.approved ? 'var(--mantine-color-brand-6)' : 'var(--mantine-color-dark-5)',
        backgroundColor: concept.approved ? 'rgba(16, 24, 40,0.08)' : 'var(--mantine-color-dark-8)',
        cursor: 'pointer',
        transition: 'all 150ms ease',
        userSelect: 'none',
      }}
    >
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Text fw={700} size="md" c="dark.0" style={{ flex: 1 }}>{concept.title}</Text>
          <Checkbox
            checked={concept.approved}
            onChange={() => {}}
            color="brand"
            styles={{ input: { cursor: 'pointer' } }}
          />
        </Group>
        <Text size="sm" c="dark.1" lh={1.6}>{concept.rationale}</Text>
      </Stack>
    </Paper>
  )
}

// ─── PromptCard ───────────────────────────────────────────────────────────────

function IdeaField({ label, value, editable, onChange, multiline }: {
  label: string
  value: string
  editable: boolean
  onChange: (v: string) => void
  multiline?: boolean
}) {
  return (
    <Stack gap={2}>
      <Text size="xs" fw={600} c="dark.3" tt="uppercase" style={{ letterSpacing: '0.04em' }}>{label}</Text>
      {multiline ? (
        <Textarea
          value={value}
          onChange={e => editable && onChange(e.currentTarget.value)}
          readOnly={!editable}
          autosize
          minRows={2}
          maxRows={5}
          size="xs"
          styles={{
            input: {
              backgroundColor: 'var(--mantine-color-dark-7)',
              color: editable ? 'var(--mantine-color-dark-0)' : 'var(--mantine-color-dark-1)',
              fontSize: 12,
              lineHeight: 1.6,
              border: editable ? undefined : 'none',
              padding: editable ? undefined : '4px 0',
            },
          }}
        />
      ) : (
        <TextInput
          value={value}
          onChange={e => editable && onChange(e.currentTarget.value)}
          readOnly={!editable}
          size="xs"
          styles={{
            input: {
              backgroundColor: 'var(--mantine-color-dark-7)',
              color: editable ? 'var(--mantine-color-dark-0)' : 'var(--mantine-color-dark-1)',
              fontSize: 12,
              border: editable ? undefined : 'none',
              padding: editable ? undefined : '4px 0',
            },
          }}
        />
      )}
    </Stack>
  )
}

function PromptCard({
  card,
  uploadedUrls,
  editable,
  onToggle,
  onFieldChange,
  onToggleRef,
  onRetry,
}: {
  card: PromptCard
  uploadedUrls: string[]
  editable: boolean
  onToggle: () => void
  onFieldChange: (field: keyof PromptCard, value: string) => void
  onToggleRef: (url: string) => void
  onRetry: () => void
}) {
  const isDone = card.genStatus === 'done'
  const isFailed = card.genStatus === 'failed'
  const isGenerating = card.genStatus === 'generating'

  return (
    <Paper
      radius="lg"
      p="md"
      withBorder
      style={{
        borderColor: isDone
          ? 'var(--mantine-color-green-8)'
          : isFailed
          ? 'var(--mantine-color-red-8)'
          : card.approved
          ? 'var(--mantine-color-dark-4)'
          : 'var(--mantine-color-dark-6)',
        backgroundColor: 'var(--mantine-color-dark-8)',
        opacity: !card.approved && editable ? 0.5 : 1,
        transition: 'all 150ms ease',
      }}
    >
      <Stack gap="sm">
        {/* Header */}
        <Group justify="space-between" align="flex-start">
          <Text fw={700} size="sm" c="dark.0" style={{ flex: 1 }}>{card.title}</Text>
          <Group gap={6}>
            {isGenerating && <Loader size={16} color="brand" />}
            {isDone && (
              <ThemeIcon size={20} color="green" variant="filled" radius="xl">
                <IconCheck size={11} />
              </ThemeIcon>
            )}
            {isFailed && (
              <Tooltip label={card.genError ?? 'Failed — click to retry'}>
                <ActionIcon size={20} color="red" variant="filled" radius="xl" onClick={onRetry}>
                  <IconRefresh size={11} />
                </ActionIcon>
              </Tooltip>
            )}
            {editable && (
              <Checkbox checked={card.approved} onChange={onToggle} color="brand" styles={{ input: { cursor: 'pointer' } }} />
            )}
          </Group>
        </Group>

        {/* Result image */}
        {isDone && card.resultUrl && (
          <Image src={card.resultUrl} alt={card.title} radius="md" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover' }} />
        )}

        {/* Structured fields */}
        {!isDone && (
          <Stack gap="xs">
            {card.typography && (
              <IdeaField
                label="Typography"
                value={card.typography}
                editable={editable}
                onChange={v => onFieldChange('typography', v)}
              />
            )}
            {!card.typography && editable && (
              <Text size="xs" c="dark.5" fs="italic">No text — graphic only</Text>
            )}
            <IdeaField
              label="Image"
              value={card.imageDescription}
              editable={editable}
              onChange={v => onFieldChange('imageDescription', v)}
              multiline
            />
            <IdeaField
              label="Style"
              value={card.style}
              editable={editable}
              onChange={v => onFieldChange('style', v)}
            />
            <Group grow>
              <IdeaField
                label="Colors"
                value={card.colorPalette}
                editable={editable}
                onChange={v => onFieldChange('colorPalette', v)}
              />
              <IdeaField
                label="Mood"
                value={card.mood}
                editable={editable}
                onChange={v => onFieldChange('mood', v)}
              />
            </Group>
          </Stack>
        )}

        {/* Reference image picker */}
        {editable && uploadedUrls.length > 0 && (
          <Stack gap={4}>
            <Text size="xs" c="dark.3">
              Style references{' '}
              <Text span c="dark.5" size="xs">
                {card.referenceUrls.length === 0 ? '(none — text-to-image)' : `(${card.referenceUrls.length} selected)`}
              </Text>
            </Text>
            <Group gap={6}>
              {uploadedUrls.map((url, i) => {
                const selected = card.referenceUrls.includes(url)
                return (
                  <Box
                    key={i}
                    onClick={() => onToggleRef(url)}
                    style={{
                      cursor: 'pointer',
                      borderRadius: 6,
                      border: `2px solid ${selected ? 'var(--mantine-color-brand-5)' : 'transparent'}`,
                      opacity: selected ? 1 : 0.35,
                      transition: 'all 120ms ease',
                    }}
                  >
                    <Image src={url} alt={`Ref ${i + 1}`} w={40} h={40} radius="xs" style={{ objectFit: 'cover', display: 'block' }} />
                  </Box>
                )
              })}
            </Group>
          </Stack>
        )}
      </Stack>
    </Paper>
  )
}
