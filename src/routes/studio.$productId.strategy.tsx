/**
 * Strategy view for a single product. Shows audience, value proposition, and
 * the full marketing-analysis panel with angles.
 */
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  Anchor,
  Badge,
  Box,
  Center,
  Container,
  Group,
  Loader,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { IconArrowLeft } from '@tabler/icons-react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { capitalizeWords } from '../utils/strings'
import { MarketingAnalysisPanel } from '../components/product/MarketingAnalysisPanel'

export const Route = createFileRoute('/studio/$productId/strategy')({
  component: StrategyPage,
})

function StrategyPage() {
  const { productId } = Route.useParams()
  const navigate = useNavigate()
  const { data: product, isLoading } = useQuery(
    convexQuery(api.products.getProduct, {
      productId: productId as Id<'products'>,
    }),
  )

  if (isLoading) {
    return (
      <Center mih="40vh">
        <Loader size="md" color="brand" />
      </Center>
    )
  }

  if (!product) {
    return (
      <Container size="md" py="xl">
        <Stack align="center" gap="md">
          <Title order={2}>Product not found</Title>
          <Anchor component={Link} to="/home" c="brand.5">
            Back to Home
          </Anchor>
        </Stack>
      </Container>
    )
  }

  const audienceChips = (product.targetAudience ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  return (
    <Container size="md" py="md">
      <Stack gap="xl">
        {/* Header */}
        <Stack gap="xs">
          <Link
            to="/studio/$productId"
            params={{ productId: product._id }}
            style={{
              textDecoration: 'none',
              color: 'var(--mantine-color-dark-2)',
              fontSize: 14,
            }}
          >
            <Box display="inline-flex" style={{ alignItems: 'center', gap: 4 }}>
              <IconArrowLeft size={14} /> Back to {capitalizeWords(product.name)}
            </Box>
          </Link>
          <Title order={1} fz={28} fw={700} c="white">
            Strategy
          </Title>
          <Text c="dark.2">
            Marketing analysis for {capitalizeWords(product.name)}.
          </Text>
        </Stack>

        {/* Audience */}
        {audienceChips.length > 0 && (
          <Box>
            <Text size="xs" tt="uppercase" fw={700} c="dark.2" mb={6}>
              Target audience
            </Text>
            <Group gap="xs">
              {audienceChips.map((chip) => (
                <Badge
                  key={chip}
                  size="md"
                  variant="light"
                  color="brand"
                  radius="sm"
                >
                  {chip}
                </Badge>
              ))}
            </Group>
          </Box>
        )}

        {/* Value proposition */}
        {product.valueProposition && (
          <Box>
            <Text size="xs" tt="uppercase" fw={700} c="dark.2" mb={6}>
              Value proposition
            </Text>
            <Text size="md" c="white" lh={1.6}>
              {product.valueProposition}
            </Text>
          </Box>
        )}

        {/* Marketing analysis panel */}
        <MarketingAnalysisPanel
          product={product}
          productId={product._id}
          onExploreAngle={(_filters, angleIndex) => {
            navigate({
              to: '/studio/$productId',
              params: { productId: product._id },
              search: { compose: 'true', angle: String(angleIndex) },
            })
          }}
        />
      </Stack>
    </Container>
  )
}
