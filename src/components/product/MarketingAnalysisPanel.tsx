import { useState, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useConvexMutation } from '@convex-dev/react-query'
import { notifications } from '@mantine/notifications'
import { useMediaQuery } from '@mantine/hooks'
import {
  Box,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import {
  IconRefresh,
  IconSparkles,
  IconLayoutGrid,
} from '@tabler/icons-react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import type { TemplateFilters } from './types'

// ── Angle-type metadata ──────────────────────────────────────────────────────

export const ANGLE_TYPE_META: Record<string, { color: string; label: string }> = {
  comparison: { color: 'blue', label: 'Comparison' },
  'curiosity-narrative': { color: 'grape', label: 'Curiosity' },
  'social-proof': { color: 'lime', label: 'Social proof' },
  'problem-callout': { color: 'orange', label: 'Problem callout' },
}

export function angleTypeColor(type: string): string {
  return ANGLE_TYPE_META[type]?.color ?? 'gray'
}

export function angleTypeLabel(type: string): string {
  return ANGLE_TYPE_META[type]?.label ?? type
}

// ── ReanalyzeMissingState ────────────────────────────────────────────────────

function ReanalyzeMissingState({ productId }: { productId: Id<'products'> }) {
  const reanalyzeProduct = useConvexMutation(api.products.reanalyzeProduct)
  const reanalyzeMutation = useMutation({ mutationFn: reanalyzeProduct })

  async function handleReanalyze() {
    try {
      await reanalyzeMutation.mutateAsync({ productId })
      notifications.show({
        title: 'Analysis restarted',
        message: 'We are analyzing this product again.',
        color: 'green',
      })
    } catch (err) {
      notifications.show({
        title: 'Retry failed',
        message: err instanceof Error ? err.message : 'Could not restart analysis',
        color: 'red',
      })
    }
  }

  return (
    <Box py={60} ta="center">
      <Text size="sm" c="dark.1" mb="md">
        No marketing analysis yet.
      </Text>
      <Button
        size="sm"
        variant="light"
        color="brand"
        leftSection={<IconRefresh size={14} />}
        loading={reanalyzeMutation.isPending}
        onClick={handleReanalyze}
      >
        Re-run analysis
      </Button>
    </Box>
  )
}

// ── GenerateFromAngleModal ───────────────────────────────────────────────────

function GenerateFromAngleModal({
  state,
  onClose,
  onSubmit,
}: {
  state: { angleIndex: number; angleTitle: string } | null
  onClose: () => void
  onSubmit: (args: { aspectRatio: '1:1' | '4:5' | '9:16'; count: number }) => Promise<void>
}) {
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '4:5' | '9:16'>('1:1')
  const [count, setCount] = useState(2)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      await onSubmit({ aspectRatio, count })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      opened={!!state}
      onClose={onClose}
      title={state ? `Generate visuals for "${state.angleTitle}"` : 'Generate from angle'}
      size="md"
      radius="md"
      centered
    >
      <Stack gap="md">
        <Box>
          <Text size="xs" tt="uppercase" fw={700} c="dark.2" mb={6}>
            Aspect ratio
          </Text>
          <SegmentedControl
            fullWidth
            value={aspectRatio}
            onChange={(v) => setAspectRatio(v as '1:1' | '4:5' | '9:16')}
            data={[
              { label: '1:1', value: '1:1' },
              { label: '4:5', value: '4:5' },
              { label: '9:16', value: '9:16' },
            ]}
          />
        </Box>
        <Box>
          <Text size="xs" tt="uppercase" fw={700} c="dark.2" mb={6}>
            Variations
          </Text>
          <SegmentedControl
            fullWidth
            value={String(count)}
            onChange={(v) => setCount(Number(v))}
            data={[
              { label: '1', value: '1' },
              { label: '2', value: '2' },
              { label: '3', value: '3' },
              { label: '4', value: '4' },
            ]}
          />
        </Box>
        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            color="brand"
            loading={submitting}
            onClick={handleSubmit}
            leftSection={<IconSparkles size={14} />}
          >
            Generate {count} variant{count === 1 ? '' : 's'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

// ── MarketingAnalysisPanel ───────────────────────────────────────────────────

export function MarketingAnalysisPanel({
  product,
  productId,
  onExploreAngle,
}: {
  product: {
    status: 'analyzing' | 'ready' | 'failed'
    valueProposition?: string
    marketingAngles?: Array<{
      title: string
      description: string
      hook: string
      suggestedAdStyle: string
      angleType?: string
      tags?: {
        productCategory?: string
        imageStyle?: string
        setting?: string
        primaryColor?: string
      }
    }>
  }
  productId: Id<'products'>
  onExploreAngle: (filters: TemplateFilters, angleIndex: number) => void
}) {
  const submitAngle = useConvexMutation(api.angleGenerations.submitAngleGeneration)
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [angleGenState, setAngleGenState] = useState<{
    angleIndex: number
    angleTitle: string
  } | null>(null)

  useEffect(() => {
    setAngleGenState(null)
  }, [productId])

  if (product.status === 'analyzing') {
    return (
      <Box py={60} ta="center">
        <Loader size="sm" mb="md" />
        <Text size="sm" c="dark.1">
          Analyzing your product to suggest marketing angles…
        </Text>
      </Box>
    )
  }

  if (product.status === 'failed' || !product.marketingAngles?.length) {
    return (
      <ReanalyzeMissingState productId={productId} />
    )
  }

  return (
    <>
      <Stack gap="lg">
        {product.valueProposition && (
          <Box>
            <Text size="xs" tt="uppercase" fw={700} c="dark.2" mb={6}>
              Value proposition
            </Text>
            <Title order={3} c="white">
              {product.valueProposition}
            </Title>
          </Box>
        )}
        <Box>
          <Text size="xs" tt="uppercase" fw={700} c="dark.2" mb={6}>
            Marketing angles
          </Text>
          <Stack gap="md">
            {product.marketingAngles.map((angle, index) => (
              <Paper
                key={`${angle.title}-${index}`}
                withBorder
                radius="md"
                p="lg"
                style={{ background: 'rgba(255,255,255,0.02)' }}
              >
                <Stack gap="md">
                  <Box style={{ flex: 1, minWidth: 200 }}>
                    <Group gap="sm" align="center">
                      <Text size="sm" fw={700} c="white">
                        {angle.title}
                      </Text>
                      <Badge size="xs" color="teal" variant="light" radius="sm">
                        {angle.suggestedAdStyle}
                      </Badge>
                      {angle.angleType && (
                        <Badge size="xs" color={angleTypeColor(angle.angleType)} variant="light" radius="sm">
                          {angleTypeLabel(angle.angleType)}
                        </Badge>
                      )}
                    </Group>
                    <Text mt={6} size="sm" c="dark.1">
                      {angle.description}
                    </Text>
                    <Text mt="xs" size="sm" c="dark.0" fs="italic">
                      "{angle.hook}"
                    </Text>
                  </Box>
                  <Group gap={6} wrap={isMobile ? 'wrap' : 'nowrap'}>
                    <Button
                      size="sm"
                      variant="light"
                      color="brand"
                      leftSection={<IconSparkles size={12} />}
                      fullWidth={isMobile}
                      onClick={() =>
                        setAngleGenState({ angleIndex: index, angleTitle: angle.title })
                      }
                    >
                      Generate visuals
                    </Button>
                    <Button
                      size="sm"
                      variant="default"
                      leftSection={<IconLayoutGrid size={12} />}
                      fullWidth={isMobile}
                      onClick={() => {
                        const filters: TemplateFilters = {
                          ...(angle.tags
                            ? {
                                productCategory: angle.tags.productCategory,
                                imageStyle: angle.tags.imageStyle,
                                setting: angle.tags.setting,
                              }
                            : {}),
                          ...(angle.angleType ? { angleType: angle.angleType } : {}),
                        }
                        onExploreAngle(filters, index)
                      }}
                    >
                      Explore templates
                    </Button>
                  </Group>
                </Stack>
              </Paper>
            ))}
          </Stack>
        </Box>
      </Stack>

      <GenerateFromAngleModal
        state={angleGenState}
        onClose={() => setAngleGenState(null)}
        onSubmit={async ({ aspectRatio, count }) => {
          if (!angleGenState) return
          try {
            await submitAngle({
              productId,
              angleIndex: angleGenState.angleIndex,
              aspectRatio,
              count,
            })
            notifications.show({
              title: 'Generating',
              message: `${count} variant${count === 1 ? '' : 's'} for "${angleGenState.angleTitle}". Watch the gallery.`,
              color: 'green',
            })
            setAngleGenState(null)
          } catch (err) {
            notifications.show({
              title: 'Couldn\'t start generation',
              message: err instanceof Error ? err.message : String(err),
              color: 'red',
            })
          }
        }}
      />
    </>
  )
}
