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
    html?: string
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
          // Include 'html' so we can fish out lazy-loaded gallery images
          // (data-src, srcset) that markdown conversion drops.
          formats: ['markdown', 'html', 'json'],
          jsonOptions: {
            schema: FIRECRAWL_EXTRACTION_SCHEMA,
            prompt: FIRECRAWL_PROMPT,
          },
          // onlyMainContent strips image carousels, sidebars, and nav —
          // including product galleries Firecrawl considers "supporting".
          // Disable it so the LLM sees every gallery thumbnail.
          onlyMainContent: false,
          // Trigger lazy-loaded gallery images by scrolling before snapshot.
          // Most product galleries use IntersectionObserver to load images
          // only when scrolled into view; without this the gallery never
          // hydrates beyond the hero.
          actions: [
            { type: 'wait', milliseconds: 1500 },
            { type: 'scroll', direction: 'down' },
            { type: 'wait', milliseconds: 800 },
            { type: 'scroll', direction: 'down' },
            { type: 'wait', milliseconds: 800 },
          ],
          // Default Firecrawl timeout is 30s for both render + extraction.
          // LLM extraction with our richer schema + scroll actions needs
          // more headroom.
          timeout: 60000,
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

        // Pull candidate images from four sources, in order of trust:
        // 1) Firecrawl's LLM extraction (high precision, low recall)
        // 2) og:image meta tag (high precision, single image)
        // 3) Markdown <img> URLs (medium recall, drops lazy-load attrs)
        // 4) Raw HTML <img> tag attrs incl data-src + srcset (highest
        //    recall, catches lazy-loaded gallery images that the other
        //    sources miss)
        const markdownImages = extractMarkdownImageUrls(scrapePayload.data.markdown ?? '')
        const htmlImages = extractHtmlImageUrls(scrapePayload.data.html ?? '')
        const rawImageUrls = [
          ...(extracted.productImageUrls ?? []),
          ...(fallbackImage ? [fallbackImage] : []),
          ...markdownImages,
          ...htmlImages,
        ]
        const candidateImages = uniqueValidImages(rawImageUrls).slice(0, 5)
        console.log(
          `[urlImport ${importId}] image urls: raw=${rawImageUrls.length} ` +
            `(llm=${(extracted.productImageUrls ?? []).length} ` +
            `og=${fallbackImage ? 1 : 0} ` +
            `markdown=${markdownImages.length} ` +
            `html=${htmlImages.length}) ` +
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
        const rawDescription = (extracted.productDescription || fallbackDescription || '').slice(0, 4000)
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
        const rawCategory =
          typeof extracted.productCategory === 'string'
            ? extracted.productCategory.trim().slice(0, 60).toLowerCase() || undefined
            : undefined
        const rawTags =
          Array.isArray(extracted.productTags) && extracted.productTags.length > 0
            ? extracted.productTags
                .map((t) => (typeof t === 'string' ? t.trim().toLowerCase() : ''))
                .filter((t) => t.length > 0 && t.length <= 40)
                .slice(0, 8)
            : undefined

        // Distill verbose Firecrawl output into tight, AI-ready fields.
        // Best-effort: if the LLM call or JSON parse fails, fall back to
        // the raw scrape data (truncated). Never block product creation.
        await ctx.runMutation(internal.urlImports.patchImportStatus, {
          importId,
          status: 'extracting',
          currentStep: 'Distilling product details',
        })
        const distilled = await distillImportedProduct(ctx, {
          name: productName,
          description: rawDescription,
          category: rawCategory,
          tags: rawTags,
        })

        productId = await ctx.runMutation(internal.products.createProductFromImport, {
          userId: importRow.userId,
          name: productName,
          imageUrls: uploadedUrls,
          customerLanguage: productReviewSnippets,
          ...(distilled.description ? { description: distilled.description } : {}),
          ...(cleanPrice != null ? { price: cleanPrice } : {}),
          ...(cleanCurrency ? { currency: cleanCurrency } : {}),
          ...(distilled.category ? { category: distilled.category } : {}),
          ...(distilled.tags && distilled.tags.length > 0 ? { tags: distilled.tags } : {}),
          ...(distilled.aiNotes ? { aiNotes: distilled.aiNotes } : {}),
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

// Pulls image URLs out of raw HTML, including lazy-load attributes
// (data-src, data-srcset) and srcset variants. Markdown conversion
// drops these because lazy-loaded <img> tags often have an empty
// or 1×1 placeholder src= and the real URL lives in data-src.
//
// For srcset attributes we deliberately pick the LARGEST candidate
// (highest 'w' or 'x' descriptor) so we don't end up with the
// thumbnail-sized lazy-load placeholder.
function extractHtmlImageUrls(html: string): string[] {
  if (!html) return []
  const out: string[] = []
  const imgTagRe = /<img\b[^>]*>/gi
  const attrRe = /\b(data-src|data-original|data-srcset|src|srcset)=["']([^"']+)["']/gi
  let imgMatch: RegExpExecArray | null
  while ((imgMatch = imgTagRe.exec(html)) !== null) {
    const tag = imgMatch[0]
    let attrMatch: RegExpExecArray | null
    while ((attrMatch = attrRe.exec(tag)) !== null) {
      const attrName = attrMatch[1].toLowerCase()
      const value = attrMatch[2]
      if (!value) continue
      const isSrcset = attrName.endsWith('srcset')
      if (isSrcset) {
        // srcset format: "url1 100w, url2 800w, url3 2048w" or "url1 1x, url2 2x"
        // Pick the URL with the largest descriptor.
        let bestUrl: string | undefined
        let bestSize = -Infinity
        for (const part of value.split(',')) {
          const tokens = part.trim().split(/\s+/)
          const url = tokens[0]
          const desc = tokens[1] ?? ''
          if (!url) continue
          const m = desc.match(/(\d+(?:\.\d+)?)([wx])/i)
          // Treat plain "1x" as the baseline, "w" descriptors as actual width.
          const size = m ? parseFloat(m[1]) : 0
          if (size > bestSize) {
            bestSize = size
            bestUrl = url
          }
        }
        if (bestUrl) out.push(bestUrl)
      } else {
        out.push(value)
      }
    }
    // Reset attrRe lastIndex per tag (it's a /g regex)
    attrRe.lastIndex = 0
  }
  return out
}

// Many image CDNs serve the same image at multiple sizes via path
// tokens (Shopify "_100x100", "_320x"), query params (?width=100),
// or path segments (.../w_120/...). Lazy-loaded galleries often
// reference the small preview by default. Rewrite obvious
// thumbnail patterns to a high-resolution variant.
function upgradeToHighResImageUrl(rawUrl: string): string {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return rawUrl
  }

  // Shopify CDN: ".../t-shirt_100x100.jpg" → strip the size token so we get
  // the original. The CDN serves the original when no size suffix is present.
  // Match _NxN, _Nx, _xN where N is digits, just before the extension.
  parsed.pathname = parsed.pathname.replace(
    /(_\d+x\d*|_x\d+)(?=\.[a-z]{2,5}$)/i,
    '',
  )

  // Cloudinary: ".../w_120,h_120,c_fill/.../image.jpg" — drop common small
  // transformations so the original is served. We're conservative: only
  // strip transformations that look like resize-only segments.
  parsed.pathname = parsed.pathname.replace(
    /\/(w_\d+|h_\d+|c_(?:fill|fit|scale)|q_auto|f_auto)(?:,(?:w_\d+|h_\d+|c_(?:fill|fit|scale)|q_auto|f_auto))*\//gi,
    '/',
  )

  // Generic resize query params: width, w, height, h. Strip when small
  // (<400) so the CDN falls back to its default size.
  const stripParams = ['width', 'w', 'height', 'h']
  for (const p of stripParams) {
    const v = parsed.searchParams.get(p)
    if (v != null) {
      const n = parseInt(v, 10)
      if (Number.isFinite(n) && n < 400) parsed.searchParams.delete(p)
    }
  }

  return parsed.toString()
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
    // Upgrade thumbnail/lazy-load preview URLs to their high-res variants
    // BEFORE deduping, so two URLs that point at the same image at
    // different resolutions collapse to one.
    const upgraded = upgradeToHighResImageUrl(u)
    if (seen.has(upgraded)) continue
    seen.add(upgraded)
    out.push(upgraded)
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

// ─── LLM distillation ─────────────────────────────────────────────────────
// Firecrawl returns up to 1500 chars of raw marketing copy plus a noisy
// category guess plus 8 LLM-suggested tags. That's good for archival but
// too verbose for downstream prompts (ad copy generation, angle extraction)
// and won't fit our productDescription preview spaces. Distill into:
//   - description: 2-3 sentence value-prop, ≤280 chars
//   - category:   single common-noun, lowercase, ≤30 chars
//   - tags:       up to 6 lowercase keyword tags
//   - aiNotes:    2-3 sentence designer-facing note: audience, hooks,
//                 quirks worth knowing for ad creative
//
// Best-effort: any failure returns sensible fallbacks (truncated raw
// values) so we never block product creation on this LLM call.

type DistilledFields = {
  description?: string
  category?: string
  tags?: string[]
  aiNotes?: string
}

async function distillImportedProduct(
  ctx: { runAction: (ref: typeof internal.ai.callTextInternal, args: { prompt: string; systemPrompt?: string }) => Promise<string> },
  raw: { name: string; description: string; category?: string; tags?: string[] },
): Promise<DistilledFields> {
  // If there's nothing meaningful to distill, return the raw values as-is.
  if (!raw.description || raw.description.length < 40) {
    return {
      description: raw.description?.trim().slice(0, 280) || undefined,
      category: raw.category,
      tags: raw.tags,
    }
  }

  const systemPrompt =
    'You are a meticulous product-data distiller for an AI ad-generation system. ' +
    'You output STRICT JSON only — no preamble, no markdown fences, no commentary. ' +
    'Be terse and concrete; avoid marketing fluff and adjectives without substance.'

  const userPrompt =
    `Distill this raw product data into structured fields for downstream AI use.\n\n` +
    `PRODUCT NAME: ${raw.name}\n\n` +
    `RAW DESCRIPTION (verbose marketing copy from the source page):\n${raw.description}\n\n` +
    `CATEGORY GUESS: ${raw.category ?? '(none)'}\n` +
    `TAG GUESSES: ${(raw.tags ?? []).join(', ') || '(none)'}\n\n` +
    `Output STRICT JSON with this exact shape:\n` +
    `{\n` +
    `  "description": "2-3 sentence value-prop, lead with the product's core benefit, then a key differentiator. Max 280 characters. No fluff.",\n` +
    `  "category": "Single common-noun category like 'backpack', 'skincare', 'headphones'. Lowercase, max 30 chars.",\n` +
    `  "tags": ["up to 6 lowercase keyword tags (1-2 words each) describing distinctive features"],\n` +
    `  "aiNotes": "2-3 sentences for downstream AI: target audience, key hooks, anything that should shape ad creative. Max 400 characters."\n` +
    `}\n\n` +
    `Return ONLY the JSON.`

  let raw_text: string
  try {
    raw_text = await ctx.runAction(internal.ai.callTextInternal, {
      prompt: userPrompt,
      systemPrompt,
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[distillImportedProduct] LLM call failed:`, err)
    return {
      description: raw.description.trim().slice(0, 280),
      category: raw.category,
      tags: raw.tags,
    }
  }

  // Strip code fences if the model added them despite the system prompt.
  const cleaned = raw_text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[distillImportedProduct] JSON parse failed: ${err instanceof Error ? err.message : String(err)} preview=${cleaned.slice(0, 120)}`)
    return {
      description: raw.description.trim().slice(0, 280),
      category: raw.category,
      tags: raw.tags,
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      description: raw.description.trim().slice(0, 280),
      category: raw.category,
      tags: raw.tags,
    }
  }

  const obj = parsed as Record<string, unknown>
  const description =
    typeof obj.description === 'string' && obj.description.trim().length > 0
      ? obj.description.trim().slice(0, 320)
      : raw.description.trim().slice(0, 280)
  const category =
    typeof obj.category === 'string' && obj.category.trim().length > 0
      ? obj.category.trim().toLowerCase().slice(0, 60)
      : raw.category
  const tagsArr = Array.isArray(obj.tags) ? obj.tags : []
  const tags = tagsArr
    .map((t) => (typeof t === 'string' ? t.trim().toLowerCase() : ''))
    .filter((t) => t.length > 0 && t.length <= 40)
    .slice(0, 8)
  const aiNotes =
    typeof obj.aiNotes === 'string' && obj.aiNotes.trim().length > 0
      ? obj.aiNotes.trim().slice(0, 500)
      : undefined

  return {
    description,
    category,
    tags: tags.length > 0 ? tags : raw.tags,
    aiNotes,
  }
}
