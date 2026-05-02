'use node'
/**
 * Node-runtime orchestration for URL imports. Lives in its own file because
 * 'use node' files can only export actions (Convex restriction); the V8
 * surface — public mutations + queries — is in `urlImports.ts`.
 */
import { v } from 'convex/values'
import { internalAction } from './_generated/server'
import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { uploadFromUrl } from './r2'
import { nanoid } from 'nanoid'

type FirecrawlExtractedJson = {
  productName?: string
  productDescription?: string
  productImageUrls?: string[]
  productPrice?: number
  productCurrency?: string
  productCategory?: string
  productTags?: string[]
  brandLogoUrl?: string
  brandPrimaryColor?: string
  brandSecondaryColor?: string
  brandTagline?: string
  reviewSnippets?: string[]
}

type FirecrawlScrapeResponse = {
  success?: boolean
  data?: {
    markdown?: string
    json?: FirecrawlExtractedJson
    metadata?: {
      title?: string
      ogImage?: string
      description?: string
      ogDescription?: string
      'og:description'?: string
      ogTitle?: string
      'og:title'?: string
    }
  }
  error?: string
}

const FIRECRAWL_EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    productName: { type: 'string', description: 'The product name as shown on the page' },
    productDescription: {
      type: 'string',
      description:
        'The FULL marketing-grade product description. Include every paragraph of marketing copy, every bullet of features, every spec/material/dimension/use-case mentioned. Up to 1500 characters. Concatenate sections separated by double-newlines. Do NOT summarize — copy the actual text from the page.',
    },
    productImageUrls: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Up to 8 DIRECT IMAGE FILE URLs (must end in .jpg, .jpeg, .png, .webp, .gif, or .avif, OR be hosted on a recognized image CDN like cdn.shopify.com, cloudinary, wixstatic, etc). Include EVERY product gallery image, every angle, every variant — not just the hero. Look in <img src>, srcset, the product gallery component, og:image, JSON-LD images. DO NOT return product page URLs, variant URLs, navigation links — only URLs that point at actual image files.',
    },
    productPrice: {
      type: 'number',
      description:
        'The numeric current price of the product (no currency symbol, no thousands separator). If a sale price exists, use the sale price. If pricing is "from X" or has multiple variants, use the lowest. Omit if no clear price is on the page.',
    },
    productCurrency: {
      type: 'string',
      description:
        'The ISO 4217 currency code (USD, EUR, GBP, CAD, AUD, JPY, etc) inferred from the price symbol or page. Three uppercase letters.',
    },
    productCategory: {
      type: 'string',
      description:
        'A single short product category like "backpack", "skincare", "supplements", "footwear", "headphones". Use the most specific common-noun category — not a brand or collection name.',
    },
    productTags: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Up to 8 short keyword tags describing the product (lowercase, single words or 2-word phrases). Examples: "weatherproof", "vegan", "noise-cancelling". Empty array if nothing distinctive.',
    },
    brandLogoUrl: {
      type: 'string',
      description: 'URL to the brand logo image, usually in the header',
    },
    brandPrimaryColor: {
      type: 'string',
      description:
        "The brand's primary color as a hex string (#rrggbb), inferred from header/CTAs",
    },
    brandSecondaryColor: {
      type: 'string',
      description: 'Secondary brand color as a hex string, if present',
    },
    brandTagline: {
      type: 'string',
      description: "The brand's tagline or short positioning line",
    },
    reviewSnippets: {
      type: 'array',
      items: { type: 'string' },
      description: 'Up to 5 short authentic phrases from customer reviews on this page (1-2 sentences each). Skip generic praise; pick specific, descriptive language about outcomes or experiences. Empty array if no reviews are visible.',
    },
  },
}

const FIRECRAWL_PROMPT =
  'Extract the primary product on this page along with brand identity hints. Be EXHAUSTIVE on description (full marketing copy, full feature list), images (every gallery angle), price, currency, and category. Skip blog posts, listicles, and lifestyle content — only respond if this is a product page.'

export const runUrlImport = internalAction({
  args: { importId: v.id('urlImports') },
  handler: async (ctx, { importId }) => {
    const apiKey = process.env.FIRECRAWL_API_KEY
    if (!apiKey) {
      await ctx.runMutation(internal.urlImports.patchImportStatus, {
        importId,
        status: 'failed',
        error: 'FIRECRAWL_API_KEY is not configured on the server',
        finishedAt: Date.now(),
      })
      return
    }

    const importRow = await ctx.runQuery(internal.urlImports.getInternal, { importId })
    if (!importRow) return

    try {
      // 1. Scrape via Firecrawl
      await ctx.runMutation(internal.urlImports.patchImportStatus, {
        importId,
        status: 'scraping',
        currentStep: 'Fetching the page',
      })

      const scrapeRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          url: importRow.sourceUrl,
          formats: ['markdown', 'json'],
          jsonOptions: {
            schema: FIRECRAWL_EXTRACTION_SCHEMA,
            prompt: FIRECRAWL_PROMPT,
          },
          // onlyMainContent strips image carousels, sidebars, and nav —
          // including product galleries Firecrawl considers "supporting".
          // Disable it so the LLM sees every gallery thumbnail.
          onlyMainContent: false,
          // Bump the JS-render wait so React/Vue/Wix product pages have
          // time to hydrate the gallery before scrape runs.
          waitFor: 3000,
        }),
      })

      if (!scrapeRes.ok) {
        const detail = await safeReadText(scrapeRes)
        throw new Error(`Firecrawl returned ${scrapeRes.status}: ${detail.slice(0, 200)}`)
      }
      const scrapePayload = (await scrapeRes.json()) as FirecrawlScrapeResponse
      if (!scrapePayload.success || !scrapePayload.data) {
        throw new Error(scrapePayload.error ?? 'Firecrawl response was unsuccessful')
      }
      const extracted = scrapePayload.data.json ?? {}
      const meta = scrapePayload.data.metadata ?? {}
      const fallbackTitle = meta.title || meta.ogTitle || meta['og:title']
      const fallbackImage = meta.ogImage
      const fallbackDescription =
        meta.description || meta.ogDescription || meta['og:description']

      console.log(
        `[urlImport ${importId}] firecrawl extracted: ` +
          `name=${JSON.stringify((extracted.productName ?? '').slice(0, 60))} ` +
          `descLen=${extracted.productDescription?.length ?? 0} ` +
          `images=${(extracted.productImageUrls ?? []).length} ` +
          `metaTitle=${JSON.stringify(fallbackTitle?.slice(0, 60) ?? '')} ` +
          `metaDescLen=${fallbackDescription?.length ?? 0} ` +
          `metaOgImage=${fallbackImage ? 'yes' : 'no'} ` +
          `markdownLen=${scrapePayload.data.markdown?.length ?? 0}`,
      )

      const isBrandOnly = importRow.mode === 'brand-only'

      // 2-4. Product image extraction + upload + creation.
      // Skipped entirely for brand-only imports (used by onboarding).
      let productId: Id<'products'> | undefined
      if (!isBrandOnly) {
        await ctx.runMutation(internal.urlImports.patchImportStatus, {
          importId,
          status: 'extracting',
          currentStep: 'Reading product details',
        })

        // Pull candidate images from three sources, in order of trust:
        // 1) Firecrawl's LLM extraction (high precision, low recall)
        // 2) og:image meta tag (high precision, single image)
        // 3) <img src> URLs scraped from the page's markdown (high recall,
        //    needs filtering — looksLikeImageUrl rejects logos/icons/page
        //    URLs that sneak in)
        const markdownImages = extractMarkdownImageUrls(scrapePayload.data.markdown ?? '')
        const rawImageUrls = [
          ...(extracted.productImageUrls ?? []),
          ...(fallbackImage ? [fallbackImage] : []),
          ...markdownImages,
        ]
        const candidateImages = uniqueValidImages(rawImageUrls).slice(0, 5)
        console.log(
          `[urlImport ${importId}] image urls: raw=${rawImageUrls.length} ` +
            `(llm=${(extracted.productImageUrls ?? []).length} ` +
            `og=${fallbackImage ? 1 : 0} ` +
            `markdown=${markdownImages.length}) ` +
            `valid=${candidateImages.length} ` +
            `rejected=${rawImageUrls.length - candidateImages.length}`,
        )

        if (candidateImages.length === 0) {
          // Surface the raw URLs we got so the user knows whether Firecrawl
          // returned page links instead of image links.
          const sample = rawImageUrls.slice(0, 3).join(' | ')
          throw new Error(
            rawImageUrls.length > 0
              ? `No image URLs extracted — got page links instead of image files: ${sample}`
              : 'No product images could be extracted from this page',
          )
        }

        await ctx.runMutation(internal.urlImports.patchImportStatus, {
          importId,
          status: 'uploading',
          currentStep: `Uploading ${candidateImages.length} image${candidateImages.length === 1 ? '' : 's'}`,
        })

        const uploadedUrls: string[] = []
        const uploadErrors: string[] = []
        for (let i = 0; i < candidateImages.length; i++) {
          const sourceUrl = candidateImages[i]
          const ext = guessExtension(sourceUrl)
          const key = `imports/${importId}/${i}-${nanoid(8)}${ext}`
          try {
            const url = await uploadFromUrl(sourceUrl, key)
            uploadedUrls.push(url)
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            uploadErrors.push(message)
            // eslint-disable-next-line no-console
            console.warn(`[urlImport ${importId}] Failed to upload candidate ${i}: ${message}`)
          }
        }
        if (uploadedUrls.length === 0) {
          // Surface the actual per-image errors so the user can see whether
          // it's hotlink protection (403), missing files (404), bad URLs, etc.
          const summary = uploadErrors.slice(0, 3).join(' | ')
          throw new Error(
            `All extracted images failed to upload (${uploadErrors.length} attempted). First errors: ${summary || 'no detail captured'}`,
          )
        }

        const productName = (
          extracted.productName ||
          fallbackTitle ||
          'Imported product'
        ).slice(0, 80)
        const productDescription = (extracted.productDescription || fallbackDescription || '').slice(0, 1500)
        const productReviewSnippets = Array.isArray(extracted.reviewSnippets) && extracted.reviewSnippets.length > 0
          ? extracted.reviewSnippets
          : undefined
        // Sanity-check structured fields the LLM returned. Bad values get
        // dropped silently; the user can edit on the form.
        const cleanPrice =
          typeof extracted.productPrice === 'number' &&
          extracted.productPrice > 0 &&
          extracted.productPrice < 1_000_000
            ? extracted.productPrice
            : undefined
        const cleanCurrency =
          typeof extracted.productCurrency === 'string' &&
          /^[A-Z]{3}$/.test(extracted.productCurrency.trim())
            ? extracted.productCurrency.trim().toUpperCase()
            : undefined
        const cleanCategory =
          typeof extracted.productCategory === 'string'
            ? extracted.productCategory.trim().slice(0, 60).toLowerCase() || undefined
            : undefined
        const cleanTags =
          Array.isArray(extracted.productTags) && extracted.productTags.length > 0
            ? extracted.productTags
                .map((t) => (typeof t === 'string' ? t.trim().toLowerCase() : ''))
                .filter((t) => t.length > 0 && t.length <= 40)
                .slice(0, 8)
            : undefined
        productId = await ctx.runMutation(internal.products.createProductFromImport, {
          userId: importRow.userId,
          name: productName,
          imageUrls: uploadedUrls,
          customerLanguage: productReviewSnippets,
          ...(productDescription ? { description: productDescription } : {}),
          ...(cleanPrice != null ? { price: cleanPrice } : {}),
          ...(cleanCurrency ? { currency: cleanCurrency } : {}),
          ...(cleanCategory ? { category: cleanCategory } : {}),
          ...(cleanTags && cleanTags.length > 0 ? { tags: cleanTags } : {}),
        })
      } else {
        await ctx.runMutation(internal.urlImports.patchImportStatus, {
          importId,
          status: 'extracting',
          currentStep: 'Reading brand details',
        })
      }

      // 5. Upsert the brand kit (best-effort)
      let brandKitUpdated = false
      const colors = [extracted.brandPrimaryColor, extracted.brandSecondaryColor]
        .filter((c): c is string => typeof c === 'string' && /^#?[0-9a-f]{6}$/i.test(c.trim()))
        .map((c) => (c.startsWith('#') ? c : `#${c}`))

      let brandLogoR2Url: string | undefined
      let brandLogoStorageKey: string | undefined
      if (extracted.brandLogoUrl && /^https?:\/\//i.test(extracted.brandLogoUrl)) {
        try {
          const ext = guessExtension(extracted.brandLogoUrl)
          const key = `imports/${importId}/logo-${nanoid(8)}${ext}`
          brandLogoR2Url = await uploadFromUrl(extracted.brandLogoUrl, key)
          brandLogoStorageKey = key
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('Failed to upload brand logo:', err)
        }
      }

      const reviewSnippets = Array.isArray(extracted.reviewSnippets) && extracted.reviewSnippets.length > 0
        ? extracted.reviewSnippets
        : undefined

      const hasBrandData = brandLogoR2Url || colors.length > 0 || extracted.brandTagline || reviewSnippets
      if (hasBrandData) {
        // Derive a default brand name from the URL hostname (e.g. "lumiere.shop")
        let brandName: string | undefined
        try {
          brandName = new URL(importRow.sourceUrl).hostname.replace(/^www\./, '')
        } catch {
          // ignore URL parsing failures
        }

        await ctx.runMutation(internal.brandKits.upsertBrandKitFromImport, {
          userId: importRow.userId,
          name: brandName,
          logoUrl: brandLogoR2Url,
          logoStorageKey: brandLogoStorageKey,
          colors: colors.length > 0 ? colors : undefined,
          tagline: extracted.brandTagline,
          websiteUrl: importRow.sourceUrl,
          customerLanguage: reviewSnippets,
        })
        brandKitUpdated = true
      }

      // 6. Done
      await ctx.runMutation(internal.urlImports.patchImportStatus, {
        importId,
        status: 'done',
        currentStep: 'Done',
        productId,
        brandKitUpdated,
        finishedAt: Date.now(),
      })
    } catch (err) {
      // TODO(R2-sweeper): if image upload(s) succeeded but a later step
      // (createProductFromImport, brand-kit upsert) threw, the R2 objects we wrote
      // are orphaned. A periodic sweeper that cross-references the imports/{importId}/
      // prefix against successful import rows can reclaim them.
      const message = err instanceof Error ? err.message : String(err)
      await ctx.runMutation(internal.urlImports.patchImportStatus, {
        importId,
        status: 'failed',
        error: message,
        finishedAt: Date.now(),
      })
    }
  },
})

// ─── Helpers ──────────────────────────────────────────────────────────────
// Hostnames that serve images even when the URL has no file extension.
// Most product-image CDNs encode dimensions or version IDs in the path
// instead of an .ext suffix.
const IMAGE_CDN_HOSTS = [
  'cdn.shopify.com',
  'images.ctfassets.net',
  'res.cloudinary.com',
  'images.prismic.io',
  'cdn.bigcommerce.com',
  'static.wixstatic.com',
  'images.unsplash.com',
  'i.imgur.com',
  'cdn.squarespace.com',
  'images.squarespace-cdn.com',
  'shop.app',
  'cdn.shopifycdn.net',
  'd2v9y0dukr6mq2.cloudfront.net',
  'media-amazon.com',
  'm.media-amazon.com',
]

// Pulls every URL out of markdown image syntax: ![alt text](url).
// Firecrawl's markdown output converts the page's <img> tags into this
// shape, so this gives us a high-recall pool of every image that
// rendered on the page (gallery shots, lifestyle, swatches, etc.).
// Pair with looksLikeImageUrl() to filter out tracking pixels and
// logos that share the same syntax.
function extractMarkdownImageUrls(markdown: string): string[] {
  if (!markdown) return []
  const out: string[] = []
  // ![alt](url "optional title") — capture the URL up to the first
  // whitespace or closing paren.
  const re = /!\[[^\]]*\]\(([^)\s]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(markdown)) !== null) {
    if (m[1]) out.push(m[1])
  }
  return out
}

function looksLikeImageUrl(u: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(u)
  } catch {
    return false
  }
  // Direct image file extension wins outright.
  if (/\.(png|jpe?g|webp|gif|avif|svg)(?:$|\?)/i.test(parsed.pathname)) return true
  // Allowlisted image CDNs serve images at extensionless paths.
  const host = parsed.hostname.toLowerCase()
  if (IMAGE_CDN_HOSTS.some((cdn) => host === cdn || host.endsWith(`.${cdn}`))) return true
  return false
}

function uniqueValidImages(urls: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const u of urls) {
    if (!u || typeof u !== 'string') continue
    if (!/^https?:\/\//i.test(u)) continue
    if (!looksLikeImageUrl(u)) continue
    if (seen.has(u)) continue
    seen.add(u)
    out.push(u)
  }
  return out
}

function guessExtension(url: string): string {
  try {
    const path = new URL(url).pathname.toLowerCase()
    const m = path.match(/\.(png|jpe?g|webp|gif|svg|avif)$/)
    if (m) return `.${m[1] === 'jpeg' ? 'jpg' : m[1]}`
  } catch {
    /* ignore */
  }
  return ''
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text()
  } catch {
    return ''
  }
}
