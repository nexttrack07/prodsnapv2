'use node'
/**
 * Re-host a blog post's images (hero + in-content) from the upstream CDN
 * (Outrank) to our R2 bucket, and rewrite the markdown to point at R2. Runs
 * out-of-band after ingest so the webhook can return 200 fast — and, crucially,
 * so the content keeps working after we cancel the upstream source.
 *
 * Failures are non-fatal: a single image that won't fetch falls back to its
 * original URL rather than failing the whole post.
 */
import { v } from 'convex/values'
import { internalAction } from './_generated/server'
import { internal } from './_generated/api'
import { uploadFromUrl } from './r2'
import { nanoid } from 'nanoid'

// Markdown image syntax: ![alt](url "optional title") — capture the URL.
const MD_IMAGE = /!\[[^\]]*\]\(\s*(\S+?)(?:\s+"[^"]*")?\s*\)/g

export const rehostImages = internalAction({
  args: { postId: v.id('blogPosts') },
  handler: async (ctx, { postId }) => {
    const post = await ctx.runQuery(internal.blog._getForRehost, { postId })
    if (!post) return null

    const r2Public = process.env.R2_PUBLIC_URL
    const isHttp = (u: string) => /^https?:\/\//i.test(u)
    const onR2 = (u: string) => !!r2Public && u.startsWith(r2Public)

    // Gather unique in-content image URLs worth re-hosting.
    const contentUrls = new Set<string>()
    let match: RegExpExecArray | null
    while ((match = MD_IMAGE.exec(post.contentMarkdown)) !== null) {
      const u = match[1]
      if (isHttp(u) && !onR2(u)) contentUrls.add(u)
    }

    const map = new Map<string, string>() // original URL → R2 URL (or original on failure)
    const imageKeys: string[] = []
    const rehost = async (url: string): Promise<string> => {
      const cached = map.get(url)
      if (cached) return cached
      try {
        const key = `blog/${postId}/${nanoid()}`
        const r2Url = await uploadFromUrl(url, key)
        map.set(url, r2Url)
        imageKeys.push(key)
        return r2Url
      } catch (err) {
        console.warn(`[blog rehost] ${url} failed: ${String(err)}`)
        map.set(url, url) // keep the original so the image still loads for now
        return url
      }
    }

    // Hero image first.
    let heroImageUrl = post.heroImageUrl ?? undefined
    if (heroImageUrl && isHttp(heroImageUrl) && !onR2(heroImageUrl)) {
      heroImageUrl = await rehost(heroImageUrl)
    }

    // Then in-content images.
    for (const u of contentUrls) await rehost(u)

    // Rewrite the markdown to point at the R2 copies (literal replace).
    let contentMarkdown = post.contentMarkdown
    for (const [orig, r2Url] of map) {
      if (orig !== r2Url) contentMarkdown = contentMarkdown.split(orig).join(r2Url)
    }

    await ctx.runMutation(internal.blog._applyRehostedImages, {
      postId,
      contentMarkdown,
      heroImageUrl,
      imageKeys,
    })
    return null
  },
})
