'use node'
/**
 * Node-runtime orchestration for URL imports. Lives in its own file because
 * 'use node' files can only export actions (Convex restriction); the V8
 * surface — public mutations + queries — is in `urlImports.ts`.
 */
import { v } from 'convex/values'
import { internalAction } from './_generated/server'
import { internal } from './_generated/api'
import { uploadFromUrl } from './r2'

type FirecrawlExtractedJson = {
  productName?: string
  productDescription?: string
  productImageUrls?: string[]
  brandLogoUrl?: string
  brandPrimaryColor?: string
  brandSecondaryColor?: string
  brandTagline?: string
}

type FirecrawlScrapeResponse = {
  success?: boolean
  data?: {
    markdown?: string
    json?: FirecrawlExtractedJson
    metadata?: { title?: string; ogImage?: string }
  }
  error?: string
}

const FIRECRAWL_EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    productName: { type: 'string', description: 'The product name as shown on the page' },
    productDescription: {
      type: 'string',
      description: '1-2 sentence product description for marketing use',
    },
    productImageUrls: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Up to 5 product photo URLs from the page (PNG/JPG/WebP). Prefer high-resolution gallery images, skip thumbnails and lifestyle banners.',
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
  },
}

const FIRECRAWL_PROMPT =
  'Extract the primary product on this page along with brand identity hints. Skip blog posts, listicles, and lifestyle content — only respond if this is a product page.'

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
          onlyMainContent: true,
          waitFor: 1500,
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
      const fallbackTitle = scrapePayload.data.metadata?.title
      const fallbackImage = scrapePayload.data.metadata?.ogImage

      // 2. Pick the product image URLs
      await ctx.runMutation(internal.urlImports.patchImportStatus, {
        importId,
        status: 'extracting',
        currentStep: 'Reading product details',
      })

      const candidateImages = uniqueValidImages([
        ...(extracted.productImageUrls ?? []),
        ...(fallbackImage ? [fallbackImage] : []),
      ]).slice(0, 3)

      if (candidateImages.length === 0) {
        throw new Error('No product images could be extracted from this page')
      }

      // 3. Re-host images on R2
      await ctx.runMutation(internal.urlImports.patchImportStatus, {
        importId,
        status: 'uploading',
        currentStep: `Uploading ${candidateImages.length} image${candidateImages.length === 1 ? '' : 's'}`,
      })

      const uploadedUrls: string[] = []
      for (let i = 0; i < candidateImages.length; i++) {
        const sourceUrl = candidateImages[i]
        const ext = guessExtension(sourceUrl)
        const key = `imports/${importId}/${i}-${randomToken()}${ext}`
        try {
          const url = await uploadFromUrl(sourceUrl, key)
          uploadedUrls.push(url)
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn(`Failed to upload ${sourceUrl}:`, err)
        }
      }
      if (uploadedUrls.length === 0) {
        throw new Error('All extracted images failed to upload')
      }

      // 4. Create the product (this also schedules analysis)
      const productName = (
        extracted.productName ||
        fallbackTitle ||
        'Imported product'
      ).slice(0, 80)
      const productId = await ctx.runMutation(internal.products.createProductFromImport, {
        userId: importRow.userId,
        name: productName,
        imageUrls: uploadedUrls,
        sourceUrl: importRow.sourceUrl,
      })

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
          const key = `imports/${importId}/logo-${randomToken()}${ext}`
          brandLogoR2Url = await uploadFromUrl(extracted.brandLogoUrl, key)
          brandLogoStorageKey = key
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('Failed to upload brand logo:', err)
        }
      }

      const hasBrandData = brandLogoR2Url || colors.length > 0 || extracted.brandTagline
      if (hasBrandData) {
        await ctx.runMutation(internal.brandKits.upsertBrandKitFromImport, {
          userId: importRow.userId,
          logoUrl: brandLogoR2Url,
          logoStorageKey: brandLogoStorageKey,
          colors: colors.length > 0 ? colors : undefined,
          tagline: extracted.brandTagline,
          websiteUrl: importRow.sourceUrl,
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
function uniqueValidImages(urls: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const u of urls) {
    if (!u || typeof u !== 'string') continue
    if (!/^https?:\/\//i.test(u)) continue
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

function randomToken(): string {
  return Math.random().toString(36).slice(2, 10)
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text()
  } catch {
    return ''
  }
}
