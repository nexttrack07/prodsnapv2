/// <reference types="vite/client" />
/**
 * Blog ingestion + rendering data layer:
 *   - Outrank webhook: auth, event normalization (publish_articles array vs
 *     update_article single), malformed-row skipping
 *   - upsertFromOutrank: insert + idempotent update-by-slug
 *   - public queries: getBySlug (published only), listPublished (newest-first)
 */
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { api, internal } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.*s')

const TOKEN = 'secret-token'

beforeEach(() => {
  // Test mode skips the 'use node' image-rehost scheduling; token authorizes the webhook.
  vi.stubEnv('CONVEX_TEST_MODE', 'true')
  vi.stubEnv('OUTRANK_WEBHOOK_TOKEN', TOKEN)
})
afterEach(() => vi.unstubAllEnvs())

function article(over: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    title: 'How to write Meta ads',
    content_markdown: '# Hook\n\nBody text.',
    content_html: '<h1>Hook</h1>',
    meta_description: 'A guide',
    created_at: '2026-01-02T10:00:00Z',
    image_url: 'https://cdn.outrank.so/img/a1.jpg',
    slug: 'how-to-write-meta-ads',
    tags: ['meta', 'ads'],
    ...over,
  }
}

// ─── Webhook ────────────────────────────────────────────────────────────────

test('webhook rejects missing/invalid bearer token', async () => {
  const t = convexTest(schema, modules)

  const noAuth = await t.fetch('/webhooks/outrank', {
    method: 'POST',
    body: JSON.stringify({ event_type: 'publish_articles', data: { articles: [article()] } }),
  })
  expect(noAuth.status).toBe(401)

  const badAuth = await t.fetch('/webhooks/outrank', {
    method: 'POST',
    headers: { Authorization: 'Bearer nope' },
    body: JSON.stringify({ event_type: 'publish_articles', data: { articles: [article()] } }),
  })
  expect(badAuth.status).toBe(401)
})

test('webhook schedules an upsert per valid article and skips malformed rows', async () => {
  const t = convexTest(schema, modules)

  const res = await t.fetch('/webhooks/outrank', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      event_type: 'publish_articles',
      data: {
        articles: [
          article({ slug: 'one' }),
          article({ slug: '', id: 'bad' }), // skipped: no slug
          article({ slug: 'two' }),
        ],
      },
    }),
  })
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ ok: true, scheduled: 2 })
})

// ─── Upsert + queries ─────────────────────────────────────────────────────────

test('upsertFromOutrank inserts a published post, then updates by slug (idempotent)', async () => {
  const t = convexTest(schema, modules)

  await t.mutation(internal.blog.upsertFromOutrank, {
    externalId: 'a1',
    slug: 'my-post',
    title: 'Original title',
    metaDescription: 'desc',
    contentMarkdown: '# Hi',
    heroImageUrl: 'https://cdn.outrank.so/img/a1.jpg',
    tags: ['x'],
    publishedAt: Date.parse('2026-01-02T10:00:00Z'),
  })

  // Re-publish/update with the SAME slug → patch, not duplicate.
  await t.mutation(internal.blog.upsertFromOutrank, {
    slug: 'my-post',
    title: 'Updated title',
    contentMarkdown: '# Updated',
    publishedAt: Date.parse('2026-01-02T10:00:00Z'),
  })

  const rows = await t.run((ctx) => ctx.db.query('blogPosts').collect())
  expect(rows).toHaveLength(1)
  expect(rows[0].title).toBe('Updated title')
  expect(rows[0].status).toBe('published')
  expect(rows[0].source).toBe('outrank')
  expect(rows[0].imagesRehosted).toBe(false)
})

test('getBySlug returns published posts and hides others; listPublished is newest-first', async () => {
  const t = convexTest(schema, modules)
  await t.run(async (ctx) => {
    const base = {
      source: 'outrank',
      contentMarkdown: '# x',
      imagesRehosted: true,
      receivedAt: Date.now(),
      updatedAt: Date.now(),
      status: 'published' as const,
    }
    await ctx.db.insert('blogPosts', { ...base, slug: 'older', title: 'Older', publishedAt: 1_000 })
    await ctx.db.insert('blogPosts', { ...base, slug: 'newer', title: 'Newer', publishedAt: 2_000 })
    await ctx.db.insert('blogPosts', {
      ...base,
      slug: 'secret',
      title: 'Hidden',
      publishedAt: 3_000,
      status: 'hidden' as const,
    })
  })

  expect((await t.query(api.blog.getBySlug, { slug: 'newer' }))?.title).toBe('Newer')
  expect(await t.query(api.blog.getBySlug, { slug: 'secret' })).toBeNull() // hidden
  expect(await t.query(api.blog.getBySlug, { slug: 'missing' })).toBeNull()

  const list = await t.query(api.blog.listPublished, {})
  expect(list.map((p) => p.slug)).toEqual(['newer', 'older']) // newest-first, hidden excluded
})
