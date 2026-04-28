/**
 * Strategy view for a single product. Currently a placeholder — the real
 * marketing-analysis content (angles, value prop, audience hypotheses) lives
 * in `MarketingAnalysisPanel` inside studio.$productId.tsx and will move
 * here in Phase 6.
 */
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Anchor,
  Box,
  Button,
  Center,
  Container,
  Loader,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { IconBriefcase, IconArrowLeft } from '@tabler/icons-react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { capitalizeWords } from '../utils/strings'

export const Route = createFileRoute('/studio/$productId/strategy')({
  component: StrategyPage,
})

function StrategyPage() {
  const { productId } = Route.useParams()
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

  const angles = product.marketingAngles ?? []

  return (
    <Container size="md" py="md">
      <Stack gap="xl">
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

        <Paper
          p="xl"
          radius="lg"
          withBorder
          style={{
            backgroundColor: 'var(--mantine-color-dark-7)',
            borderColor: 'var(--mantine-color-dark-5)',
          }}
        >
          <Stack align="center" gap="md" py="md">
            <ThemeIcon
              size={56}
              radius="lg"
              variant="light"
              color="brand"
            >
              <IconBriefcase size={28} />
            </ThemeIcon>
            <Stack gap={4} align="center">
              <Title order={3} fz="lg" c="white">
                Strategy view coming soon
              </Title>
              <Text c="dark.2" size="sm" maw={460} ta="center">
                We'll surface marketing angles, audience hypotheses, and brand
                positioning here. For now, generate ads from the product page —
                we&apos;ve auto-discovered{' '}
                <Text component="span" fw={600} c="white">
                  {angles.length} angle{angles.length === 1 ? '' : 's'}
                </Text>{' '}
                for this product.
              </Text>
            </Stack>
            <Link
              to="/studio/$productId"
              params={{ productId: product._id }}
              style={{ textDecoration: 'none' }}
            >
              <Button color="brand" size="md">
                Back to product
              </Button>
            </Link>
          </Stack>
        </Paper>
      </Stack>
    </Container>
  )
}
