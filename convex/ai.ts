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

// ─── Shared taxonomy ──────────────────────────────────────────────────────
const AD_CATEGORIES = [
  'skincare', 'cosmetics', 'haircare', 'beverage', 'food', 'supplements',
  'fitness', 'apparel', 'accessories', 'electronics', 'home-goods', 'pet',
  'saas', 'service', 'other',
] as const

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

const adTemplateTagsSchema = z.object({
  category: z.enum(AD_CATEGORIES),
  subcategory: z.string().max(40).nullable(),
  scene_types: z.array(z.enum(AD_SCENE_TYPES)).min(1).max(4),
  moods: z.array(z.enum(AD_MOODS)).min(1).max(4),
  scene_description: z.string().min(20).max(400),
})

export const computeTemplateTags = internalAction({
  args: { imageUrl: v.string() },
  handler: async (_ctx, { imageUrl }) => {
    const result = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: adTemplateTagsSchema,
      system:
        'You are a visual ad classifier. Be precise and pick only from the provided enum values. Respond with structured JSON matching the schema exactly.',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `This is a Facebook ad image. Classify it for a template library.

Pick ONE category that best matches the primary product/service being advertised.
Pick 1-4 scene_types that describe the setting/composition.
Pick 1-4 moods that describe the visual feeling.
Optionally provide a subcategory (free-form, ~1-3 words, e.g. "serum", "protein-bar", "running-shoe").
Write a 2-3 sentence scene_description covering the composition, lighting, props, and framing — this will be used as reference when another product is re-shot into this scene.`,
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
