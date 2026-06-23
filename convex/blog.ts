/**
 * Blog content — public, on-domain (/blog), source-agnostic.
 *
 * Ingestion is decoupled from rendering: an upstream source (today Outrank, via
 * the webhook in http.ts) calls `upsertFromOutrank`, which normalizes into the
 * `blogPosts` table and schedules image re-hosting to R2. The public queries
 * here are what the /blog routes read — so swapping the source (e.g. to a
 * headless CMS) later means re-pointing those loaders, not reshaping the table.
 *
 * All queries are PUBLIC (no auth): the blog is for anonymous readers + crawlers.
 */
import { v } from 'convex/values'
import { internalMutation, internalQuery, query } from './_generated/server'
import { internal } from './_generated/api'
import { isTestMode } from './testMocks'

const MAX_POSTS = 500

// ─── Public queries (read by the /blog routes, SSR) ─────────────────────────

/** Newest-first published posts — lightweight fields for the index/list. */
export const listPublished = query({
  args: {},
  handler: async (ctx) => {
    const posts = await ctx.db
      .query('blogPosts')
      .withIndex('by_status_publishedAt', (q) => q.eq('status', 'published'))
      .order('desc')
      .take(MAX_POSTS)
    return posts.map((p) => ({
      slug: p.slug,
      title: p.title,
      metaDescription: p.metaDescription ?? null,
      heroImageUrl: p.heroImageUrl ?? null,
      tags: p.tags ?? [],
      publishedAt: p.publishedAt,
    }))
  },
})

/** Full published post by slug (null if missing or hidden). */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const post = await ctx.db
      .query('blogPosts')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique()
    if (!post || post.status !== 'published') return null
    return {
      slug: post.slug,
      title: post.title,
      metaDescription: post.metaDescription ?? null,
      contentMarkdown: post.contentMarkdown,
      heroImageUrl: post.heroImageUrl ?? null,
      tags: post.tags ?? [],
      publishedAt: post.publishedAt,
      updatedAt: post.updatedAt,
    }
  },
})

/** Slugs + timestamps for sitemap.xml. */
export const listForSitemap = query({
  args: {},
  handler: async (ctx) => {
    const posts = await ctx.db
      .query('blogPosts')
      .withIndex('by_status_publishedAt', (q) => q.eq('status', 'published'))
      .order('desc')
      .take(MAX_POSTS)
    return posts.map((p) => ({ slug: p.slug, updatedAt: p.updatedAt }))
  },
})

// ─── Ingestion (called from the webhook) ────────────────────────────────────

/**
 * Upsert a normalized article (matched by slug, per Outrank's update contract),
 * then schedule image re-hosting to R2. Internal — only the webhook calls it.
 */
export const upsertFromOutrank = internalMutation({
  args: {
    externalId: v.optional(v.string()),
    slug: v.string(),
    title: v.string(),
    metaDescription: v.optional(v.string()),
    contentMarkdown: v.string(),
    heroImageUrl: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    publishedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const slug = args.slug.trim()
    if (!slug) throw new Error('Blog post slug is required')
    const now = Date.now()

    const existing = await ctx.db
      .query('blogPosts')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique()

    const fields = {
      source: 'outrank',
      externalId: args.externalId,
      slug,
      title: args.title.trim() || slug,
      metaDescription: args.metaDescription,
      contentMarkdown: args.contentMarkdown,
      // Store the upstream image URL for now; rehostImages swaps it for an R2
      // URL (and rewrites in-content images) shortly after.
      heroImageUrl: args.heroImageUrl,
      tags: args.tags,
      status: 'published' as const,
      imagesRehosted: false,
      publishedAt: args.publishedAt || now,
      updatedAt: now,
    }

    let postId
    if (existing) {
      await ctx.db.patch(existing._id, fields)
      postId = existing._id
    } else {
      postId = await ctx.db.insert('blogPosts', { ...fields, receivedAt: now })
    }

    // Re-host images out-of-band so the webhook returns 200 fast and the content
    // survives cancelling Outrank (images move to our R2). Skipped in tests
    // (the 'use node' action fetches the upstream CDN).
    if (!isTestMode()) {
      await ctx.scheduler.runAfter(0, internal.blogImages.rehostImages, { postId })
    }
    return postId
  },
})

/** Source fields the image re-hoster needs (internal). */
export const _getForRehost = internalQuery({
  args: { postId: v.id('blogPosts') },
  handler: async (ctx, { postId }) => {
    const post = await ctx.db.get(postId)
    if (!post) return null
    return {
      contentMarkdown: post.contentMarkdown,
      heroImageUrl: post.heroImageUrl ?? null,
    }
  },
})

/** Patch a post after its images have been re-hosted to R2. */
export const _applyRehostedImages = internalMutation({
  args: {
    postId: v.id('blogPosts'),
    contentMarkdown: v.string(),
    heroImageUrl: v.optional(v.string()),
    imageKeys: v.array(v.string()),
  },
  handler: async (ctx, { postId, contentMarkdown, heroImageUrl, imageKeys }) => {
    const post = await ctx.db.get(postId)
    if (!post) return null
    await ctx.db.patch(postId, {
      contentMarkdown,
      heroImageUrl: heroImageUrl ?? post.heroImageUrl,
      imageKeys,
      imagesRehosted: true,
      updatedAt: Date.now(),
    })
    return null
  },
})

// ─── Admin-ish maintenance (optional, gated by internal usage) ──────────────

/** Hide or re-show a post (e.g. moderation). Internal use only. */
export const _setStatus = internalMutation({
  args: {
    slug: v.string(),
    status: v.union(v.literal('published'), v.literal('hidden')),
  },
  handler: async (ctx, { slug, status }) => {
    const post = await ctx.db
      .query('blogPosts')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique()
    if (!post) throw new Error('Post not found')
    await ctx.db.patch(post._id, { status, updatedAt: Date.now() })
    return null
  },
})
