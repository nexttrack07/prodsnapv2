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

export type TemplateContext = {
  category?: string
  subcategory?: string
  sceneTypes?: string[]
  moods?: string[]
  sceneDescription?: string
  aspectRatio?: '1:1' | '4:5' | '9:16' | '16:9'
}

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

// ─── Internal action wrapper for callText (cross-file usage) ─────────────────
export const callTextInternal = internalAction({
  args: {
    prompt: v.string(),
    systemPrompt: v.optional(v.string()),
  },
  handler: async (_ctx, { prompt, systemPrompt }): Promise<string> => {
    if (isTestMode()) {
      await mockDelay()
      return '["Studio hero shot of Product on marble countertop, soft diffused lighting, minimalist mood, centered composition","Lifestyle flat-lay of Product surrounded by fresh ingredients on a wooden cutting board, warm golden-hour light, earthy tones","Close-up macro of Product texture and details, dramatic side-lighting, moody cinematic feel, dark background","Outdoor lifestyle scene with Product on a cafe table, natural morning light, vibrant urban backdrop, three-quarter angle","Editorial-style Product floating against a gradient background, neon rim lighting, premium luxe mood, full-frame composition"]'
    }
    return callText({ prompt, systemPrompt })
  },
})

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
const ANGLE_TYPES = ['comparison', 'curiosity-narrative', 'social-proof', 'problem-callout'] as const

const marketingAngleSchema = z.object({
  title: z.string().min(3).max(80),
  description: z.string().min(15).max(280),
  hook: z.string().min(5).max(200),
  suggestedAdStyle: z.string().min(3).max(80),
  angleType: z.enum(ANGLE_TYPES).optional(),
  tags: z.object({
    productCategory: z.enum(PRODUCT_CATEGORIES).optional(),
    imageStyle: z.enum(IMAGE_STYLES).optional(),
    setting: z.enum(SETTINGS).optional(),
    primaryColor: z.enum(PRIMARY_COLORS).optional(),
  }).optional(),
})

const productAnalysisSchema = z.object({
  category: z.enum(AD_CATEGORIES),
  productDescription: z.string().min(10).max(300),
  targetAudience: z.string().min(10).max(300),
  valueProposition: z.string().min(15).max(280),
  marketingAngles: z.array(marketingAngleSchema).min(3).max(5),
})

export const analyzeProduct = internalAction({
  args: {
    imageUrl: v.string(),
    customerLanguage: v.optional(v.array(v.string())),
  },
  handler: async (_ctx, { imageUrl, customerLanguage }) => {
    // Test mode: return mock response without calling AI
    if (isTestMode()) {
      await mockDelay()
      return mockVisionResponse
    }

    const customerVoiceSection = customerLanguage && customerLanguage.length > 0
      ? `\n\nCustomer phrases to ground angles in (use their exact words and tone when writing hooks and descriptions):\n${customerLanguage.map((s) => `- "${s}"`).join('\n')}`
      : ''

    const analysisText = await callVision({
      imageUrls: [imageUrl],
      prompt: `Analyze this product image and return a JSON object with these exact fields:
{
  "category": "<one of: ${AD_CATEGORIES.join(', ')}>",
  "productDescription": "<25-30 word description of the product, key features, and use case>",
  "targetAudience": "<comma-separated list of 3-5 target audience segments>",
  "valueProposition": "<one sentence (15-30 words) capturing the core promise this product makes to its buyer>",
  "marketingAngles": [
    {
      "title": "<short label, 3-6 words, e.g. 'Late-night skincare ritual'>",
      "description": "<1-2 sentence positioning explanation, why this angle works for this product and audience>",
      "hook": "<a single ad headline or opening line in this angle's voice, under 25 words>",
      "suggestedAdStyle": "<one of: lifestyle UGC, before/after demo, founder story, problem/solution, social proof, comparison, ingredient close-up, in-use demo>",
      "angleType": "<one of: comparison, curiosity-narrative, social-proof, problem-callout>",
      "tags": {
        "productCategory": "<one of: ${PRODUCT_CATEGORIES.join(', ')}>",
        "imageStyle": "<one of: ${IMAGE_STYLES.join(', ')}>",
        "setting": "<one of: ${SETTINGS.join(', ')}>",
        "primaryColor": "<one of: ${PRIMARY_COLORS.join(', ')}>"
      }
    }
  ]
}

Generate 3-5 distinct marketing angles. Each angle should target a different buyer motivation (status, savings, anxiety relief, identity, convenience, etc.). Avoid repeating the same hook idea twice.${customerVoiceSection}
Generate a DIVERSE mix of angle types across your 3-5 angles. Don't return 5 'comparison' angles — vary across the four types (comparison, curiosity-narrative, social-proof, problem-callout) so the user can test different psychological levers.
For each angle, also predict the structured filter tags from the enums above. These tags help the user find templates that fit the angle. If you're not confident, omit the field rather than guess.

Return ONLY the JSON object, no other text.`,
      systemPrompt:
        'You are a senior performance marketer for DTC brands. You understand Facebook ads, ad copy, and how to position products for specific audience motivations. Be concrete and specific. Return valid JSON only.',
    })

    const analysis = parseJsonFromResponse(analysisText, productAnalysisSchema)

    return {
      category: analysis.category,
      productDescription: analysis.productDescription,
      targetAudience: analysis.targetAudience,
      valueProposition: analysis.valueProposition,
      marketingAngles: analysis.marketingAngles,
    }
  },
})

// ─── Ad copy generation (text only) ───────────────────────────────────────
const adCopyResultSchema = z.object({
  // Three distinct variants per field, each using a different approach.
  // Lengths follow Meta's truncation guidance — see the prompt for the
  // PAS / BAB / Hook-VP-Proof structure that drives the 3 variants.
  headlines: z.array(z.string().min(3).max(60)).min(3).max(3),
  primaryTexts: z.array(z.string().min(10).max(320)).min(3).max(3),
  ctas: z.array(z.string().min(2).max(24)).min(3).max(3),
})

export const generateAdCopyText = internalAction({
  args: {
    productName: v.string(),
    productDescription: v.optional(v.string()),
    targetAudience: v.optional(v.string()),
    valueProposition: v.optional(v.string()),
    angle: v.object({
      title: v.string(),
      description: v.string(),
      hook: v.string(),
      suggestedAdStyle: v.string(),
    }),
    brandVoice: v.optional(v.string()),
    brandTagline: v.optional(v.string()),
    currentOffer: v.optional(v.string()),
    customerLanguage: v.optional(v.array(v.string())),
  },
  handler: async (_ctx, args) => {
    if (isTestMode()) {
      await mockDelay()
      return {
        headlines: [
          `${args.angle.title}, in 60 seconds`,
          `Why ${args.productName} actually works`,
        ],
        primaryTexts: [
          `${args.angle.description} ${args.productName} is the version teams in the know already switched to.`,
          `${args.angle.hook} Try ${args.productName} risk-free for 7 days.`,
        ],
        ctas: ['Try free', 'See it in action', 'Get started'],
      }
    }

    const lines: string[] = [
      `Product: ${args.productName}`,
    ]
    if (args.productDescription) lines.push(`Description: ${args.productDescription}`)
    if (args.targetAudience) lines.push(`Target audience: ${args.targetAudience}`)
    if (args.valueProposition) lines.push(`Value proposition: ${args.valueProposition}`)
    lines.push(`Angle: ${args.angle.title} — ${args.angle.description}`)
    lines.push(`Sample hook: "${args.angle.hook}"`)
    lines.push(`Suggested ad style: ${args.angle.suggestedAdStyle}`)
    if (args.brandVoice) lines.push(`Brand voice: ${args.brandVoice}`)
    if (args.brandTagline) lines.push(`Brand tagline: ${args.brandTagline}`)
    if (args.currentOffer) lines.push(`Current offer: ${args.currentOffer}`)
    if (args.customerLanguage && args.customerLanguage.length > 0) {
      lines.push(`Authentic phrases customers use:\n${args.customerLanguage.map((s) => `- ${s}`).join('\n')}`)
    }

    const prompt = `${lines.join('\n')}

The ad IMAGE has already been generated and will be shown to the viewer alongside this copy. Your copy MUST complement the image — never describe what is already visible in it, never duplicate what it communicates.

Return JSON with EXACTLY 3 variants of each field. Each of the 3 variants in a field must use a DIFFERENT approach so the user has real options, not three rephrases of the same idea.

{
  "headlines": [string, string, string],
  "primaryTexts": [string, string, string],
  "ctas": [string, string, string]
}

## headlines — 3 distinct approaches (use this order)
- [0] curiosity-driven: open a loop the viewer wants to resolve
- [1] benefit-driven: lead with the most specific outcome the product delivers
- [2] social proof: reference adoption, results, or credibility (be specific; avoid vague "everyone loves it")
- Each headline 20-35 chars (hard ceiling 40). Stand-alone — assume description is invisible on mobile.
- Use numbers and specificity ("30% softer" beats "much softer"). Never start with the brand name.

## primaryTexts — 3 distinct frameworks (use this order)
- [0] PAS: Problem (line 1) → Agitation (line 2) → Solution (line 3)
- [1] BAB: Before state (current pain) → After state (life with the product) → Bridge (the product is the path). Don't describe the "after" visually — that's the image's job.
- [2] Hook + Value Prop + Proof + soft CTA in 3-4 short sentences
- CRITICAL: First 80 characters of every variant must contain the complete hook — most users only see that before "See more".
- 125-260 characters per variant; never exceed 300.
- Mirror the customer language phrases above when natural; avoid marketing jargon.
- If a current offer is provided, weave it into ONE of the three variants (not all).

## ctas — 3 distinct energies (use this order)
- [0] direct action: "Shop Now", "Try It Today", "Get Yours"
- [1] low-friction / curiosity: "See How It Works", "Learn More", "Explore the Range"
- [2] offer-aligned (only if a current offer exists) OR benefit-focused: "Claim 20% Off" / "Start Your Trial"
- Max 20 chars each.

## Voice enforcement (read carefully)
- "Calm/minimal/premium/luxury" voice → no exclamation points, no ALL CAPS, no emoji, understated phrasing.
- "Bold/energetic/punchy" voice → punchy short sentences, can use 1-2 emoji in primaryText, strong verbs.
- Default if voice is unclear → confident but neutral, no emoji.
- Never override the voice for any reason.

## Emoji rule
Only ever in primaryText (never in headlines or ctas). Max 2 per variant. ZERO if voice is calm / minimal / premium / luxury.

## Avoid (Meta will flag or trust will tank)
- Banned terms: "guaranteed", "miracle", "revolutionary", "instant results", false urgency.
- Clickbait: "You won't believe…", vague hyperbole.
- Personal-attribute accusations: "Are you struggling with X?" (Meta prohibits this).
- Ad-speak: "amazing!", "best ever!", "limited time only" (unless current offer is genuinely time-bound).

Return ONLY the JSON object — no markdown, no explanation, no surrounding text.`

    const response = await callText({
      prompt,
      systemPrompt:
        'You are an expert DTC Facebook/Instagram ad copywriter. You write copy that complements pre-generated ad images, uses proven frameworks (PAS, BAB, Hook-VP-Proof), respects Meta\'s 80-char first-line truncation, and never duplicates what an image already shows. Return strict JSON only.',
    })

    return parseJsonFromResponse(response, adCopyResultSchema)
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
  // Playbook angle type — optional, only emit if confident
  angleType: z.enum(ANGLE_TYPES).optional(),
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
  "angleType": "<optional — one of: comparison, curiosity-narrative, social-proof, problem-callout — only include if you are confident this template clearly aligns with one of these high-converting angle types>",
  "moods": ["<1-3 moods from: ${AD_MOODS.join(', ')}>"]
}

CRITICAL: Pick EXACTLY ONE value from each category. angleType is optional — omit it rather than guess. Return ONLY the JSON object.`,
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
    const { generation, productContext: prodCtx } = ctxData
    if (!prodCtx) throw new Error('Product/run context not found for generation')
    if (!ctxData.template) throw new Error('Template not found for generation')
    // Narrow: this code path only runs for template-driven generations, so the
    // doc returned by getGenerationContextInternal must be an adTemplates row.
    const template = ctxData.template as TemplateContext
    const templateImageUrl = generation.templateImageUrl
    if (!templateImageUrl) throw new Error('Template image URL missing on generation')

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
      'Visual hierarchy rules (apply to the rendered ad):',
      '1. The largest text element is the main headline — communicates the value proposition or visceral benefit. Readable at thumbnail size in <1 second.',
      '2. Sub-callouts list 2-3 benefits in smaller arrow-pointed text. Benefits, not features.',
      '3. Any offer ("15% off", "Buy 2 Get 1 Free") appears at the very bottom in a tertiary block, smaller than callouts.',
      '4. Pattern disrupt: the composition or copy should be unusual enough to make a viewer pause — unexpected crop, surprising contrast, or curiosity-inducing headline.',
      '',
      'Compose the nano-banana prompt now. Return ONLY the prompt text.',
    ].join('\n')

    const text = await callVision({
      imageUrls: [templateImageUrl, generation.productImageUrl],
      prompt: userText,
      systemPrompt,
    })

    const prompt = text.trim()
    if (!prompt) throw new Error('Composer returned an empty prompt')
    return { prompt }
  },
})

// ─── Image edit model abstraction ────────────────────────────────────────────

type ImageEditModel = 'nano-banana-2' | 'gpt-image-2'

async function callImageEditModel({
  model,
  prompt,
  imageUrls,
  aspectRatio,
}: {
  model: ImageEditModel
  prompt: string
  imageUrls: string[]
  aspectRatio: string
}): Promise<{ generatedUrl: string; rawResponse: unknown }> {
  let result: { data: unknown }
  try {
    if (model === 'gpt-image-2') {
      const image_size =
        aspectRatio === '9:16' ? 'portrait_16_9'
        : aspectRatio === '4:5' ? { width: 1024, height: 1280 }
        : 'square_hd'
      result = await fal.subscribe('openai/gpt-image-2/edit', {
        input: { prompt, image_urls: imageUrls, image_size, quality: 'high', output_format: 'png' },
      })
    } else {
      // nano-banana-2 (default)
      result = await fal.subscribe('fal-ai/nano-banana-2/edit', {
        input: { prompt, image_urls: imageUrls, aspect_ratio: aspectRatio, output_format: 'png', resolution: '1K' },
      })
    }
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err)
    if (/safety|blocked|rejected/i.test(raw)) {
      throw new Error('Image model rejected the request — try a different template or soften the prompt.')
    }
    throw err
  }
  const data = result.data as { images?: Array<{ url?: string }> }
  const generatedUrl = data.images?.[0]?.url
  if (!generatedUrl) throw new Error('Model did not return an image URL')
  return { generatedUrl, rawResponse: result.data }
}

/**
 * Text-to-image generation (no source/reference image).
 * Routes to the base (non-edit) endpoint of each model.
 * Called when productImageUrl is empty (useSourceImage === false).
 */
async function callImageGenModel({
  model,
  prompt,
  aspectRatio,
}: {
  model: ImageEditModel
  prompt: string
  aspectRatio: string
}): Promise<{ generatedUrl: string; rawResponse: unknown }> {
  let result: { data: unknown }
  try {
    if (model === 'gpt-image-2') {
      const image_size =
        aspectRatio === '9:16' ? 'portrait_16_9'
        : aspectRatio === '4:5' ? { width: 1024, height: 1280 }
        : 'square_hd'
      result = await fal.subscribe('openai/gpt-image-2', {
        input: { prompt, image_size, quality: 'high', output_format: 'png' },
      })
    } else {
      // nano-banana-2 text-to-image (no /edit suffix)
      result = await fal.subscribe('fal-ai/nano-banana-2', {
        input: { prompt, aspect_ratio: aspectRatio, output_format: 'png', resolution: '1K' },
      })
    }
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err)
    if (/safety|blocked|rejected/i.test(raw)) {
      throw new Error('Image model rejected the request — try softening the prompt.')
    }
    throw err
  }
  const data = result.data as { images?: Array<{ url?: string }> }
  const generatedUrl = data.images?.[0]?.url
  if (!generatedUrl) throw new Error('Model did not return an image URL')
  return { generatedUrl, rawResponse: result.data }
}

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
    const { generation } = ctxData
    if (!generation.dynamicPrompt) {
      throw new Error('Dynamic prompt missing — composer step did not complete')
    }
    const templateImageUrl = generation.templateImageUrl
    if (!templateImageUrl) {
      throw new Error('Template image URL missing — generateFromTemplate is template-driven only')
    }
    const template = ctxData.template as TemplateContext | null

    const aspectRatio = template?.aspectRatio ?? generation.aspectRatio ?? '1:1'

    const { generatedUrl } = await callImageEditModel({
      model: (generation.model ?? 'nano-banana-2') as ImageEditModel,
      prompt: generation.dynamicPrompt,
      imageUrls: [templateImageUrl, generation.productImageUrl],
      aspectRatio,
    })

    const key = `studio/outputs/${generation.runId ?? generation.productId}/${generation.variationIndex}-${nanoid(6)}.png`
    const outputUrl = await uploadFromUrl(generatedUrl, key, 'image/png')
    return { outputUrl }
  },
})

// ─── From-angle composition (no template) ────────────────────────────────
/**
 * Composes a nano-banana prompt for a fresh ad scene seeded by a marketing
 * angle (no source template). Looks at the user's product image, the angle's
 * positioning + hook, and the user's brand kit if any.
 */
export const composeFromAnglePrompt = internalAction({
  args: { generationId: v.id('templateGenerations') },
  handler: async (ctx, { generationId }): Promise<{ prompt: string }> => {
    if (isTestMode()) {
      await mockDelay()
      return { prompt: mockComposedPrompt }
    }
    const ctxData = await ctx.runQuery(internal.studio.getGenerationContextInternal, {
      generationId,
    })
    if (!ctxData?.generation) throw new Error('Generation not found')
    const { generation, productContext: prodCtx } = ctxData
    if (!prodCtx) throw new Error('Product context not found for generation')
    if (!generation.angleSeed) throw new Error('angleSeed missing — composeFromAnglePrompt is angle-driven only')

    const angle = generation.angleSeed
    const userId = generation.userId
    const brandKit = userId
      ? await ctx.runQuery(internal.brandKits.getBrandKitForProductInternal, {
          userId,
          productId: generation.productId,
        })
      : null

    let productImageUrl = generation.productImageUrl
    if (!productImageUrl) {
      throw new Error('Product image URL missing on generation — composeFromAnglePrompt requires a primary product image')
    }
    if (generation.productId) {
      const images = await ctx.runQuery(internal.productImages.listByProductInternal, {
        productId: generation.productId,
      })
      const bgRemoved = images?.find(
        (i: { type: string; status: string; imageUrl: string }) =>
          i.type === 'background-removed' && i.status === 'ready',
      )
      if (bgRemoved) productImageUrl = bgRemoved.imageUrl
    }

    const prodLines: string[] = []
    if (prodCtx.category) prodLines.push(`Product category: ${prodCtx.category}`)
    if (prodCtx.productDescription) prodLines.push(`Product description: ${prodCtx.productDescription}`)
    if (prodCtx.targetAudience) prodLines.push(`Target audience: ${prodCtx.targetAudience}`)

    // Per-product customerLanguage trumps brand-level
    const productCL = (prodCtx as { customerLanguage?: string[] }).customerLanguage
    const brandCL = (brandKit as { customerLanguage?: string[] } | null)?.customerLanguage
    const effectiveCL = productCL && productCL.length > 0 ? productCL : brandCL

    const brandLines: string[] = []
    if (brandKit?.colors?.length) brandLines.push(`Brand colors: ${brandKit.colors.join(', ')}`)
    if (brandKit?.primaryFont) brandLines.push(`Brand font feel: ${brandKit.primaryFont}`)
    if (brandKit?.tagline) brandLines.push(`Brand tagline: ${brandKit.tagline}`)
    if (brandKit?.voice) brandLines.push(`Brand voice: ${brandKit.voice}`)

    const userText = [
      'IMAGE = the user\'s product photo. The product is the focal element; design the surrounding scene.',
      'TASK: design a single Facebook ad image (no template, no reference scene) that delivers the angle below.',
      '',
      prodLines.length ? prodLines.join('\n') : '(no product analysis available)',
      '',
      `Marketing angle: ${angle.title}`,
      `Why this angle works: ${angle.description}`,
      `Sample hook: "${angle.hook}"`,
      `Suggested ad style: ${angle.suggestedAdStyle}`,
      '',
      brandLines.length ? brandLines.join('\n') : '(no brand kit set — use a clean, modern look)',
      ...(brandKit?.currentOffer ? [`Current offer to display at the bottom: "${brandKit.currentOffer}"`] : []),
      ...(effectiveCL && effectiveCL.length > 0 ? [`Customer phrases to ground copy in:\n${effectiveCL.map((s) => `- "${s}"`).join('\n')}`] : []),
      '',
      'Visual hierarchy rules (apply to the rendered ad):',
      '1. The largest text element is the main headline — communicates the value proposition or visceral benefit. Readable at thumbnail size in <1 second.',
      '2. Sub-callouts list 2-3 benefits in smaller arrow-pointed text. Benefits, not features.',
      '3. Any offer ("15% off", "Buy 2 Get 1 Free") appears at the very bottom in a tertiary block, smaller than callouts.',
      '4. Pattern disrupt: the composition or copy should be unusual enough to make a viewer pause — unexpected crop, surprising contrast, or curiosity-inducing headline.',
      '',
      'Compose the nano-banana prompt now. Place the user\'s real product (from the IMAGE) front-and-center. Choose a background, lighting, and supporting graphics that fit the angle and brand. Include a short headline rendered in-image (8 words or fewer) consistent with the angle\'s hook. Return ONLY the prompt text.',
    ].join('\n')

    const text = await callVision({
      imageUrls: [productImageUrl],
      prompt: userText,
      systemPrompt:
        'You are an expert ad-image prompt composer. Write nano-banana prompts that produce scroll-stopping Facebook ad images grounded in the user\'s real product photo. Be specific about composition, lighting, palette, and visible text.',
    })

    console.log(`[composeFromAnglePrompt] generationId=${generationId} rawTextType=${typeof text} rawTextLen=${text?.length ?? 'null'}`)
    if (typeof text !== 'string') {
      throw new Error(`Composer returned non-string response: ${JSON.stringify(text).slice(0, 200)}`)
    }
    const prompt = text.trim()
    console.log(`[composeFromAnglePrompt] generationId=${generationId} trimmedLen=${prompt.length} preview=${prompt.slice(0, 120)}`)
    if (!prompt) {
      throw new Error(`Composer returned an empty prompt (raw text length=${text.length}, raw preview=${JSON.stringify(text.slice(0, 120))})`)
    }
    return { prompt }
  },
})

/**
 * Calls nano-banana with [productImage] only and the dynamic prompt the
 * angle composer wrote. Uploads the result to R2 and returns the URL.
 */
export const generateFromAngle = internalAction({
  args: { generationId: v.id('templateGenerations') },
  handler: async (
    ctx,
    { generationId },
  ): Promise<{ outputUrl: string }> => {
    if (isTestMode()) {
      await mockDelay(500)
      return { outputUrl: mockGeneratedImageUrl }
    }

    let ctxData = await ctx.runQuery(internal.studio.getGenerationContextInternal, {
      generationId,
    })
    if (!ctxData?.generation) throw new Error('Generation not found')
    let { generation } = ctxData
    console.log(`[generateFromAngle] generationId=${generationId} mode=${generation.mode} status=${generation.status} dynamicPromptLen=${generation.dynamicPrompt?.length ?? 'undef'} productImageUrlLen=${generation.productImageUrl?.length ?? 'undef'}`)

    // Defensive: if dynamicPrompt is missing, re-fetch once after a short
    // delay to rule out a read-staleness race between the composer's patch
    // and this action's runQuery. (Has been observed in production.)
    if (!generation.dynamicPrompt) {
      console.warn(`[generateFromAngle] dynamicPrompt missing on first read for ${generationId}; retrying after 750ms`)
      await new Promise((r) => setTimeout(r, 750))
      ctxData = await ctx.runQuery(internal.studio.getGenerationContextInternal, {
        generationId,
      })
      if (!ctxData?.generation) throw new Error('Generation not found on retry')
      generation = ctxData.generation
      console.log(`[generateFromAngle] retry generationId=${generationId} dynamicPromptLen=${generation.dynamicPrompt?.length ?? 'undef'}`)
    }
    if (!generation.dynamicPrompt) {
      throw new Error(
        `Dynamic prompt missing — composer step did not complete (generationId=${generationId}, mode=${generation.mode}, status=${generation.status})`,
      )
    }
    const aspectRatio = generation.aspectRatio ?? '1:1'
    const mdl = (generation.model ?? 'nano-banana-2') as ImageEditModel

    // When productImageUrl is empty the caller requested text-to-image (no source).
    let generatedUrl: string
    if (!generation.productImageUrl) {
      ;({ generatedUrl } = await callImageGenModel({
        model: mdl,
        prompt: generation.dynamicPrompt,
        aspectRatio,
      }))
    } else {
      ;({ generatedUrl } = await callImageEditModel({
        model: mdl,
        prompt: generation.dynamicPrompt,
        imageUrls: [generation.productImageUrl],
        aspectRatio,
      }))
    }

    const key = `studio/outputs/${generation.productId ?? 'angle'}/${generation.variationIndex}-${nanoid(6)}.png`
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
  model = 'nano-banana-2',
  prompt,
  imageUrls,
  aspectRatio,
}: {
  model?: ImageEditModel
  prompt: string
  imageUrls: string[]
  aspectRatio: string
}): Promise<{
  rawResponse: unknown
  generatedUrl: string
}> {
  return callImageEditModel({ model, prompt, imageUrls, aspectRatio })
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
      model: (gen.model ?? 'nano-banana-2') as ImageEditModel,
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

// ─── Ad copy wrapper for generation rows ─────────────────────────────────
/**
 * Fetches generation context and calls generateAdCopyText.
 * Returns {headlines, primaryTexts, ctas}, or null if context is insufficient.
 */
export const composeAdCopyForGeneration = internalAction({
  args: { generationId: v.id('templateGenerations') },
  handler: async (ctx, { generationId }): Promise<{
    headlines: string[]
    primaryTexts: string[]
    ctas: string[]
  } | null> => {
    type GenCtx = {
      generation: {
        angleSeed?: { title: string; description: string; hook: string; suggestedAdStyle: string }
        userId?: string
        productId?: string
      }
      productContext: {
        category?: string
        productDescription?: string
        targetAudience?: string
        valueProposition?: string
        name?: string
      } | null
    }
    const ctxData = (await ctx.runQuery(
      internal.studio.getGenerationContextInternal,
      { generationId },
    )) as GenCtx | null
    if (!ctxData?.generation) return null
    const { generation, productContext: prodCtx } = ctxData
    if (!prodCtx) return null

    let angle: { title: string; description: string; hook: string; suggestedAdStyle: string }
    if (generation.angleSeed) {
      angle = generation.angleSeed
    } else {
      angle = {
        title: prodCtx.category ?? 'Product ad',
        description: prodCtx.productDescription ?? '',
        hook: '',
        suggestedAdStyle: 'product hero',
      }
    }

    const brandKit = (generation.userId
      ? await ctx.runQuery(internal.brandKits.getBrandKitForProductInternal, {
          userId: generation.userId,
          productId: generation.productId as any,
        })
      : null) as { voice?: string; tagline?: string; currentOffer?: string; customerLanguage?: string[] } | null

    // Per-product customerLanguage trumps brand-level
    const productCustomerLanguage = (prodCtx as { customerLanguage?: string[] }).customerLanguage
    const effectiveCustomerLanguage = productCustomerLanguage && productCustomerLanguage.length > 0
      ? productCustomerLanguage
      : brandKit?.customerLanguage

    return await ctx.runAction(internal.ai.generateAdCopyText, {
      productName: prodCtx.name ?? 'Product',
      productDescription: prodCtx.productDescription,
      targetAudience: prodCtx.targetAudience,
      valueProposition: prodCtx.valueProposition,
      angle,
      brandVoice: brandKit?.voice,
      brandTagline: brandKit?.tagline,
      currentOffer: brandKit?.currentOffer,
      customerLanguage: effectiveCustomerLanguage,
    })
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
