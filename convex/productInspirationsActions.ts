'use node'

import { v } from 'convex/values'
import { action } from './_generated/server'
import { api } from './_generated/api'
import { uploadFromUrl } from './r2'
import { nanoid } from 'nanoid'

/**
 * Fetches og-image from a URL, uploads to R2, then saves as external
 * inspiration. Returns the inspiration ID and image URL, or throws an error.
 */
export const fetchAndSaveExternalInspiration = action({
  args: {
    productId: v.id('products'),
    sourceUrl: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { productId, sourceUrl, note }) => {
    // Fetch the page HTML and extract og:image
    let ogImageUrl: string | null = null
    try {
      const res = await fetch(sourceUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ProdSnapBot/1.0)',
          Accept: 'text/html',
        },
        redirect: 'follow',
      })
      if (!res.ok) throw new Error(`Failed to fetch URL: ${res.status}`)

      const html = await res.text()

      // Parse og:image from HTML — look for <meta property="og:image" content="...">
      const ogMatch = html.match(
        /<meta[^>]+property\s*=\s*["']og:image["'][^>]+content\s*=\s*["']([^"']+)["']/i,
      ) ?? html.match(
        /<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]+property\s*=\s*["']og:image["']/i,
      )

      if (ogMatch?.[1]) {
        ogImageUrl = ogMatch[1]
        // Handle relative URLs
        if (ogImageUrl.startsWith('/')) {
          const urlObj = new URL(sourceUrl)
          ogImageUrl = `${urlObj.origin}${ogImageUrl}`
        }
      }
    } catch (err) {
      throw new Error(
        `Could not fetch page. ${err instanceof Error ? err.message : 'Try uploading an image instead.'}`,
      )
    }

    if (!ogImageUrl) {
      throw new Error(
        'No preview image found on this page. Try uploading a screenshot instead.',
      )
    }

    // Upload og-image to R2
    const key = `inspirations/${nanoid()}-og`
    let publicUrl: string
    try {
      publicUrl = await uploadFromUrl(ogImageUrl, key)
    } catch (err) {
      throw new Error(
        `Could not download the preview image. ${err instanceof Error ? err.message : 'Try uploading manually.'}`,
      )
    }

    // Save as external inspiration via mutation
    const inspirationId = await ctx.runMutation(
      api.productInspirations.saveExternalInspiration,
      {
        productId,
        imageUrl: publicUrl,
        imageStorageKey: key,
        sourceUrl,
        note,
      },
    )

    return { inspirationId, imageUrl: publicUrl }
  },
})
