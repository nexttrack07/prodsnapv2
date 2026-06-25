import { Link, createFileRoute, notFound } from '@tanstack/react-router'
import { convexQuery } from '@convex-dev/react-query'
import {
  AspectRatio,
  Anchor,
  Badge,
  Box,
  Container,
  Group,
  Image,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { IconArrowLeft } from '@tabler/icons-react'
import { api } from '../../convex/_generated/api'
import { seo } from '~/utils/seo'
import { BlogMarkdown } from '~/components/blog/BlogMarkdown'

const SITE_URL = 'https://prodsnap.io'

export const Route = createFileRoute('/blog/$slug')({
  loader: async ({ context, params }) => {
    const post = await context.queryClient.ensureQueryData(
      convexQuery(api.blog.getBySlug, { slug: params.slug }),
    )
    if (!post) throw notFound()
    return { post }
  },
  head: ({ loaderData, params }) => {
    const post = loaderData?.post
    const canonical = `${SITE_URL}/blog/${params.slug}`
    return {
      meta: [
        ...seo({
          title: post ? `${post.title} · ProdSnap Blog` : 'ProdSnap Blog',
          description: post?.metaDescription ?? undefined,
          image: post?.heroImageUrl ?? undefined,
        }),
        { name: 'og:type', content: 'article' },
      ],
      links: [{ rel: 'canonical', href: canonical }],
    }
  },
  component: BlogPost,
})

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function BlogPost() {
  const { post } = Route.useLoaderData()
  const { slug } = Route.useParams()

  // Article structured data for rich results. Rendered inline (type ld+json,
  // not executed) so crawlers read it from the SSR'd HTML.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.metaDescription ?? undefined,
    image: post.heroImageUrl ?? undefined,
    datePublished: new Date(post.publishedAt).toISOString(),
    dateModified: new Date(post.updatedAt).toISOString(),
    mainEntityOfPage: `${SITE_URL}/blog/${slug}`,
    publisher: {
      '@type': 'Organization',
      name: 'ProdSnap',
      url: SITE_URL,
    },
  }

  return (
    <Container size={760} py={56}>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Anchor component={Link} to="/blog" c="dark.2" mb="lg" style={{ display: 'inline-block' }}>
        <Group gap={6}>
          <IconArrowLeft size={15} />
          <Text size="sm">All posts</Text>
        </Group>
      </Anchor>

      <Stack gap="md" mb="xl">
        <Title order={1} c="dark.0" fz={{ base: 30, sm: 38 }} lh={1.15}>
          {post.title}
        </Title>
        <Group gap="xs" wrap="wrap">
          <Text size="sm" c="dark.3">
            {formatDate(post.publishedAt)}
          </Text>
          {post.tags.length > 0 &&
            post.tags.map((t) => (
              <Badge key={t} size="sm" variant="light" color="dark">
                {t}
              </Badge>
            ))}
        </Group>
      </Stack>

      {post.heroImageUrl && (
        <AspectRatio ratio={16 / 9} mb="xl">
          <Image
            src={post.heroImageUrl}
            alt={post.title}
            radius="md"
            style={{ objectFit: 'cover', border: '1px solid var(--mantine-color-dark-6)' }}
          />
        </AspectRatio>
      )}

      <Box>
        <BlogMarkdown markdown={post.contentMarkdown} />
      </Box>
    </Container>
  )
}
