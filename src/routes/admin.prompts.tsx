import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useAction } from 'convex/react'
import { useConvexMutation, convexQuery } from '@convex-dev/react-query'
import { useEffect, useRef, useState } from 'react'
import { notifications } from '@mantine/notifications'
import {
  Container,
  Title,
  Text,
  Box,
  Group,
  Button,
  Textarea,
  Paper,
  Breadcrumbs,
  Anchor,
  Badge,
  Loader,
  ActionIcon,
  Collapse,
  ThemeIcon,
  Accordion,
} from '@mantine/core'
import { IconSparkles, IconX } from '@tabler/icons-react'
import { api } from '../../convex/_generated/api'

export const Route = createFileRoute('/admin/prompts')({
  component: AdminPromptsPage,
})

function AdminPromptsPage() {
  const { data: cfg } = useQuery(convexQuery(api.prompts.getPromptConfig, {}))
  const saveMutation = useMutation({ mutationFn: useConvexMutation(api.prompts.updatePromptConfig) })
  const resetMutation = useMutation({ mutationFn: useConvexMutation(api.prompts.resetPromptConfig) })

  const [coreInstructions, setCoreInstructions] = useState('')
  const [exactPrompt, setExactPrompt] = useState('')
  const [remixPrompt, setRemixPrompt] = useState('')
  const [colorAdaptSuffix, setColorAdaptSuffix] = useState('')
  const lastSyncedRef = useRef<{ core: string; e: string; r: string; c: string }>({
    core: '',
    e: '',
    r: '',
    c: '',
  })

  useEffect(() => {
    if (!cfg) return
    if (cfg.coreInstructions !== lastSyncedRef.current.core) {
      lastSyncedRef.current.core = cfg.coreInstructions
      setCoreInstructions(cfg.coreInstructions)
    }
    if (cfg.exactPrompt !== lastSyncedRef.current.e) {
      lastSyncedRef.current.e = cfg.exactPrompt
      setExactPrompt(cfg.exactPrompt)
    }
    if (cfg.remixPrompt !== lastSyncedRef.current.r) {
      lastSyncedRef.current.r = cfg.remixPrompt
      setRemixPrompt(cfg.remixPrompt)
    }
    if (cfg.colorAdaptSuffix !== lastSyncedRef.current.c) {
      lastSyncedRef.current.c = cfg.colorAdaptSuffix
      setColorAdaptSuffix(cfg.colorAdaptSuffix)
    }
  }, [cfg])

  const dirty =
    cfg !== undefined &&
    (coreInstructions !== cfg.coreInstructions ||
      exactPrompt !== cfg.exactPrompt ||
      remixPrompt !== cfg.remixPrompt ||
      colorAdaptSuffix !== cfg.colorAdaptSuffix)

  async function handleSave() {
    try {
      await saveMutation.mutateAsync({
        coreInstructions,
        exactPrompt,
        remixPrompt,
        colorAdaptSuffix,
      })
      notifications.show({
        title: 'Success',
        message: 'Composer settings saved',
        color: 'green',
      })
    } catch (err) {
      notifications.show({
        title: 'Error',
        message: err instanceof Error ? err.message : 'Save failed',
        color: 'red',
      })
    }
  }

  async function handleReset() {
    if (!confirm('Reset composer settings to defaults?')) return
    try {
      await resetMutation.mutateAsync({})
      notifications.show({
        title: 'Success',
        message: 'Reset to defaults',
        color: 'green',
      })
    } catch (err) {
      notifications.show({
        title: 'Error',
        message: err instanceof Error ? err.message : 'Reset failed',
        color: 'red',
      })
    }
  }

  return (
    <Container size="md" py={40}>
      <Paper
        radius="xl"
        p="xl"
        mb="xl"
        style={{
          background: 'linear-gradient(135deg, rgba(84, 116, 180, 0.1) 0%, rgba(84, 116, 180, 0.03) 100%)',
          border: '1px solid var(--mantine-color-dark-5)',
        }}
      >
        <Breadcrumbs mb={8}>
          <Anchor component={Link} to="/admin" size="sm" c="dark.2">
            Admin
          </Anchor>
          <Text size="sm" c="dark.1">Prompt composer</Text>
        </Breadcrumbs>
        <Title order={1} fz={30} fw={600} c="white">
          Prompt composer settings
        </Title>
        <Text c="dark.2" mt={4}>
          The composer LLM crafts a fresh prompt for every (product × template) pair using these
          instructions. Tweak these to change how aggressive the text / icon rewrite is, or how
          faithful the scene reproduction should be.
        </Text>
        <Paper
          radius="md"
          p="sm"
          mt="md"
          withBorder
          style={{
            backgroundColor: 'rgba(234, 179, 8, 0.1)',
            borderColor: 'rgba(234, 179, 8, 0.3)',
          }}
        >
          <Text size="xs" c="yellow.4">
            The composer sees both images plus the user's product analysis. Reference the template
            as <em>"the first image"</em> and the product as <em>"the second image"</em>.
          </Text>
        </Paper>
      </Paper>

      <Accordion
        multiple
        defaultValue={['core']}
        variant="separated"
        radius="lg"
        styles={{
          item: {
            backgroundColor: 'var(--mantine-color-dark-7)',
            borderColor: 'var(--mantine-color-dark-5)',
            '&[data-active]': {
              backgroundColor: 'var(--mantine-color-dark-7)',
            },
          },
          control: {
            '&:hover': {
              backgroundColor: 'var(--mantine-color-dark-6)',
            },
          },
          chevron: {
            color: 'var(--mantine-color-dark-2)',
          },
        }}
      >
        <Accordion.Item value="core">
          <Accordion.Control>
            <Group gap="sm">
              <Text fw={600} c="white">Core instructions</Text>
              <Badge size="xs" variant="light" color="brand">Required</Badge>
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            <Text size="xs" c="dark.2" mb="sm">
              Always applied. Defines what the composer LLM is for and what constraints always hold.
            </Text>
            <PromptFieldContent
              value={coreInstructions}
              onChange={setCoreInstructions}
              rows={10}
            />
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="exact">
          <Accordion.Control>
            <Text fw={600} c="white">Exact-mode addendum</Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Text size="xs" c="dark.2" mb="sm">
              Appended when the user selects Exact mode. Keep it short — just the mode-specific hint.
            </Text>
            <PromptFieldContent
              value={exactPrompt}
              onChange={setExactPrompt}
              rows={3}
            />
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="remix">
          <Accordion.Control>
            <Text fw={600} c="white">Remix-mode addendum</Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Text size="xs" c="dark.2" mb="sm">
              Appended when the user selects Remix mode.
            </Text>
            <PromptFieldContent
              value={remixPrompt}
              onChange={setRemixPrompt}
              rows={3}
            />
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="color">
          <Accordion.Control>
            <Text fw={600} c="white">Color-adapt addendum</Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Text size="xs" c="dark.2" mb="sm">
              Appended when the user enables Adapt Palette.
            </Text>
            <PromptFieldContent
              value={colorAdaptSuffix}
              onChange={setColorAdaptSuffix}
              rows={3}
            />
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>

      <Group justify="space-between" pt="lg" mt="xl" style={{ borderTop: '1px solid var(--mantine-color-dark-5)' }}>
        <Button
          variant="subtle"
          color="gray"
          onClick={handleReset}
          loading={resetMutation.isPending}
        >
          Reset to defaults
        </Button>
        <Group gap="md">
          {cfg?.updatedAt ? (
            <Text size="xs" c="dark.3">
              Last saved {new Date(cfg.updatedAt).toLocaleString()}
            </Text>
          ) : (
            <Text size="xs" c="dark.3">Using built-in defaults</Text>
          )}
          <Button
            color="brand"
            onClick={handleSave}
            disabled={!dirty}
            loading={saveMutation.isPending}
          >
            Save settings
          </Button>
        </Group>
      </Group>
    </Container>
  )
}

function PromptField({
  label,
  description,
  value,
  onChange,
  rows,
}: {
  label: string
  description: string
  value: string
  onChange: (v: string) => void
  rows: number
}) {
  const enhance = useAction(api.ai.enhancePrompt)
  const [enhanceOpen, setEnhanceOpen] = useState(false)
  const [instructions, setInstructions] = useState('')
  const [enhancing, setEnhancing] = useState(false)
  const [previous, setPrevious] = useState<string | null>(null)

  async function handleEnhance() {
    const trimmed = instructions.trim()
    if (!trimmed) {
      notifications.show({
        title: 'Error',
        message: 'Describe what to change',
        color: 'red',
      })
      return
    }
    setEnhancing(true)
    try {
      const { enhanced } = await enhance({ original: value, instructions: trimmed })
      setPrevious(value)
      onChange(enhanced)
      notifications.show({
        title: 'Success',
        message: 'Prompt updated — review and save',
        color: 'green',
      })
    } catch (err) {
      notifications.show({
        title: 'Error',
        message: err instanceof Error ? err.message : 'AI enhance failed',
        color: 'red',
      })
    } finally {
      setEnhancing(false)
    }
  }

  function handleUndo() {
    if (previous === null) return
    onChange(previous)
    setPrevious(null)
  }

  return (
    <Box>
      <Group justify="space-between" mb={4}>
        <Group gap="xs">
          <Text size="sm" fw={600} c="white">{label}</Text>
          <Badge
            size="sm"
            variant={enhanceOpen ? 'filled' : 'light'}
            color="brand"
            radius="xl"
            leftSection={<IconSparkles size={10} />}
            style={{ cursor: 'pointer' }}
            onClick={() => setEnhanceOpen((v) => !v)}
          >
            Enhance with AI
          </Badge>
          {previous !== null && !enhancing && (
            <Button
              variant="subtle"
              size="xs"
              color="gray"
              onClick={handleUndo}
            >
              Undo
            </Button>
          )}
        </Group>
        <Text size="xs" c="dark.3">{value.length} chars</Text>
      </Group>
      <Text size="xs" c="dark.2" mb="xs">{description}</Text>
      <Textarea
        value={value}
        onChange={(e) => {
          onChange(e.currentTarget.value)
          if (previous !== null) setPrevious(null)
        }}
        rows={rows}
        autosize
        minRows={rows}
        styles={{
          input: {
            fontFamily: 'monospace',
          },
        }}
      />

      <Collapse expanded={enhanceOpen}>
        <Paper
          radius="md"
          p="md"
          mt="sm"
          withBorder
          style={{
            backgroundColor: 'rgba(84, 116, 180, 0.1)',
            borderColor: 'rgba(84, 116, 180, 0.3)',
          }}
        >
          <Group justify="space-between" align="flex-start" mb="xs">
            <Box>
              <Text size="xs" fw={600} c="brand.4">Enhance with AI</Text>
              <Text size="xs" c="dark.2">
                Describe what to change — e.g. "make it more specific about lighting" or "add an instruction to preserve the logo".
              </Text>
            </Box>
            <ActionIcon
              variant="subtle"
              color="brand"
              size="sm"
              onClick={() => setEnhanceOpen(false)}
            >
              <IconX size={14} />
            </ActionIcon>
          </Group>
          <Textarea
            value={instructions}
            onChange={(e) => setInstructions(e.currentTarget.value)}
            placeholder="What would you like to change?"
            rows={2}
            disabled={enhancing}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                handleEnhance()
              }
            }}
          />
          <Group justify="space-between" mt="sm">
            <Text size="xs" c="dark.3">⌘/Ctrl+Enter to submit</Text>
            <Button
              size="xs"
              color="brand"
              onClick={handleEnhance}
              disabled={!instructions.trim()}
              loading={enhancing}
              leftSection={enhancing ? undefined : <IconSparkles size={12} />}
            >
              {enhancing ? 'Rewriting…' : 'Rewrite prompt'}
            </Button>
          </Group>
        </Paper>
      </Collapse>
    </Box>
  )
}

function PromptFieldContent({
  value,
  onChange,
  rows,
}: {
  value: string
  onChange: (v: string) => void
  rows: number
}) {
  const enhance = useAction(api.ai.enhancePrompt)
  const [enhanceOpen, setEnhanceOpen] = useState(false)
  const [instructions, setInstructions] = useState('')
  const [enhancing, setEnhancing] = useState(false)
  const [previous, setPrevious] = useState<string | null>(null)

  async function handleEnhance() {
    const trimmed = instructions.trim()
    if (!trimmed) {
      notifications.show({
        title: 'Error',
        message: 'Describe what to change',
        color: 'red',
      })
      return
    }
    setEnhancing(true)
    try {
      const { enhanced } = await enhance({ original: value, instructions: trimmed })
      setPrevious(value)
      onChange(enhanced)
      notifications.show({
        title: 'Success',
        message: 'Prompt updated — review and save',
        color: 'green',
      })
    } catch (err) {
      notifications.show({
        title: 'Error',
        message: err instanceof Error ? err.message : 'AI enhance failed',
        color: 'red',
      })
    } finally {
      setEnhancing(false)
    }
  }

  function handleUndo() {
    if (previous === null) return
    onChange(previous)
    setPrevious(null)
  }

  return (
    <Box>
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <Badge
            size="sm"
            variant={enhanceOpen ? 'filled' : 'light'}
            color="brand"
            radius="xl"
            leftSection={<IconSparkles size={10} />}
            style={{ cursor: 'pointer' }}
            onClick={() => setEnhanceOpen((v) => !v)}
          >
            Enhance with AI
          </Badge>
          {previous !== null && !enhancing && (
            <Button
              variant="subtle"
              size="xs"
              color="gray"
              onClick={handleUndo}
            >
              Undo
            </Button>
          )}
        </Group>
        <Text size="xs" c="dark.3">{value.length} chars</Text>
      </Group>
      <Textarea
        value={value}
        onChange={(e) => {
          onChange(e.currentTarget.value)
          if (previous !== null) setPrevious(null)
        }}
        rows={rows}
        autosize
        minRows={rows}
        styles={{
          input: {
            fontFamily: 'monospace',
            backgroundColor: 'var(--mantine-color-dark-6)',
          },
        }}
      />

      <Collapse expanded={enhanceOpen}>
        <Paper
          radius="md"
          p="md"
          mt="sm"
          withBorder
          style={{
            backgroundColor: 'rgba(84, 116, 180, 0.1)',
            borderColor: 'rgba(84, 116, 180, 0.3)',
          }}
        >
          <Group justify="space-between" align="flex-start" mb="xs">
            <Box>
              <Text size="xs" fw={600} c="brand.4">Enhance with AI</Text>
              <Text size="xs" c="dark.2">
                Describe what to change — e.g. "make it more specific about lighting"
              </Text>
            </Box>
            <ActionIcon
              variant="subtle"
              color="brand"
              size="sm"
              onClick={() => setEnhanceOpen(false)}
            >
              <IconX size={14} />
            </ActionIcon>
          </Group>
          <Textarea
            value={instructions}
            onChange={(e) => setInstructions(e.currentTarget.value)}
            placeholder="What would you like to change?"
            rows={2}
            disabled={enhancing}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                handleEnhance()
              }
            }}
          />
          <Group justify="space-between" mt="sm">
            <Text size="xs" c="dark.3">⌘/Ctrl+Enter to submit</Text>
            <Button
              size="xs"
              color="brand"
              onClick={handleEnhance}
              disabled={!instructions.trim()}
              loading={enhancing}
              leftSection={enhancing ? undefined : <IconSparkles size={12} />}
            >
              {enhancing ? 'Rewriting…' : 'Rewrite prompt'}
            </Button>
          </Group>
        </Paper>
      </Collapse>
    </Box>
  )
}
