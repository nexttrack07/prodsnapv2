'use node'

import { fal } from '@fal-ai/client'
import { v } from 'convex/values'
import { z } from 'zod'
import { action, internalAction } from './_generated/server'
import { internal } from './_generated/api'
import { uploadFromUrl } from './r2'
import { nanoid } from 'nanoid'
import {
  isTestMode,
  mockVisionResponse,
  mockTemplateTags,
  mockComposedPrompt,
  mockVariationPrompt,
  mockGeneratedImageUrl,
  mockDelay,
} from './testMocks'

// Configure fal client with API key
fal.config({ credentials: process.env.FAL_KEY })

// Model constants
const VISION_MODEL = 'google/gemini-2.5-flash'

// ─── Structured Tag Taxonomy ──────────────────────────────────────────────
// Each category requires exactly ONE selection - enables structured filtering

/** Product Category - What type of physical product is being advertised */
export const PRODUCT_CATEGORIES = [
  'beauty',        // makeup, cosmetics
  'skincare',      // serums, moisturizers, cleansers
  'haircare',      // shampoo, conditioner, styling
  'supplements',   // vitamins, protein, wellness pills
  'food',          // snacks, meals, ingredients
  'beverage',      // drinks, coffee, juice, alcohol
  'apparel',       // clothing, shoes, activewear
  'accessories',   // jewelry, bags, watches, sunglasses
  'electronics',   // gadgets, devices, tech
  'home',          // furniture, decor, kitchenware
  'fitness',       // equipment, yoga mats, weights
  'pet',           // pet food, toys, accessories
  'baby',          // infant products, toys
  'health',        // medical devices, wellness tools
  'cleaning',      // household cleaning products
  'other',         // catch-all for uncategorized
] as const

/** Primary Color - The dominant color palette in the image */
export const PRIMARY_COLORS = [
  'neutral',       // white, black, gray, beige
  'warm',          // red, orange, yellow, gold
  'cool',          // blue, teal, cyan
  'green',         // green, mint, sage
  'pink',          // pink, magenta, rose, coral
  'purple',        // violet, lavender, plum
  'earth',         // brown, tan, terracotta
  'pastel',        // light muted tones
  'vibrant',       // saturated, bold multi-color
  'monochrome',    // single color focus with tints/shades
] as const

/** Image Style - The overall visual style/type of the ad */
export const IMAGE_STYLES = [
  'product-hero',  // single product focus, clean presentation
  'lifestyle',     // product in use, real-world setting
  'flat-lay',      // top-down arrangement of items
  'infographic',   // text-heavy, stats, feature callouts
  'before-after',  // comparison/transformation
  'testimonial',   // quote, review, social proof style
  'collage',       // multiple images/elements combined
  'ugc-style',     // user-generated content aesthetic
  'editorial',     // magazine/high-fashion style
  'minimalist',    // lots of whitespace, very clean
] as const

/** Setting - The environment/backdrop of the photo */
export const SETTINGS = [
  'studio',        // plain backdrop, professional lighting
  'home',          // living room, bedroom, general home
  'bathroom',      // skincare/beauty setting
  'kitchen',       // food prep, counters
  'outdoor',       // nature, garden, beach
  'urban',         // street, city, cafe
  'gym',           // fitness, workout space
  'office',        // workspace, desk
  'abstract',      // gradients, patterns, shapes, no real setting
  'none',          // product floating, no distinct setting
] as const

/** Composition - Spatial arrangement of elements in the frame (NOT the visual style) */
export const COMPOSITIONS = [
  'centered',      // product in center focus
  'rule-of-thirds', // offset, dynamic placement
  'symmetrical',   // balanced, mirrored elements
  'diagonal',      // dynamic angles, movement
  'framed',        // product framed by other elements
  'scattered',     // multiple items spread out
  'stacked',       // layered, overlapping elements
  'close-up',      // tight crop, detail shot
  'full-frame',    // product fills entire frame
] as const

/** Text Presence - Amount of text/copy in the image */
export const TEXT_AMOUNTS = [
  'no-text',       // purely visual, no text
  'logo-only',     // just brand logo/name
  'minimal-text',  // short headline or tagline
  'moderate-text', // headline + supporting copy
  'text-heavy',    // lots of features, benefits, copy
  'price-focused', // price/discount prominently displayed
] as const

// Legacy arrays for backward compatibility
const AD_CATEGORIES = PRODUCT_CATEGORIES
const AD_MOODS = [
  'minimal', 'luxe', 'playful', 'natural', 'clinical', 'bold', 'cozy',
  'vibrant', 'dark', 'bright', 'retro', 'futuristic',
] as const

// ─── Helper: Call fal.ai Vision model ──────────────────────────────────────
async function callVision(opts: {
  imageUrls: string[]
  prompt: string
  systemPrompt?: string
}): Promise<string> {
  const result = await fal.subscribe('openrouter/router/vision', {
    input: {
      model: VISION_MODEL,
      image_urls: opts.imageUrls,
      prompt: opts.prompt,
      system_prompt: opts.systemPrompt,
      temperature: 0.3,
    },
  })
  const data = result.data as { output?: string; error?: string }
  if (data.error) throw new Error(`Vision model error: ${data.error}`)
  if (!data.output) throw new Error('Vision model returned no output')
  return data.output
}

// ─── Helper: Call fal.ai text model (no images) ────────────────────────────
async function callText(opts: {
  prompt: string
  systemPrompt?: string
}): Promise<string> {
  const result = await fal.subscribe('openrouter/router', {
    input: {
      model: VISION_MODEL,
      prompt: opts.prompt,
      system_prompt: opts.systemPrompt,
      temperature: 0.3,
    },
  })
  const data = result.data as { output?: string; error?: string }
  if (data.error) throw new Error(`Text model error: ${data.error}`)
  if (!data.output) throw new Error('Text model returned no output')
  return data.output
}

// ─── Helper: Parse JSON from LLM response ──────────────────────────────────
function parseJsonFromResponse<T>(response: string, schema: z.ZodType<T>): T {
  // Try to extract JSON from markdown code blocks or raw JSON
  let jsonStr = response.trim()

  // Remove markdown code block if present
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim()
  }

  // Try to find JSON object
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    jsonStr = jsonMatch[0]
  }

  try {
    const parsed = JSON.parse(jsonStr)
    return schema.parse(parsed)
  } catch (err) {
    const preview = response.slice(0, 200)
    throw new Error(
      `Failed to parse LLM response as JSON: ${err instanceof Error ? err.message : String(err)}\nResponse preview: ${preview}`,
    )
  }
}

// ─── Product analysis (vision) ─────────────────────────────────────────────
const productAnalysisSchema = z.object({
  category: z.enum(AD_CATEGORIES),
  productDescription: z.string().min(10).max(300),
  targetAudience: z.string().min(10).max(300),
})

export const analyzeProduct = internalAction({
  args: { imageUrl: v.string() },
  handler: async (_ctx, { imageUrl }) => {
    // Test mode: return mock response without calling AI
    if (isTestMode()) {
      await mockDelay()
      return mockVisionResponse
    }

    const analysisText = await callVision({
      imageUrls: [imageUrl],
      prompt: `Analyze this product image and return a JSON object with these exact fields:
{
  "category": "<one of: ${AD_CATEGORIES.join(', ')}>",
  "productDescription": "<25-30 word description of the product, key features, and use case>",
  "targetAudience": "<comma-separated list of 3-5 target audience segments>"
}

Return ONLY the JSON object, no other text.`,
      systemPrompt: 'You are a product analyst for marketing use cases. Be factual and concise. Return valid JSON only.',
    })

    const analysis = parseJsonFromResponse(analysisText, productAnalysisSchema)

    return {
      category: analysis.category,
      productDescription: analysis.productDescription,
      targetAudience: analysis.targetAudience,
    }
  },
})

// ─── Structured Tags Schema ───────────────────────────────────────────────
const structuredTagsSchema = z.object({
  // Required: Pick exactly ONE from each category
  productCategory: z.enum(PRODUCT_CATEGORIES),
  primaryColor: z.enum(PRIMARY_COLORS),
  imageStyle: z.enum(IMAGE_STYLES),
  setting: z.enum(SETTINGS),
  composition: z.enum(COMPOSITIONS),
  textAmount: z.enum(TEXT_AMOUNTS),
  // Optional refinements
  subcategory: z.string().max(40).nullable(),
  sceneDescription: z.string().min(20).max(600),
  // Legacy fields for backward compatibility
  moods: z.array(z.enum(AD_MOODS)).min(1).max(3),
})

export const computeTemplateTags = internalAction({
  args: { imageUrl: v.string() },
  handler: async (_ctx, { imageUrl }) => {
    // Test mode: return mock tags without calling AI
    if (isTestMode()) {
      await mockDelay()
      return {
        productCategory: 'electronics' as const,
        primaryColor: 'neutral' as const,
        imageStyle: 'product-hero' as const,
        setting: 'studio' as const,
        composition: 'centered' as const,
        textAmount: 'minimal-text' as const,
        subcategory: 'test-product',
        sceneDescription: 'A clean studio shot with soft lighting and minimal props for testing purposes.',
        moods: ['minimal' as const],
      }
    }

    const response = await callVision({
      imageUrls: [imageUrl],
      prompt: `Classify this product ad image for a template library.

Return a JSON object with these EXACT fields:

{
  "productCategory": "<one of: ${PRODUCT_CATEGORIES.join(', ')}>",
  "primaryColor": "<one of: ${PRIMARY_COLORS.join(', ')}>",
  "imageStyle": "<VISUAL FORMAT TYPE - one of: ${IMAGE_STYLES.join(', ')}>",
  "setting": "<one of: ${SETTINGS.join(', ')}>",
  "composition": "<SPATIAL ARRANGEMENT - one of: ${COMPOSITIONS.join(', ')}>",
  "textAmount": "<one of: ${TEXT_AMOUNTS.join(', ')}>",
  "subcategory": "<specific product type like 'serum', 'protein powder', or null>",
  "sceneDescription": "<2-3 SHORT sentences about lighting, props, and framing - max 100 words>",
  "moods": ["<1-3 moods from: ${AD_MOODS.join(', ')}>"]
}

CRITICAL: Pick EXACTLY ONE value from each category. Return ONLY the JSON object.`,
      systemPrompt: `You are a visual ad classifier for product photography templates. Your job is to categorize ad images with STRUCTURED tags that enable filtering and search.

CRITICAL RULES:
- Pick EXACTLY ONE value from each category - no exceptions
- Base your choices on what you ACTUALLY SEE in the image
- For productCategory, identify the PRIMARY product type being advertised
- For primaryColor, identify the DOMINANT color palette (not every color present)

IMPORTANT DISTINCTION - do NOT confuse these two fields:
- imageStyle = the VISUAL FORMAT TYPE (e.g., collage, infographic, flat-lay, lifestyle, product-hero)
- composition = the SPATIAL ARRANGEMENT of elements (e.g., centered, rule-of-thirds, symmetrical, diagonal)

For example: A collage IS an imageStyle. The composition of a collage might be "scattered" or "stacked".

- Be consistent: similar images should get similar tags
- Return valid JSON only, no markdown or extra text`,
    })

    return parseJsonFromResponse(response, structuredTagsSchema)
  },
})

// ─── Image generation (nano-banana-2) ───────────────────────────────────────
/**
 * Composes a per-job prompt by looking at both the template and the
 * user's product image with Gemini vision. Returns the final
 * prompt string ready for nano-banana.
 */
export const composePrompt = internalAction({
  args: { generationId: v.id('templateGenerations') },
  handler: async (
    ctx,
    { generationId },
  ): Promise<{ prompt: string }> => {
    // Test mode: return mock prompt without calling AI
    if (isTestMode()) {
      await mockDelay()
      return { prompt: mockComposedPrompt }
    }

    const ctxData = await ctx.runQuery(internal.studio.getGenerationContextInternal, {
      generationId,
    })
    if (!ctxData || !ctxData.generation) {
      throw new Error('Generation not found')
    }
    const { generation, productContext: prodCtx, template } = ctxData
    if (!prodCtx) throw new Error('Product/run context not found for generation')
    if (!template) throw new Error('Template not found for generation')

    const promptCfg = await ctx.runQuery(internal.prompts.getPromptConfigInternal, {})

    const addendum =
      generation.mode === 'exact' ? promptCfg.exactAddendum : promptCfg.remixAddendum
    const colorAdaptPart = generation.colorAdapt ? `\n\n${promptCfg.colorAdaptAddendum}` : ''
    const systemPrompt = `${promptCfg.coreInstructions}\n\n${addendum}${colorAdaptPart}`

    const productContextStr = [
      prodCtx.category ? `Product category: ${prodCtx.category}` : null,
      prodCtx.productDescription ? `Product description: ${prodCtx.productDescription}` : null,
      prodCtx.targetAudience ? `Target audience: ${prodCtx.targetAudience}` : null,
    ]
      .filter(Boolean)
      .join('\n')

    const templateContext = [
      template.category ? `Template category: ${template.category}` : null,
      template.subcategory ? `Template subcategory: ${template.subcategory}` : null,
      template.sceneTypes?.length ? `Template scene types: ${template.sceneTypes.join(', ')}` : null,
      template.moods?.length ? `Template moods: ${template.moods.join(', ')}` : null,
      template.sceneDescription ? `Template scene notes: ${template.sceneDescription}` : null,
    ]
      .filter(Boolean)
      .join('\n')

    const userText = [
      'FIRST IMAGE = ad template.',
      'SECOND IMAGE = user product.',
      '',
      productContextStr || '(no product analysis available)',
      '',
      templateContext || '(no template tags available)',
      '',
      'Compose the nano-banana prompt now. Return ONLY the prompt text.',
    ].join('\n')

    const text = await callVision({
      imageUrls: [generation.templateImageUrl, generation.productImageUrl],
      prompt: userText,
      systemPrompt,
    })

    const prompt = text.trim()
    if (!prompt) throw new Error('Composer returned an empty prompt')
    return { prompt }
  },
})

/**
 * Calls nano-banana using the dynamic prompt that composePrompt wrote
 * to the generation row. Uploads the result to R2 and returns the URL.
 */
export const generateFromTemplate = internalAction({
  args: { generationId: v.id('templateGenerations') },
  handler: async (
    ctx,
    { generationId },
  ): Promise<{ outputUrl: string }> => {
    // Test mode: return mock image URL without calling AI
    if (isTestMode()) {
      await mockDelay(500) // Simulate longer generation time
      return { outputUrl: mockGeneratedImageUrl }
    }

    const ctxData = await ctx.runQuery(internal.studio.getGenerationContextInternal, {
      generationId,
    })
    if (!ctxData?.generation) throw new Error('Generation not found')
    const { generation, template } = ctxData
    if (!generation.dynamicPrompt) {
      throw new Error('Dynamic prompt missing — composer step did not complete')
    }

    const aspectRatio = template?.aspectRatio ?? '1:1'

    let result: { data: unknown }
    try {
      result = await fal.subscribe('fal-ai/nano-banana-2/edit', {
        input: {
          prompt: generation.dynamicPrompt,
          image_urls: [generation.templateImageUrl, generation.productImageUrl],
          aspect_ratio: aspectRatio,
          output_format: 'png',
          resolution: '1K',
        },
      })
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err)
      if (/safety|blocked|rejected/i.test(raw)) {
        throw new Error(
          'Image model rejected the request (often a safety-filter block on brand/logo content — try a different template or soften the prompt in admin).',
        )
      }
      throw err
    }

    const data = result.data as { images?: Array<{ url?: string }> }
    const generatedUrl = data.images?.[0]?.url
    if (!generatedUrl) throw new Error('Model did not return an image URL')

    const key = `studio/outputs/${generation.runId ?? generation.productId}/${generation.variationIndex}-${nanoid(6)}.png`
    const outputUrl = await uploadFromUrl(generatedUrl, key, 'image/png')
    return { outputUrl }
  },
})

// ─── Variation generation ─────────────────────────────────────────────────

/**
 * Core helper: composes a variation prompt by calling the vision model.
 * Not a Convex action — plain async function, callable from actions directly.
 */
export async function composeVariationPromptCore({
  sourceImageUrl,
  productImageUrl,
  changeText,
  changeIcons,
  changeColors,
}: {
  sourceImageUrl: string
  productImageUrl?: string
  changeText: boolean
  changeIcons: boolean
  changeColors: boolean
}): Promise<{
  systemPrompt: string
  userPrompt: string
  imageUrlsPassed: string[]
  rawResponse: string
  prompt: string
}> {
  // Build description of what to change
  const changes: string[] = []
  if (changeText) changes.push('different text/headlines/copy')
  if (changeIcons) changes.push('different icons, badges, or decorative graphics')
  if (changeColors) {
    changes.push('a different color scheme for the BACKGROUND, TEXT, and GRAPHICS ONLY - the product itself must keep its original colors')
  }

  const changeDescription = changes.join(', ')

  // Extra emphasis when colors are being changed
  const colorWarning = changeColors
    ? productImageUrl
      ? ' CRITICAL: The product\'s actual color and appearance must NOT change. Only change colors of the background, text, icons, and decorative elements. The product in the second reference image shows the exact colors that must be preserved.'
      : ' CRITICAL: The product\'s actual color and appearance must NOT change. Only change colors of the background, text, icons, and decorative elements.'
    : ''

  const systemPrompt = [
    'You are an expert at writing prompts for image-to-image AI models.',
    'You will be shown an ad creative image and the original product photo.',
    'Your job is to write a prompt that will generate a variation of the ad while preserving the product exactly as it appears.',
    'The variation should maintain the overall composition, layout, and product placement.',
    'The variation should ONLY change what the user requested - nothing else.',
    'Be specific and descriptive. Reference the original image structure.',
    'Return ONLY the prompt text - no preamble, no markdown, no explanation.',
  ].join(' ')

  const imageUrlsPassed = productImageUrl
    ? [sourceImageUrl, productImageUrl]
    : [sourceImageUrl]

  const userText = productImageUrl
    ? [
        'Here is an ad creative image (first image) and the original product photo (second image).',
        '',
        'Generate a variation that keeps everything the same EXCEPT:',
        changeDescription,
        '',
        'IMPORTANT: The product shown must remain EXACTLY identical to how it appears in the original product photo - same color, same appearance, same details.',
        colorWarning,
        '',
        'Write a prompt that will generate this variation.',
      ].join('\n')
    : [
        'Here is an ad creative image.',
        '',
        'Generate a variation that keeps everything the same EXCEPT:',
        changeDescription,
        colorWarning,
        '',
        'Write a prompt that will generate this variation.',
      ].join('\n')

  const rawResponse = await callVision({
    imageUrls: imageUrlsPassed,
    prompt: userText,
    systemPrompt,
  })

  const prompt = rawResponse.trim()
  if (!prompt) throw new Error('Composer returned an empty prompt')

  return { systemPrompt, userPrompt: userText, imageUrlsPassed, rawResponse, prompt }
}

/**
 * Core helper: calls fal to generate a variation image.
 * Does NOT upload to R2 — returns raw fal URL and raw response.
 * Not a Convex action — plain async function, callable from actions directly.
 */
export async function generateVariationImageCore({
  prompt,
  imageUrls,
  aspectRatio,
}: {
  prompt: string
  imageUrls: string[]
  aspectRatio: string
}): Promise<{
  rawResponse: unknown
  generatedUrl: string
}> {
  let result: { data: unknown }
  try {
    result = await fal.subscribe('fal-ai/nano-banana-2/edit', {
      input: {
        prompt,
        image_urls: imageUrls,
        aspect_ratio: aspectRatio,
        output_format: 'png',
        resolution: '1K',
      },
    })
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err)
    if (/safety|blocked|rejected/i.test(raw)) {
      throw new Error('Image model rejected the request — try different variation options.')
    }
    throw err
  }

  const data = result.data as { images?: Array<{ url?: string }> }
  const generatedUrl = data.images?.[0]?.url
  if (!generatedUrl) throw new Error('Model did not return an image URL')

  return { rawResponse: result.data, generatedUrl }
}

/**
 * Composes a prompt for generating variations of an existing image.
 * Uses the variationSource to determine what to change (text, icons, colors).
 */
export const composeVariationPrompt = internalAction({
  args: { generationId: v.id('templateGenerations') },
  handler: async (ctx, { generationId }): Promise<{ prompt: string }> => {
    // Test mode: return mock prompt without calling AI
    if (isTestMode()) {
      await mockDelay()
      return { prompt: mockVariationPrompt }
    }

    const gen = await ctx.runQuery(internal.studio.getGenerationInternal, { generationId })
    if (!gen) throw new Error('Generation not found')
    if (!gen.variationSource) throw new Error('Not a variation generation')

    const { sourceImageUrl, changeText, changeIcons, changeColors } = gen.variationSource

    const { prompt } = await composeVariationPromptCore({
      sourceImageUrl,
      productImageUrl: gen.productImageUrl,
      changeText,
      changeIcons,
      changeColors,
    })

    return { prompt }
  },
})

/**
 * Generates a variation image using the source image and variation prompt.
 */
export const generateVariation = internalAction({
  args: { generationId: v.id('templateGenerations') },
  handler: async (ctx, { generationId }): Promise<{ outputUrl: string }> => {
    // Test mode: return mock image URL without calling AI
    if (isTestMode()) {
      await mockDelay(500) // Simulate longer generation time
      return { outputUrl: mockGeneratedImageUrl }
    }

    const gen = await ctx.runQuery(internal.studio.getGenerationInternal, { generationId })
    if (!gen) throw new Error('Generation not found')
    if (!gen.dynamicPrompt) throw new Error('Dynamic prompt missing')
    if (!gen.variationSource) throw new Error('Not a variation generation')

    const aspectRatio = gen.aspectRatio ?? '1:1'

    const { generatedUrl } = await generateVariationImageCore({
      prompt: gen.dynamicPrompt,
      imageUrls: [gen.variationSource.sourceImageUrl, gen.productImageUrl],
      aspectRatio,
    })

    const key = `studio/variations/${gen.productId}/${generationId}-${nanoid(6)}.png`
    const outputUrl = await uploadFromUrl(generatedUrl, key, 'image/png')
    return { outputUrl }
  },
})

// ─── Prompt enhancer (used by the /admin/prompts editor) ─────────────────
export const enhancePrompt = action({
  args: {
    original: v.string(),
    instructions: v.string(),
  },
  handler: async (_ctx, { original, instructions }) => {
    const trimmedInstructions = instructions.trim()
    if (!trimmedInstructions) throw new Error('Describe what to change')
    if (!original.trim()) throw new Error('Original prompt is empty')

    const text = await callText({
      prompt: `ORIGINAL PROMPT:\n${original}\n\nINSTRUCTIONS:\n${trimmedInstructions}\n\nRewrite the prompt incorporating the instructions.`,
      systemPrompt: [
        'You rewrite image-generation prompts for a product photography app.',
        'The prompt refers to "the first image" (an ad template) and "the second image" (a product).',
        'Return ONLY the rewritten prompt — no preamble, no markdown, no explanation.',
        'Preserve the original structure and concrete references unless the user asks to change them.',
        'Be concise and declarative; do not hedge.',
      ].join(' '),
    })

    return { enhanced: text.trim() }
  },
})

// ─── Background Removal ───────────────────────────────────────────────────

/**
 * Removes the background from a product image using fal.ai BRIA RMBG 2.0.
 * Returns a URL to the image with transparent background.
 */
export const removeBackground = internalAction({
  args: {
    productId: v.id('products'),
    imageUrl: v.string(),
  },
  handler: async (ctx, { productId, imageUrl }): Promise<{ outputUrl: string }> => {
    // Test mode: return mock URL without calling AI
    if (isTestMode()) {
      await mockDelay(500)
      return { outputUrl: imageUrl } // Just return the original in test mode
    }

    const result = await fal.subscribe('fal-ai/bria/background/remove', {
      input: {
        image_url: imageUrl,
      },
    })

    const data = result.data as { image?: { url?: string } }
    const outputUrl = data.image?.url
    if (!outputUrl) throw new Error('Background removal did not return an image URL')

    // Upload to our R2 bucket for persistence
    const key = `studio/products/${productId}/no-bg-${nanoid(6)}.png`
    const persistedUrl = await uploadFromUrl(outputUrl, key, 'image/png')

    return { outputUrl: persistedUrl }
  },
})
