'use node'

import { openai } from '@ai-sdk/openai'
import { generateObject, generateText } from 'ai'
import Replicate from 'replicate'
import { v } from 'convex/values'
import { z } from 'zod'
import { action, internalAction } from './_generated/server'
import { internal } from './_generated/api'
import { uploadFromUrl } from './r2'
import { nanoid } from 'nanoid'

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })

const CLIP_MODEL =
  'krthr/clip-embeddings:1c0371070cb827ec3c7f2f28adcdde54b50dcd239aa6faea0bc98b174ef03fb4' as const

const GENERATION_MODEL = 'google/nano-banana-2' as const

export const CLIP_EMBEDDING_DIMS = 768

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

/** Composition - How elements are arranged in the frame */
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
const AD_SCENE_TYPES = [
  'studio', 'lifestyle', 'outdoor', 'flat-lay', 'hand-held',
  'bathroom-counter', 'kitchen-counter', 'desk-setup', 'text-overlay',
  'split-screen', 'before-after', 'testimonial',
] as const
const AD_MOODS = [
  'minimal', 'luxe', 'playful', 'natural', 'clinical', 'bold', 'cozy',
  'vibrant', 'dark', 'bright', 'retro', 'futuristic',
] as const

// ─── Product analysis (vision + CLIP, parallel) ───────────────────────────
const productAnalysisSchema = z.object({
  category: z.enum(AD_CATEGORIES),
  productDescription: z.string().min(10).max(300),
  targetAudience: z.string().min(10).max(300),
})

export const analyzeProduct = internalAction({
  args: { imageUrl: v.string() },
  handler: async (_ctx, { imageUrl }) => {
    const [analysis, clipOutput] = await Promise.all([
      generateObject({
        model: openai('gpt-4o-mini'),
        schema: productAnalysisSchema,
        system:
          'You are a product analyst for marketing use cases. Be factual and concise. Pick the single best category from the provided enum.',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Classify this product. Pick ONE category. Write a 25-30 word description of the product, its key features, and primary use case. Write a comma-separated list of 3-5 target audience segments.',
              },
              { type: 'image', image: imageUrl },
            ],
          },
        ],
      }),
      replicate.run(CLIP_MODEL, { input: { image: imageUrl } }),
    ])

    const embedding = extractEmbedding(clipOutput)
    if (embedding.length !== CLIP_EMBEDDING_DIMS) {
      throw new Error(
        `CLIP returned ${embedding.length} dims, expected ${CLIP_EMBEDDING_DIMS}`,
      )
    }

    return {
      category: analysis.object.category,
      productDescription: analysis.object.productDescription,
      targetAudience: analysis.object.targetAudience,
      embedding,
    }
  },
})

// ─── Template ingestion pieces ────────────────────────────────────────────
export const computeClipEmbedding = internalAction({
  args: { imageUrl: v.string() },
  handler: async (_ctx, { imageUrl }) => {
    const out = await replicate.run(CLIP_MODEL, { input: { image: imageUrl } })
    const embedding = extractEmbedding(out)
    if (embedding.length !== CLIP_EMBEDDING_DIMS) {
      throw new Error(
        `CLIP returned ${embedding.length} dims, expected ${CLIP_EMBEDDING_DIMS}`,
      )
    }
    return { embedding }
  },
})

// ─── New Structured Tags Schema ───────────────────────────────────────────
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
  sceneDescription: z.string().min(20).max(400),
  // Legacy fields for backward compatibility
  moods: z.array(z.enum(AD_MOODS)).min(1).max(3),
})

export const computeTemplateTags = internalAction({
  args: { imageUrl: v.string() },
  handler: async (_ctx, { imageUrl }) => {
    const result = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: structuredTagsSchema,
      system: `You are a visual ad classifier for product photography templates. Your job is to categorize ad images with STRUCTURED tags that enable filtering and search.

CRITICAL RULES:
- Pick EXACTLY ONE value from each category - no exceptions
- Base your choices on what you ACTUALLY SEE in the image
- For productCategory, identify the PRIMARY product type being advertised
- For primaryColor, identify the DOMINANT color palette (not every color present)
- Be consistent: similar images should get similar tags`,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Classify this product ad image for a template library.

REQUIRED - Pick exactly ONE from each:

1. productCategory: What type of physical product is being advertised?
   Options: beauty, skincare, haircare, supplements, food, beverage, apparel, accessories, electronics, home, fitness, pet, baby, health, cleaning, other

2. primaryColor: What is the DOMINANT color palette?
   Options: neutral, warm, cool, green, pink, purple, earth, pastel, vibrant, monochrome

3. imageStyle: What type of ad image is this?
   Options: product-hero, lifestyle, flat-lay, infographic, before-after, testimonial, collage, ugc-style, editorial, minimalist

4. setting: Where was this photographed / what's the backdrop?
   Options: studio, home, bathroom, kitchen, outdoor, urban, gym, office, abstract, none

5. composition: How are elements arranged in the frame?
   Options: centered, rule-of-thirds, symmetrical, diagonal, framed, scattered, stacked, close-up, full-frame

6. textAmount: How much text/copy is in the image?
   Options: no-text, logo-only, minimal-text, moderate-text, text-heavy, price-focused

OPTIONAL:
- subcategory: A specific product type (e.g., "serum", "protein powder", "sneakers")
- moods: 1-3 visual moods (minimal, luxe, playful, natural, clinical, bold, cozy, vibrant, dark, bright, retro, futuristic)
- sceneDescription: 2-3 sentences describing composition, lighting, props, and framing`,
            },
            { type: 'image', image: imageUrl },
          ],
        },
      ],
    })
    return result.object
  },
})

// ─── Image generation (nano-banana) ───────────────────────────────────────
/**
 * Composes a per-job prompt by looking at both the template and the
 * user's product image with GPT-4o-mini vision.  Returns the final
 * prompt string ready for nano-banana.
 *
 * Throws if any required context is missing — the workflow catches and
 * marks the generation as failed.
 */
export const composePrompt = internalAction({
  args: { generationId: v.id('templateGenerations') },
  handler: async (
    ctx,
    { generationId },
  ): Promise<{ prompt: string }> => {
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
    const system = `${promptCfg.coreInstructions}\n\n${addendum}${colorAdaptPart}`

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

    const { text } = await generateText({
      model: openai('gpt-4o-mini'),
      system,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: userText },
            { type: 'image', image: generation.templateImageUrl },
            { type: 'image', image: generation.productImageUrl },
          ],
        },
      ],
    })

    const prompt = text.trim()
    if (!prompt) throw new Error('Composer returned an empty prompt')
    return { prompt }
  },
})

/**
 * Calls nano-banana using the dynamic prompt that composePrompt wrote
 * to the generation row.  Uploads the result to R2 and returns the URL.
 */
export const generateFromTemplate = internalAction({
  args: { generationId: v.id('templateGenerations') },
  handler: async (
    ctx,
    { generationId },
  ): Promise<{ outputUrl: string }> => {
    const ctxData = await ctx.runQuery(internal.studio.getGenerationContextInternal, {
      generationId,
    })
    if (!ctxData?.generation) throw new Error('Generation not found')
    const { generation, template } = ctxData
    if (!generation.dynamicPrompt) {
      throw new Error('Dynamic prompt missing — composer step did not complete')
    }

    // nano-banana 2 supports explicit aspect ratios.  Pass the template's
    // aspect ratio directly — `match_input_image` is ambiguous when
    // `image_input` contains more than one reference.
    const aspectRatio = template?.aspectRatio ?? '1:1'

    let output: unknown
    try {
      output = await replicate.run(GENERATION_MODEL, {
        input: {
          prompt: generation.dynamicPrompt,
          image_input: [generation.templateImageUrl, generation.productImageUrl],
          aspect_ratio: aspectRatio,
          output_format: 'png',
        },
      })
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err)
      if (/Prediction failed:?\s*$/.test(raw)) {
        throw new Error(
          'Image model rejected the request (often a safety-filter block on brand/logo content — try a different template or soften the prompt in admin).',
        )
      }
      throw err
    }
    const generatedUrl = extractOutputUrl(output)
    if (!generatedUrl) throw new Error('Model did not return an image URL')

    const key = `studio/outputs/${generation.runId}/${generation.variationIndex}-${nanoid(6)}.png`
    const outputUrl = await uploadFromUrl(generatedUrl, key, 'image/png')
    return { outputUrl }
  },
})

// ─── Variation generation ─────────────────────────────────────────────────

/**
 * Composes a prompt for generating variations of an existing image.
 * Uses the variationSource to determine what to change (text, icons, colors).
 */
export const composeVariationPrompt = internalAction({
  args: { generationId: v.id('templateGenerations') },
  handler: async (ctx, { generationId }): Promise<{ prompt: string }> => {
    const gen = await ctx.runQuery(internal.studio.getGenerationInternal, { generationId })
    if (!gen) throw new Error('Generation not found')
    if (!gen.variationSource) throw new Error('Not a variation generation')

    const { sourceImageUrl, changeText, changeIcons, changeColors } = gen.variationSource

    // Build description of what to change
    const changes: string[] = []
    if (changeText) changes.push('different text/headlines/copy')
    if (changeIcons) changes.push('different icons, badges, or decorative graphics')
    if (changeColors) changes.push('a different color scheme/palette')

    const changeDescription = changes.join(', ')

    const system = [
      'You are an expert at writing prompts for image-to-image AI models.',
      'You will be shown an ad creative image. Your job is to write a prompt that will generate a variation of this image.',
      'The variation should maintain the overall composition, layout, and product placement.',
      'The variation should ONLY change what the user requested - nothing else.',
      'Be specific and descriptive. Reference the original image structure.',
      'Return ONLY the prompt text - no preamble, no markdown, no explanation.',
    ].join(' ')

    const userText = [
      'Here is an ad creative image. Generate a variation that keeps everything the same EXCEPT:',
      changeDescription,
      '',
      'The product shown should remain identical. The layout and composition should be preserved.',
      'Write a prompt that will generate this variation.',
    ].join('\n')

    const { text } = await generateText({
      model: openai('gpt-4o-mini'),
      system,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: userText },
            { type: 'image', image: sourceImageUrl },
            { type: 'image', image: gen.productImageUrl },
          ],
        },
      ],
    })

    const prompt = text.trim()
    if (!prompt) throw new Error('Composer returned an empty prompt')
    return { prompt }
  },
})

/**
 * Generates a variation image using the source image and variation prompt.
 */
export const generateVariation = internalAction({
  args: { generationId: v.id('templateGenerations') },
  handler: async (ctx, { generationId }): Promise<{ outputUrl: string }> => {
    const gen = await ctx.runQuery(internal.studio.getGenerationInternal, { generationId })
    if (!gen) throw new Error('Generation not found')
    if (!gen.dynamicPrompt) throw new Error('Dynamic prompt missing')
    if (!gen.variationSource) throw new Error('Not a variation generation')

    const aspectRatio = gen.aspectRatio ?? '1:1'

    let output: unknown
    try {
      output = await replicate.run(GENERATION_MODEL, {
        input: {
          prompt: gen.dynamicPrompt,
          image_input: [gen.variationSource.sourceImageUrl, gen.productImageUrl],
          aspect_ratio: aspectRatio,
          output_format: 'png',
        },
      })
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err)
      if (/Prediction failed:?\s*$/.test(raw)) {
        throw new Error('Image model rejected the request — try different variation options.')
      }
      throw err
    }

    const generatedUrl = extractOutputUrl(output)
    if (!generatedUrl) throw new Error('Model did not return an image URL')

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

    const { text } = await generateText({
      model: openai('gpt-4o-mini'),
      system: [
        'You rewrite image-generation prompts for a product photography app.',
        'The prompt refers to "the first image" (an ad template) and "the second image" (a product).',
        'Return ONLY the rewritten prompt — no preamble, no markdown, no explanation.',
        'Preserve the original structure and concrete references unless the user asks to change them.',
        'Be concise and declarative; do not hedge.',
      ].join(' '),
      messages: [
        {
          role: 'user',
          content: `ORIGINAL PROMPT:\n${original}\n\nINSTRUCTIONS:\n${trimmedInstructions}\n\nRewrite the prompt incorporating the instructions.`,
        },
      ],
    })
    return { enhanced: text.trim() }
  },
})

// ─── Helpers ──────────────────────────────────────────────────────────────
function extractEmbedding(output: unknown): number[] {
  if (Array.isArray(output) && output.every((v) => typeof v === 'number')) {
    return output as number[]
  }
  if (output && typeof output === 'object' && 'embedding' in output) {
    const e = (output as { embedding: unknown }).embedding
    if (Array.isArray(e)) return e as number[]
  }
  if (Array.isArray(output) && output.length > 0 && typeof output[0] === 'object') {
    const first = output[0] as { embedding?: unknown }
    if (Array.isArray(first.embedding)) return first.embedding as number[]
  }
  throw new Error(`Unrecognized CLIP output shape: ${JSON.stringify(output).slice(0, 200)}`)
}

function extractOutputUrl(output: unknown): string | null {
  if (Array.isArray(output)) return resolveSingle(output[0])
  return resolveSingle(output)
}

function resolveSingle(o: unknown): string | null {
  if (!o) return null
  if (typeof o === 'string') return o
  if (typeof o === 'object' && 'url' in o) {
    const u = (o as { url: unknown }).url
    if (typeof u === 'function') return (u as () => string)()
    if (typeof u === 'string') return u
  }
  return null
}
