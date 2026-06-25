import { Link, createFileRoute } from '@tanstack/react-router'
import { convexQuery } from '@convex-dev/react-query'
import {
  AspectRatio,
  Badge,
  Box,
  Center,
  Container,
  Group,
  Image,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { IconNews } from '@tabler/icons-react'
import { api } from '../../convex/_generated/api'
import { seo } from '~/utils/seo'

export const Route = createFileRoute('/blog/')({
  loader: async ({ context }) => {
    const posts = await context.queryClient.ensureQueryData(
      convexQuery(api.blog.listPublished, {}),
    )
    return { posts }
  },
  head: () => ({
    meta: [
      ...seo({
        title: 'Blog · ProdSnap',
        description:
          'Guides, playbooks and ideas on AI ad creative, Meta ads, and product marketing for DTC brands.',
      }),
    ],
  }),
  component: BlogIndex,
})

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function BlogIndex() {
  const { posts } = Route.useLoaderData()

  return (
    <Container size="lg" py={64}>
      <Stack gap={4} mb="xl">
        <Title order={1} c="dark.0">
          Blog
        </Title>
        <Text c="dark.2" maw={620}>
          Playbooks on AI ad creative, Meta ads, and product marketing.
        </Text>
      </Stack>

      {posts.length === 0 ? (
        <Center mih="40vh">
          <Stack align="center" gap="xs">
            <IconNews size={32} color="var(--mantine-color-dark-3)" />
            <Text c="dark.3">No posts yet — check back soon.</Text>
          </Stack>
        </Center>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
          {posts.map((post) => (
            <Link
              key={post.slug}
              to="/blog/$slug"
              params={{ slug: post.slug }}
              style={{ textDecoration: 'none' }}
            >
              <Paper
                radius="md"
                withBorder
                style={{
                  overflow: 'hidden',
                  height: '100%',
                  borderColor: 'var(--mantine-color-dark-6)',
                  background: 'rgba(16,24,40,0.02)',
                }}
              >
                <AspectRatio ratio={16 / 9} style={{ background: 'var(--mantine-color-dark-7)' }}>
                  {post.heroImageUrl ? (
                    <Image src={post.heroImageUrl} alt="" style={{ objectFit: 'cover' }} />
                  ) : (
                    <Center>
                      <IconNews size={28} color="var(--mantine-color-dark-4)" />
                    </Center>
                  )}
                </AspectRatio>
                <Box p="md">
                  <Text size="xs" c="dark.3" mb={6}>
                    {formatDate(post.publishedAt)}
                  </Text>
                  <Title order={3} fz={18} c="dark.0" lineClamp={2} mb={6}>
                    {post.title}
                  </Title>
                  {post.metaDescription && (
                    <Text size="sm" c="dark.2" lineClamp={3}>
                      {post.metaDescription}
                    </Text>
                  )}
                  {post.tags.length > 0 && (
                    <Group gap={6} mt="sm" wrap="wrap">
                      {post.tags.slice(0, 3).map((t) => (
                        <Badge key={t} size="sm" variant="light" color="dark">
                          {t}
                        </Badge>
                      ))}
                    </Group>
                  )}
                </Box>
              </Paper>
            </Link>
          ))}
        </SimpleGrid>
      )}
    </Container>
  )
}
