import { useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useAction } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import {
  Container, Stack, Group, Text, Title, Button, Paper, SimpleGrid,
  Image, Badge, ActionIcon, Tooltip, Center, Loader, Textarea,
  Alert, Checkbox, Tabs, ColorSwatch, Collapse, SegmentedControl,
} from '@mantine/core'
import {
  IconTrash, IconDownload, IconSparkles,
  IconAlertCircle, IconPlus, IconScissors, IconCheck, IconLayoutGrid,
  IconArrowsMaximize,
} from '@tabler/icons-react'

export const Route = createFileRoute('/admin/design-lab/')({
  component: DesignLibrary,
})

// ─── Types ────────────────────────────────────────────────────────────────────

type DesignOutput = {
  _id: Id<'designOutputs'>
  imageUrl: string
  storageKey: string
  prompt: string
  promptTitle: string
  conceptTitle: string
  referenceImageUrls: string[]
  batchName?: string
  nicheDescription?: string
  bgRemovedUrl?: string
  upscaledUrl?: string
  createdAt: number
}

type Idea = {
  _id: Id<'ideas'>
  title: string
  typography: string
  imageDescription: string
  style: string
  colorPalette: string
  mood: string
  generationPrompt: string
  status: 'pending' | 'queued' | 'generating' | 'failed'
  errorMessage?: string
  sourceInstruction?: string
  createdAt: number
}

const TSHIRT_COLORS = [
  { label: 'White', value: '#FFFFFF' },
  { label: 'Light Gray', value: '#EBEBEB' },
  { label: 'Sky Blue', value: '#A8C8E8' },
  { label: 'Navy', value: '#1F3461' },
  { label: 'Forest Green', value: '#2D5016' },
  { label: 'Black', value: '#1A1A1A' },
  { label: 'Red', value: '#B22222' },
  { label: 'Sand', value: '#D4B896' },
]

// ─── Date grouping ─────────────────────────────────────────────────────────────
// Current month → group per day; older → group per month. Designs arrive sorted
// newest-first, so iterating in order yields groups (and items) in descending
// order and naturally skips any period with no designs.

type DateGroup = { key: string; label: string; items: DesignOutput[] }

function groupDesignsByDate(designs: DesignOutput[]): DateGroup[] {
  const now = new Date()
  const curY = now.getFullYear()
  const curM = now.getMonth()
  const dayKeyOf = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  const todayKey = dayKeyOf(now)
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const yesterdayKey = dayKeyOf(yesterday)

  const groups: DateGroup[] = []
  let cur: DateGroup | null = null

  for (const design of designs) {
    const dt = new Date(design.createdAt)
    let key: string
    let label: string
    if (dt.getFullYear() === curY && dt.getMonth() === curM) {
      const dk = dayKeyOf(dt)
      key = `day-${dk}`
      label =
        dk === todayKey
          ? 'Today'
          : dk === yesterdayKey
          ? 'Yesterday'
          : dt.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
    } else {
      key = `month-${dt.getFullYear()}-${dt.getMonth()}`
      label = dt.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    }
    if (!cur || cur.key !== key) {
      cur = { key, label, items: [] }
      groups.push(cur)
    }
    cur.items.push(design)
  }
  return groups
}

// ─── Main library page ────────────────────────────────────────────────────────

function DesignLibrary() {
  const outputs = useQuery(api.designLab.listDesignOutputs)
  const ideas = useQuery(api.ideas.listIdeas)
  const deleteOutput = useMutation(api.designLab.deleteDesignOutput)
  const bulkDelete = useMutation(api.designLab.bulkDeleteDesignOutputs)

  // Bulk select state
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<'all' | 'date'>('all')

  const handleDelete = async (id: Id<'designOutputs'>) => {
    if (!confirm('Delete this design?')) return
    await deleteOutput({ id })
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`Delete ${selectedIds.size} design${selectedIds.size !== 1 ? 's' : ''}?`)) return
    await bulkDelete({ ids: Array.from(selectedIds) as Id<'designOutputs'>[] })
    setSelectedIds(new Set())
    setSelectMode(false)
  }

  const toggleSelectId = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  const handleDownload = (imageUrl: string, title: string) => {
    const filename = `${title.replace(/[^\w\s-]/g, '').trim()}.png`
    const siteUrl = import.meta.env.VITE_CONVEX_SITE_URL as string
    const proxyUrl = `${siteUrl}/download?url=${encodeURIComponent(imageUrl)}&filename=${encodeURIComponent(filename)}`
    const a = document.createElement('a')
    a.href = proxyUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const renderCards = (items: DesignOutput[]) => (
    <SimpleGrid cols={{ base: 2, sm: 3, lg: 4 }} spacing="md">
      {items.map(design => (
        <DesignCard
          key={design._id}
          design={design}
          selectMode={selectMode}
          bulkSelected={selectedIds.has(design._id)}
          onToggleSelect={() => toggleSelectId(design._id)}
          onDownload={(url) => handleDownload(url, design.promptTitle)}
          onDelete={() => handleDelete(design._id)}
        />
      ))}
    </SimpleGrid>
  )

  if (outputs === undefined) {
    return <Center h="60vh"><Loader size="lg" color="brand" /></Center>
  }

  const pendingCount = (ideas as Idea[] | undefined)?.filter(
    i => i.status === 'pending' || i.status === 'failed',
  ).length ?? 0

  return (
    <Container size="xl" py={40}>
      <Stack gap="xl">
        <Group justify="space-between" align="flex-end">
          <div>
            <Title order={2} fw={600} c="white">Design Library</Title>
            <Text size="sm" c="dark.2" mt={4}>
              {outputs.length} design{outputs.length !== 1 ? 's' : ''} saved
            </Text>
          </div>
          <Group>
            <Button
              component={Link}
              to="/admin/design-lab/generate"
              variant="light"
              color="brand"
              leftSection={<IconLayoutGrid size={16} />}
            >
              Batch Generate
            </Button>
            <Button
              component={Link}
              to="/admin/design-lab/new"
              variant="filled"
              color="brand"
              leftSection={<IconPlus size={16} />}
            >
              New Analysis
            </Button>
            <Button
              component={Link}
              to="/admin"
              variant="subtle"
              color="dark.3"
              size="sm"
            >
              ← Admin
            </Button>
          </Group>
        </Group>

        <Tabs defaultValue="designs" color="brand">
          <Tabs.List mb="xl">
            <Tabs.Tab value="designs">Designs</Tabs.Tab>
            <Tabs.Tab value="ideas">
              Ideas
              {pendingCount > 0 && (
                <Badge size="xs" color="brand" ml={6}>{pendingCount}</Badge>
              )}
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="designs">
            {outputs.length === 0 ? (
              <Paper
                p={60}
                radius="lg"
                withBorder
                style={{ borderColor: 'var(--mantine-color-dark-5)', borderStyle: 'dashed', backgroundColor: 'var(--mantine-color-dark-8)' }}
              >
                <Stack align="center" gap="md">
                  <Text size="lg" fw={500} c="dark.2">No designs yet</Text>
                  <Button component={Link} to="/admin/design-lab/new" color="brand">
                    Start your first analysis
                  </Button>
                </Stack>
              </Paper>
            ) : (
              <Stack gap="md">
                {/* Select mode toolbar */}
                <Group justify="space-between">
                  {selectMode ? (
                    <Group gap="sm">
                      <Text size="sm" c="dark.2">{selectedIds.size} selected</Text>
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        color="dark.3"
                        onClick={() => setSelectedIds(new Set((outputs as DesignOutput[]).map(d => d._id)))}
                      >
                        Select all
                      </Button>
                      <Button size="compact-xs" variant="subtle" color="dark.3" onClick={() => setSelectedIds(new Set())}>
                        Clear
                      </Button>
                    </Group>
                  ) : (
                    <SegmentedControl
                      size="xs"
                      value={viewMode}
                      onChange={(v) => setViewMode(v as 'all' | 'date')}
                      data={[
                        { label: 'All', value: 'all' },
                        { label: 'By date', value: 'date' },
                      ]}
                    />
                  )}
                  <Group gap="sm">
                    {selectMode && selectedIds.size > 0 && (
                      <Button
                        size="compact-sm"
                        color="red"
                        variant="light"
                        leftSection={<IconTrash size={13} />}
                        onClick={handleBulkDelete}
                      >
                        Delete {selectedIds.size}
                      </Button>
                    )}
                    <Button
                      size="compact-sm"
                      variant={selectMode ? 'filled' : 'subtle'}
                      color={selectMode ? 'brand' : 'dark.3'}
                      leftSection={selectMode ? <IconCheck size={13} /> : undefined}
                      onClick={selectMode ? exitSelectMode : () => setSelectMode(true)}
                    >
                      {selectMode ? 'Done' : 'Select'}
                    </Button>
                  </Group>
                </Group>

                {viewMode === 'all' ? (
                  renderCards(outputs as DesignOutput[])
                ) : (
                  <Stack gap="xl">
                    {groupDesignsByDate(outputs as DesignOutput[]).map(group => (
                      <Stack key={group.key} gap="sm">
                        <Group gap={8} align="baseline">
                          <Text size="sm" fw={700} c="white" tt="uppercase" style={{ letterSpacing: 0.4 }}>
                            {group.label}
                          </Text>
                          <Text size="xs" c="dark.3">
                            {group.items.length} design{group.items.length !== 1 ? 's' : ''}
                          </Text>
                        </Group>
                        {renderCards(group.items)}
                      </Stack>
                    ))}
                  </Stack>
                )}
              </Stack>
            )}
          </Tabs.Panel>

          <Tabs.Panel value="ideas">
            <IdeaLibrary />
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Container>
  )
}

// ─── IdeaLibrary ──────────────────────────────────────────────────────────────

function IdeaLibrary() {
  const ideas = useQuery(api.ideas.listIdeas)
  const queueIdeas = useMutation(api.ideas.queueIdeas)
  const deleteIdea = useMutation(api.ideas.deleteIdea)

  const [selected, setSelected] = useState<Set<string>>(new Set())

  if (ideas === undefined) {
    return <Center py={60}><Loader size="lg" color="brand" /></Center>
  }

  if (ideas.length === 0) {
    return (
      <Paper
        p={60}
        radius="lg"
        withBorder
        style={{ borderColor: 'var(--mantine-color-dark-5)', borderStyle: 'dashed', backgroundColor: 'var(--mantine-color-dark-8)' }}
      >
        <Stack align="center" gap="md">
          <Text size="lg" fw={500} c="dark.2">No ideas yet</Text>
          <Text size="sm" c="dark.3">
            Click the sparkle icon on any design to generate ideas and save them here.
          </Text>
        </Stack>
      </Paper>
    )
  }

  const pending = (ideas as Idea[]).filter(
    i => i.status === 'pending' || i.status === 'failed',
  )
  const selectedPending = pending.filter(i => selected.has(i._id))

  const toggleSelect = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const selectAllPending = () => setSelected(new Set(pending.map(i => i._id)))
  const clearSelection = () => setSelected(new Set())

  const handleGenerate = async () => {
    if (selectedPending.length === 0) return
    await queueIdeas({ ids: selectedPending.map(i => i._id) })
    clearSelection()
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Group gap="sm">
          <Text size="sm" c="dark.3">{pending.length} ready to generate</Text>
          {pending.length > 0 && (
            <Button size="compact-xs" variant="subtle" color="dark.3" onClick={selectAllPending}>
              Select all
            </Button>
          )}
          {selected.size > 0 && (
            <Button size="compact-xs" variant="subtle" color="dark.3" onClick={clearSelection}>
              Clear
            </Button>
          )}
        </Group>
        <Button
          onClick={handleGenerate}
          disabled={selectedPending.length === 0}
          color="brand"
          leftSection={<IconSparkles size={16} />}
        >
          Generate {selectedPending.length > 0 ? selectedPending.length : ''} selected
        </Button>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
        {(ideas as Idea[]).map(idea => (
          <IdeaListCard
            key={idea._id}
            idea={idea}
            selected={selected.has(idea._id)}
            onToggleSelect={() => toggleSelect(idea._id)}
            onDelete={() => deleteIdea({ id: idea._id })}
          />
        ))}
      </SimpleGrid>
    </Stack>
  )
}

// ─── IdeaListCard ─────────────────────────────────────────────────────────────

function IdeaListCard({
  idea, selected, onToggleSelect, onDelete,
}: {
  idea: Idea
  selected: boolean
  onToggleSelect: () => void
  onDelete: () => void
}) {
  const updateIdea = useMutation(api.ideas.updateIdea)

  const [activeTab, setActiveTab] = useState<string | null>('prompt')
  const [draft, setDraft] = useState({
    title: idea.title,
    typography: idea.typography,
    imageDescription: idea.imageDescription,
    style: idea.style,
    colorPalette: idea.colorPalette,
    mood: idea.mood,
    generationPrompt: idea.generationPrompt,
  })
  const [saving, setSaving] = useState(false)

  const isEditable = idea.status === 'pending' || idea.status === 'failed'
  const isDirty = JSON.stringify(draft) !== JSON.stringify({
    title: idea.title,
    typography: idea.typography,
    imageDescription: idea.imageDescription,
    style: idea.style,
    colorPalette: idea.colorPalette,
    mood: idea.mood,
    generationPrompt: idea.generationPrompt,
  })

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateIdea({ id: idea._id, ...draft })
    } finally {
      setSaving(false)
    }
  }

  const statusColor = {
    pending: 'gray',
    queued: 'yellow',
    generating: 'blue',
    failed: 'red',
  }[idea.status]

  const statusLabel = {
    pending: 'Pending',
    queued: 'Queued',
    generating: 'Generating…',
    failed: 'Failed',
  }[idea.status]

  const handleCardClick = (e: React.MouseEvent) => {
    if (!isEditable) return
    const target = e.target as HTMLElement
    if (target.closest('textarea, input, button, [role="tab"], [role="tablist"]')) return
    onToggleSelect()
  }

  return (
    <Paper
      radius="md"
      withBorder
      onClick={handleCardClick}
      style={{
        borderColor: selected ? 'var(--mantine-color-brand-6)' : 'var(--mantine-color-dark-5)',
        backgroundColor: 'var(--mantine-color-dark-8)',
        cursor: isEditable ? 'pointer' : 'default',
      }}
    >
      <Stack gap={0}>
        {/* Header */}
        <Group
          p="sm"
          justify="space-between"
          wrap="nowrap"
          style={{ borderBottom: '1px solid var(--mantine-color-dark-6)' }}
        >
          <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
            {isEditable && (
              <Checkbox
                checked={selected}
                onChange={onToggleSelect}
                onClick={e => e.stopPropagation()}
                color="brand"
                style={{ flexShrink: 0 }}
              />
            )}
            {idea.status === 'generating' && (
              <Loader size="xs" color="blue" style={{ flexShrink: 0 }} />
            )}
            <Text size="sm" fw={600} c="white" lineClamp={1} style={{ flex: 1 }}>
              {draft.title}
            </Text>
          </Group>
          <Group gap="xs" wrap="nowrap">
            <Badge size="xs" color={statusColor} variant="light">{statusLabel}</Badge>
            {isEditable && (
              <ActionIcon size="xs" color="red" variant="subtle" onClick={onDelete}>
                <IconTrash size={11} />
              </ActionIcon>
            )}
          </Group>
        </Group>

        {/* Error */}
        {idea.status === 'failed' && idea.errorMessage && (
          <Alert color="red" p="xs" radius={0} style={{ borderRadius: 0 }}>
            <Text size="xs">{idea.errorMessage}</Text>
          </Alert>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onChange={setActiveTab} color="brand">
          <Tabs.List style={{ borderBottom: '1px solid var(--mantine-color-dark-6)' }}>
            <Tabs.Tab value="prompt" style={{ fontSize: 12 }}>Prompt</Tabs.Tab>
            <Tabs.Tab value="fields" style={{ fontSize: 12 }}>Fields</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="prompt" p="sm">
            <Textarea
              value={draft.generationPrompt}
              onChange={e => isEditable && setDraft(d => ({ ...d, generationPrompt: e.currentTarget.value }))}
              readOnly={!isEditable}
              autosize
              minRows={3}
              maxRows={6}
              styles={{
                input: {
                  fontSize: 12,
                  backgroundColor: 'var(--mantine-color-dark-7)',
                  color: 'var(--mantine-color-white)',
                  border: 'none',
                },
              }}
            />
          </Tabs.Panel>

          <Tabs.Panel value="fields" p="sm">
            <Stack gap="xs">
              {[
                { key: 'title', label: 'Title' },
                { key: 'typography', label: 'Text copy' },
                { key: 'imageDescription', label: 'Graphic' },
                { key: 'style', label: 'Art style' },
                { key: 'colorPalette', label: 'Colors' },
                { key: 'mood', label: 'Mood' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <Text size="xs" c="dark.3" fw={500} mb={2}>{label}</Text>
                  <Textarea
                    value={draft[key as keyof typeof draft]}
                    onChange={e => isEditable && setDraft(d => ({ ...d, [key]: e.currentTarget.value }))}
                    readOnly={!isEditable}
                    autosize
                    minRows={1}
                    maxRows={3}
                    styles={{
                      input: {
                        fontSize: 12,
                        backgroundColor: 'var(--mantine-color-dark-7)',
                        color: 'var(--mantine-color-white)',
                        border: 'none',
                        padding: '4px 8px',
                      },
                    }}
                  />
                </div>
              ))}
            </Stack>
          </Tabs.Panel>
        </Tabs>

        {/* Save button */}
        {isEditable && isDirty && (
          <Group p="sm" justify="flex-end" style={{ borderTop: '1px solid var(--mantine-color-dark-6)' }}>
            <Button size="compact-xs" color="brand" loading={saving} onClick={handleSave}>
              Save changes
            </Button>
          </Group>
        )}
      </Stack>
    </Paper>
  )
}

// ─── DesignCard ───────────────────────────────────────────────────────────────

function DesignCard({
  design, selectMode, bulkSelected, onToggleSelect, onDownload, onDelete,
}: {
  design: DesignOutput
  selectMode?: boolean
  bulkSelected?: boolean
  onToggleSelect?: () => void
  onDownload: (url: string) => void
  onDelete: () => void
}) {
  const [bgColor, setBgColor] = useState('#FFFFFF')
  const [expanded, setExpanded] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [generating, setGenerating] = useState(false)
  const [localResult, setLocalResult] = useState<string | null>(null)
  const [genError, setGenError] = useState<string | null>(null)

  // Background removal is the final step, so it wins over the upscale (which
  // still has a background). Recommended order: upscale first, then remove bg.
  const displayUrl = localResult ?? design.bgRemovedUrl ?? design.upscaledUrl ?? design.imageUrl
  const removeBg = useAction(api.designLabActions.removeBgForDesign)
  const upscale = useAction(api.designLabActions.upscaleDesign)
  const generateSingle = useAction(api.designLabActions.generateSingleDesign)
  const navigate = useNavigate()
  const [removingBg, setRemovingBg] = useState(false)
  const [upscaling, setUpscaling] = useState(false)

  const handleRemoveBg = async () => {
    setRemovingBg(true)
    try {
      // Remove the background from whatever is shown — the upscaled image if
      // it exists — so the cut-out keeps the higher resolution.
      await removeBg({ id: design._id, imageUrl: displayUrl })
    } finally {
      setRemovingBg(false)
    }
  }

  const handleUpscale = async () => {
    setUpscaling(true)
    try {
      // Upscale the pristine original for the cleanest high-res source.
      await upscale({ id: design._id, imageUrl: design.imageUrl })
    } finally {
      setUpscaling(false)
    }
  }

  const handleGenerate = async () => {
    if (!instruction.trim()) return
    setGenerating(true)
    setGenError(null)
    try {
      const { imageUrl } = await generateSingle({
        prompt: instruction.trim(),
        promptTitle: instruction.trim().slice(0, 60),
        conceptTitle: design.conceptTitle,
        referenceImageUrls: [design.imageUrl],
        nicheDescription: design.nicheDescription,
      })
      setLocalResult(imageUrl)
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const handleReset = () => {
    setLocalResult(null)
    setInstruction('')
    setGenError(null)
  }

  return (
    <Paper
      radius="md"
      withBorder
      style={{
        borderColor: bulkSelected
          ? 'var(--mantine-color-brand-5)'
          : expanded
          ? 'var(--mantine-color-brand-8)'
          : 'var(--mantine-color-dark-5)',
        backgroundColor: 'var(--mantine-color-dark-7)',
        overflow: 'hidden',
        cursor: selectMode ? 'pointer' : undefined,
      }}
      onClick={selectMode ? onToggleSelect : undefined}
    >
      {/* Image with background */}
      <div style={{ position: 'relative', aspectRatio: '1', backgroundColor: bgColor, transition: 'background-color 200ms ease' }}>
        <Image src={displayUrl} alt={design.promptTitle} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 8 }} />

        {/* Generating overlay */}
        {generating && (
          <div style={{
            position: 'absolute', inset: 0,
            backgroundColor: 'rgba(0,0,0,0.65)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Stack align="center" gap="xs">
              <Loader size="md" color="brand" />
              <Text size="xs" c="white">Generating…</Text>
            </Stack>
          </div>
        )}

        {/* Select mode overlay */}
        {selectMode && (
          <div style={{
            position: 'absolute', inset: 0,
            backgroundColor: bulkSelected ? 'rgba(84,116,180,0.18)' : 'transparent',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start',
            padding: 8,
            transition: 'background-color 150ms ease',
          }}>
            <Checkbox
              checked={!!bulkSelected}
              onChange={() => {}}
              color="brand"
              styles={{ input: { cursor: 'pointer' } }}
              onClick={e => e.stopPropagation()}
            />
          </div>
        )}

        {/* Action buttons — hidden in select/generating mode */}
        {!selectMode && !generating && (
          <Group gap={4} style={{ position: 'absolute', top: 6, right: 6 }}>
            <Tooltip label="Generate variations from this">
              <ActionIcon
                size="sm"
                variant="filled"
                style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
                onClick={() => navigate({ to: '/admin/design-lab/generate', search: { ref: displayUrl } })}
              >
                <IconLayoutGrid size={12} />
              </ActionIcon>
            </Tooltip>
            {!design.bgRemovedUrl && (
              <Tooltip label="Remove background">
                <ActionIcon
                  size="sm"
                  variant="filled"
                  style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
                  onClick={handleRemoveBg}
                  loading={removingBg}
                >
                  <IconScissors size={12} />
                </ActionIcon>
              </Tooltip>
            )}
            {!design.upscaledUrl && (
              <Tooltip label="Upscale (4×)">
                <ActionIcon
                  size="sm"
                  variant="filled"
                  style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
                  onClick={handleUpscale}
                  loading={upscaling}
                >
                  <IconArrowsMaximize size={12} />
                </ActionIcon>
              </Tooltip>
            )}
            <Tooltip label="Download">
              <ActionIcon size="sm" variant="filled" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} onClick={() => onDownload(displayUrl)}>
                <IconDownload size={12} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Delete">
              <ActionIcon size="sm" color="red" variant="filled" style={{ backgroundColor: 'rgba(120,0,0,0.7)' }} onClick={onDelete}>
                <IconTrash size={12} />
              </ActionIcon>
            </Tooltip>
          </Group>
        )}
      </div>

      {/* Color swatches — hidden in select mode */}
      {!selectMode && (
        <Group gap={4} px="xs" pt={6} wrap="wrap">
          {TSHIRT_COLORS.map(c => (
            <Tooltip key={c.value} label={c.label} withArrow position="top">
              <ColorSwatch
                color={c.value}
                size={16}
                onClick={() => setBgColor(c.value)}
                style={{
                  cursor: 'pointer',
                  outline: bgColor === c.value ? '2px solid var(--mantine-color-brand-5)' : '1px solid var(--mantine-color-dark-4)',
                  outlineOffset: 1,
                  borderRadius: '50%',
                }}
              />
            </Tooltip>
          ))}
        </Group>
      )}

      {/* Card footer */}
      <Stack gap={4} p="xs" pt={4}>
        <Text size="xs" fw={600} c="white" lineClamp={1}>{design.promptTitle}</Text>
        {!selectMode && (
          <Group gap={4}>
            <Tooltip label={expanded ? 'Close' : 'Quick edit'}>
              <ActionIcon
                size="sm"
                variant={expanded ? 'filled' : 'light'}
                color="brand"
                onClick={() => { setExpanded(e => !e); if (expanded) handleReset() }}
              >
                <IconSparkles size={12} />
              </ActionIcon>
            </Tooltip>
          </Group>
        )}
      </Stack>

      {/* Inline edit panel */}
      <Collapse expanded={expanded && !selectMode}>
        <Stack
          gap="xs"
          p="xs"
          style={{ borderTop: '1px solid var(--mantine-color-dark-5)' }}
        >
          {genError && (
            <Alert icon={<IconAlertCircle size={12} />} color="red" p="xs" radius="sm">
              <Text size="xs">{genError}</Text>
            </Alert>
          )}
          {localResult && !genError && (
            <Group gap={6} align="center">
              <IconCheck size={12} color="var(--mantine-color-green-5)" />
              <Text size="xs" c="green.4">Saved to library</Text>
              <Button size="compact-xs" variant="subtle" color="dark.3" onClick={handleReset}>
                Reset
              </Button>
            </Group>
          )}
          <Textarea
            placeholder="What do you want to change?"
            value={instruction}
            onChange={e => setInstruction(e.currentTarget.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate() }}
            autosize
            minRows={2}
            maxRows={4}
            disabled={generating}
            styles={{
              input: {
                fontSize: 12,
                backgroundColor: 'var(--mantine-color-dark-6)',
                color: 'var(--mantine-color-white)',
              },
            }}
          />
          <Group gap="xs" justify="space-between">
            <Button
              size="compact-xs"
              variant="subtle"
              color="dark.3"
              onClick={() => { setExpanded(false); handleReset() }}
            >
              Cancel
            </Button>
            <Button
              size="compact-xs"
              color="brand"
              onClick={handleGenerate}
              disabled={!instruction.trim()}
              loading={generating}
              leftSection={<IconSparkles size={11} />}
            >
              Generate
            </Button>
          </Group>
        </Stack>
      </Collapse>
    </Paper>
  )
}
