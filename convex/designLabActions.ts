'use node'

import { fal } from '@fal-ai/client'
import { nanoid } from 'nanoid'
import { v } from 'convex/values'
import { z } from 'zod'
import { action } from './_generated/server'
import { internal } from './_generated/api'
import { requireAdmin } from './lib/admin/requireAdmin'
import { uploadFromUrl } from './r2'

fal.config({ credentials: process.env.FAL_KEY })

const LLM_MODEL = 'google/gemini-2.5-flash'

// ─── URL validation (SSRF guard) ─────────────────────────────────────────────

function validateImageUrls(urls: string[]): void {
  const blocked = [
    '169.254.', '10.', '172.16.', '172.17.', '172.18.', '172.19.',
    '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.',
    '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.',
    '192.168.',
  ]
  for (const url of urls) {
    let parsed: URL
    try { parsed = new URL(url) } catch { throw new Error(`Invalid URL: ${url}`) }
    if (parsed.protocol !== 'https:') throw new Error(`Only HTTPS URLs allowed`)
    const h = parsed.hostname.toLowerCase()
    if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || blocked.some(p => h.startsWith(p))) {
      throw new Error(`Private/internal URLs are not allowed`)
    }
  }
}

// ─── JSON parser ──────────────────────────────────────────────────────────────

// Replace literal newlines/tabs inside JSON string values — LLMs sometimes
// emit multi-line prompt text without escaping, which breaks JSON.parse.
function sanitizeJsonStrings(s: string): string {
  return s.replace(/"(?:[^"\\]|\\.)*"/g, (match) =>
    match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t'),
  )
}

function parseJson<T>(response: string, schema: z.ZodType<T>): T {
  let s = response.trim()
  const block = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (block) s = block[1].trim()
  const obj = s.match(/\{[\s\S]*\}/)
  if (obj) s = obj[0]
  s = sanitizeJsonStrings(s)
  try {
    return schema.parse(JSON.parse(s))
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to parse LLM response: ${detail}\nPreview: ${response.slice(0, 400)}`)
  }
}

// ─── Analysis (Step 1) ───────────────────────────────────────────────────────
// Single LLM call with all images + niche context.
// Returns concept titles + rationale only — no prompts yet.

const analysisSchema = z.object({
  concept: z.object({
    title: z.string().min(1),
    rationale: z.string().min(1),
  }),
})

export const analyzeDesigns = action({
  args: {
    imageUrl: v.string(),
    nicheDescription: v.string(),
    targetAudience: v.string(),
    productType: v.string(),
  },
  handler: async (ctx, { imageUrl, nicheDescription, targetAudience, productType }) => {
    await requireAdmin(ctx)

    validateImageUrls([imageUrl])

    const prompt = `Here is a competitor ${productType} design from within a specific niche.

Niche context:
- About: ${nicheDescription}
- Target audience: ${targetAudience}
- Product type: ${productType}

Analyze this design and identify the single most important concept direction that makes it successful within this niche. Stay focused on THIS niche — do not suggest concepts from unrelated categories.

Explain:
1. What visual or thematic elements from the uploaded design support this concept
2. Why it specifically resonates with the described audience

Return ONLY a JSON object:
{
  "concept": {
    "title": "<concept name specific to this niche>",
    "rationale": "<2-3 sentences: evidence from the design + why it clicks with this audience>"
  }
}`

    const result = await fal.subscribe('openrouter/router/vision', {
      input: {
        model: LLM_MODEL,
        image_urls: [imageUrl],
        prompt,
        system_prompt: `You are a print-on-demand design researcher. You identify commercially successful design concepts within specific niches. You never suggest concepts outside the stated niche. Return valid JSON only.`,
        temperature: 0.6,
      },
    })

    const data = result.data as { output?: string; error?: string }
    if (data.error) throw new Error(`Analysis failed: ${data.error}`)
    if (!data.output) throw new Error('Analysis returned no output')

    return parseJson(data.output, analysisSchema)
  },
})

// ─── Product type design guidelines ──────────────────────────────────────────

function getProductGuidelines(productType: string): string {
  const type = productType.toLowerCase()
  if (type === 't-shirt' || type === 'hoodie' || type === 'tote bag') {
    return `APPAREL DESIGN RULES (non-negotiable):
- Maximum 3 colors including background — print costs and visual clarity demand it
- Typography: 1–5 words maximum; short, punchy, immediately readable
- One-second glance rule: the full concept must land in under one second at a distance
- Simple bold compositions — fine details disappear in fabric printing
- Preferred styles: flat vector, line art, illustrated, vintage/distressed — NOT photorealistic
- Text and graphic must complement each other, not compete for attention
- Negative space is your friend — do not crowd the composition
- If typography is the hero, keep the graphic minimal; if the graphic is the hero, keep text minimal or omit it`
  }
  return `DESIGN RULES:
- Keep the composition clean and readable at small sizes
- Limit colors to what the product's printing process supports
- Prioritize immediate visual clarity over complexity`
}

// ─── Concept expansion (Step 2) ───────────────────────────────────────────────
// Text-only LLM call. Takes approved concepts + niche context + count,
// returns structured idea fields per concept.

const expansionSchema = z.object({
  concepts: z.array(z.object({
    conceptTitle: z.string().min(1),
    ideas: z.array(z.object({
      title: z.string().min(1),
      typography: z.string(),
      imageDescription: z.string().min(1),
      style: z.string().min(1),
      colorPalette: z.string().min(1),
      mood: z.string().min(1),
      generationPrompt: z.string().min(1),
    })).min(1).max(6),
  })).min(1),
})

export const expandConcepts = action({
  args: {
    concepts: v.array(v.object({
      title: v.string(),
      rationale: v.string(),
    })),
    nicheDescription: v.string(),
    targetAudience: v.string(),
    productType: v.string(),
    ideasPerConcept: v.number(),
  },
  handler: async (ctx, { concepts, nicheDescription, targetAudience, productType, ideasPerConcept }) => {
    await requireAdmin(ctx)

    const count = Math.min(Math.max(Math.round(ideasPerConcept), 2), 5)
    const conceptList = concepts.map((c, i) => `${i + 1}. ${c.title}: ${c.rationale}`).join('\n')
    const guidelines = getProductGuidelines(productType)

    const prompt = `You are creating structured design ideas for ${productType} graphics within a specific niche.

Niche context:
- About: ${nicheDescription}
- Target audience: ${targetAudience}
- Product type: ${productType}

${guidelines}

The designer has approved these concepts to develop:
${conceptList}

For each concept, create exactly ${count} distinct design ideas. Each idea must:
- Be clearly within the stated niche
- Be visually distinct from the other ideas in the same concept
- Follow all the product design rules above strictly

Return ONLY a JSON object:
{
  "concepts": [
    {
      "conceptTitle": "<exact title from input>",
      "ideas": [
        {
          "title": "<short punchy idea name, 2-5 words>",
          "typography": "<exact text/copy that will appear on the ${productType} — leave empty string if graphic-only>",
          "imageDescription": "<describe the graphic element: what it depicts, composition, key visual details>",
          "style": "<art style: e.g. 'flat vector illustration', 'vintage distressed line art', 'bold minimalist', 'retro badge'...>",
          "colorPalette": "<list 2-3 specific colors by name, e.g. 'forest green, cream white, rust orange'>",
          "mood": "<emotional tone and feel, e.g. 'rugged and nostalgic', 'playful and irreverent', 'bold and aspirational'>",
          "generationPrompt": "<full text-to-image generation prompt reconstructed from all the above fields, optimized for image generation>"
        }
      ]
    }
  ]
}`

    const result = await fal.subscribe('openrouter/router', {
      input: {
        model: LLM_MODEL,
        prompt,
        system_prompt: `You are a print-on-demand design expert. You create structured, commercially viable design ideas for apparel graphics. You strictly follow product-specific design constraints. You never suggest designs that violate the stated rules (too many colors, too much text, etc.). The generationPrompt field must describe a flat, isolated graphic artwork only — no t-shirt shape, no product mockup, no model, no scene. The graphic will be uploaded directly to Printify. Return valid JSON only — no markdown, no explanation.`,
        temperature: 0.8,
      },
    })

    const data = result.data as { output?: string; error?: string }
    if (data.error) throw new Error(`Expansion failed: ${data.error}`)
    if (!data.output) throw new Error('Expansion returned no output')

    return parseJson(data.output, expansionSchema)
  },
})

// ─── Analyze design components (for Analyze & Vary) ──────────────────────────

const designComponentsSchema = z.object({
  typographyText: z.string(),
  typographyStyle: z.string(),
  graphic: z.string(),
  artStyle: z.string(),
  colorPalette: z.string(),
})

export const analyzeDesignComponents = action({
  args: { imageUrl: v.string() },
  handler: async (ctx, { imageUrl }) => {
    await requireAdmin(ctx)
    validateImageUrls([imageUrl])

    const prompt = `Analyze this graphic design and extract its components. Be concise and specific.

Return ONLY a JSON object:
{
  "typographyText": "<exact text/copy visible on the design — empty string if the design has no text>",
  "typographyStyle": "<describe the font treatment: typeface, weight, style, effects, e.g. 'bold distressed serif with irregular baseline' — empty string if no text>",
  "graphic": "<describe the main graphic or illustration: subject, composition, key visual details, e.g. 'mountain biker on rocky trail, silhouette facing right'>",
  "artStyle": "<overall art treatment, e.g. 'flat vector illustration', 'detailed line art', 'vintage badge', 'minimalist icon'>",
  "colorPalette": "<list the main colors by name, e.g. 'navy blue, off-white, gold accent'>"
}`

    const result = await fal.subscribe('openrouter/router/vision', {
      input: {
        model: LLM_MODEL,
        image_urls: [imageUrl],
        prompt,
        system_prompt: `You are a graphic design analyst. Extract design components from images precisely and concisely. Return valid JSON only.`,
        temperature: 0.3,
      },
    })

    const data = result.data as { output?: string; error?: string }
    if (data.error) throw new Error(`Analysis failed: ${data.error}`)
    if (!data.output) throw new Error('Analysis returned no output')

    return parseJson(data.output, designComponentsSchema)
  },
})

// ─── Generate ideas from components (for Analyze & Vary) ─────────────────────

const componentIdeasSchema = z.object({
  ideas: z.array(z.object({
    title: z.string().min(1),
    typography: z.string(),
    imageDescription: z.string().min(1),
    style: z.string().min(1),
    colorPalette: z.string().min(1),
    mood: z.string().min(1),
    generationPrompt: z.string().min(1),
  })).min(1).max(6),
})

export const generateIdeasFromComponents = action({
  args: {
    components: v.object({
      typographyText: v.string(),
      typographyStyle: v.string(),
      graphic: v.string(),
      artStyle: v.string(),
      colorPalette: v.string(),
    }),
    elementsToChange: v.array(v.string()),
    productType: v.string(),
    nicheDescription: v.optional(v.string()),
    ideasCount: v.number(),
  },
  handler: async (ctx, { components, elementsToChange, productType, nicheDescription, ideasCount }) => {
    await requireAdmin(ctx)

    const count = Math.min(Math.max(Math.round(ideasCount), 2), 5)
    const changeSet = new Set(elementsToChange)

    const allKeys = ['typographyText', 'typographyStyle', 'graphic', 'artStyle', 'colorPalette']
    const keepLines = allKeys.filter(k => !changeSet.has(k) && components[k as keyof typeof components])
      .map(k => `- ${k}: "${components[k as keyof typeof components]}"`)
      .join('\n')
    const changeLines = allKeys.filter(k => changeSet.has(k) && components[k as keyof typeof components])
      .map(k => `- ${k}: "${components[k as keyof typeof components]}"`)
      .join('\n')

    const guidelines = getProductGuidelines(productType)
    const nicheBlock = nicheDescription ? `\nNiche context: ${nicheDescription}\n` : ''

    const prompt = `You are creating ${count} design variation ideas for a ${productType} graphic.
${nicheBlock}
Current design components:
${allKeys.filter(k => components[k as keyof typeof components]).map(k => `- ${k}: "${components[k as keyof typeof components]}"`).join('\n')}

The designer wants to KEEP these elements close to the originals:
${keepLines || '(none specified)'}

The designer wants to CHANGE these elements:
${changeLines || '(none specified — create fresh variations across all elements)'}

${guidelines}

Generate exactly ${count} distinct design ideas. For each:
- Preserve the "keep" elements faithfully
- Create fresh, distinct alternatives for the "change" elements
- Each variation must be visually different from the others
- The generationPrompt must describe a flat, isolated graphic artwork only — no t-shirt shape, no product mockup

Return ONLY a JSON object:
{
  "ideas": [
    {
      "title": "<short idea name, 2-5 words>",
      "typography": "<exact text/copy that will appear — empty string if graphic-only>",
      "imageDescription": "<describe the graphic: subject, composition, key visual details>",
      "style": "<art style>",
      "colorPalette": "<2-3 specific colors by name>",
      "mood": "<emotional tone>",
      "generationPrompt": "<full text-to-image prompt, describes flat isolated graphic artwork suitable for Printify upload>"
    }
  ]
}`

    const result = await fal.subscribe('openrouter/router', {
      input: {
        model: LLM_MODEL,
        prompt,
        system_prompt: `You are a print-on-demand design expert. Create structured design variation ideas that preserve specified elements and vary others. Return valid JSON only — no markdown, no explanation.`,
        temperature: 0.8,
      },
    })

    const data = result.data as { output?: string; error?: string }
    if (data.error) throw new Error(`Idea generation failed: ${data.error}`)
    if (!data.output) throw new Error('Idea generation returned no output')

    return parseJson(data.output, componentIdeasSchema)
  },
})

// ─── Generate ideas from instruction (vision LLM) ────────────────────────────

const ideasFromInstructionSchema = z.object({
  ideas: z.array(z.object({
    title: z.string().min(1),
    typography: z.string(),
    imageDescription: z.string().min(1),
    style: z.string().min(1),
    colorPalette: z.string().min(1),
    mood: z.string().min(1),
    generationPrompt: z.string().min(1),
  })).min(1).max(10),
})

export const generateIdeasFromInstruction = action({
  args: {
    imageUrl: v.string(),
    instruction: v.string(),
    productType: v.optional(v.string()),
    count: v.number(),
  },
  handler: async (ctx, { imageUrl, instruction, productType, count }) => {
    await requireAdmin(ctx)
    validateImageUrls([imageUrl])
    if (instruction.length > 1000) throw new Error('Instruction too long (max 1000 chars)')

    const product = productType ?? 'T-shirt'
    const n = Math.min(Math.max(Math.round(count), 2), 10)
    const guidelines = getProductGuidelines(product)

    const prompt = `Here is an existing ${product} graphic design. The designer's request: "${instruction}"

Look at this design carefully and generate ${n} distinct ideas that fulfill the request. Each idea should be similar in spirit to what was asked but visually distinct from the others.

${guidelines}

Each idea must be a flat, isolated graphic artwork — no t-shirt shape, no mockup, no product, suitable for direct upload to Printify.

Return ONLY a JSON object:
{
  "ideas": [
    {
      "title": "<short punchy name, 2-5 words>",
      "typography": "<exact text/copy that will appear — empty string if graphic-only>",
      "imageDescription": "<describe the graphic: subject, composition, key visual details>",
      "style": "<art style, e.g. 'flat vector illustration', 'vintage line art'>",
      "colorPalette": "<2-3 specific colors by name>",
      "mood": "<emotional tone and feel>",
      "generationPrompt": "<full text-to-image generation prompt, flat isolated graphic artwork suitable for Printify>"
    }
  ]
}`

    const result = await fal.subscribe('openrouter/router/vision', {
      input: {
        model: LLM_MODEL,
        image_urls: [imageUrl],
        prompt,
        system_prompt: `You are a print-on-demand design expert. You look at existing designs and generate fresh, commercially viable variations based on designer instructions. You always produce flat graphic artwork descriptions suitable for print-on-demand. Return valid JSON only — no markdown, no explanation.`,
        temperature: 0.85,
      },
    })

    const data = result.data as { output?: string; error?: string }
    if (data.error) throw new Error(`Idea generation failed: ${data.error}`)
    if (!data.output) throw new Error('Idea generation returned no output')

    return parseJson(data.output, ideasFromInstructionSchema)
  },
})

// ─── Remove background for existing design ───────────────────────────────────

export const removeBgForDesign = action({
  args: { id: v.id('designOutputs'), imageUrl: v.string() },
  handler: async (ctx, { id, imageUrl }) => {
    await requireAdmin(ctx)
    validateImageUrls([imageUrl])

    const result = await fal.subscribe('fal-ai/bria/background/remove', {
      input: { image_url: imageUrl },
    })
    const data = result.data as { image?: { url?: string } }
    const outputUrl = data.image?.url
    if (!outputUrl) throw new Error('Background removal did not return an image URL')

    const key = `design-lab/${nanoid()}-nobg.png`
    const bgRemovedUrl = await uploadFromUrl(outputUrl, key)

    await ctx.runMutation(internal.designLab.updateBgRemovedUrl, { id, bgRemovedUrl })
    return { bgRemovedUrl }
  },
})

// ─── Background removal (best-effort, never throws) ─────────────────────────

async function removeBackgroundForDesign(imageUrl: string): Promise<string | undefined> {
  try {
    const result = await fal.subscribe('fal-ai/bria/background/remove', {
      input: { image_url: imageUrl },
    })
    const data = result.data as { image?: { url?: string } }
    const outputUrl = data.image?.url
    if (!outputUrl) return undefined
    const key = `design-lab/${nanoid()}-nobg.png`
    return await uploadFromUrl(outputUrl, key)
  } catch {
    return undefined
  }
}

// ─── Single design generation (Step 3) ───────────────────────────────────────

export const generateSingleDesign = action({
  args: {
    prompt: v.string(),
    promptTitle: v.string(),
    conceptTitle: v.string(),
    referenceImageUrls: v.array(v.string()),
    batchName: v.optional(v.string()),
    nicheDescription: v.optional(v.string()),
  },
  handler: async (ctx, { prompt, promptTitle, conceptTitle, referenceImageUrls, batchName, nicheDescription }) => {
    const adminUserId = await requireAdmin(ctx)

    if (prompt.length > 5000) throw new Error('Prompt too long (max 5000 chars)')
    if (promptTitle.length > 200) throw new Error('Title too long (max 200 chars)')
    if (conceptTitle.length > 200) throw new Error('Concept title too long')

    if (referenceImageUrls.length > 0) validateImageUrls(referenceImageUrls)

    // Append print-ready graphic constraint to every prompt
    const printPrompt = `${prompt} -- flat graphic design artwork only, isolated on a plain white or transparent background, no t-shirt mockup, no product shape, no clothing, no model, no scene, suitable for direct upload to print-on-demand (Printify)`

    let generatedUrl: string | undefined

    if (referenceImageUrls.length > 0) {
      const result = await fal.subscribe('fal-ai/nano-banana-2/edit', {
        input: {
          prompt: printPrompt,
          image_urls: referenceImageUrls,
          aspect_ratio: '1:1' as const,
          output_format: 'png',
          resolution: '1K',
        },
      })
      const data = result.data as { images?: Array<{ url?: string }> }
      generatedUrl = data.images?.[0]?.url
    } else {
      const result = await fal.subscribe('fal-ai/nano-banana-2', {
        input: {
          prompt: printPrompt,
          aspect_ratio: '1:1' as const,
          output_format: 'png',
          resolution: '1K',
        },
      })
      const data = result.data as { images?: Array<{ url?: string }> }
      generatedUrl = data.images?.[0]?.url
    }

    if (!generatedUrl) throw new Error('Image model returned no URL')

    const key = `design-lab/${nanoid()}.png`
    const imageUrl = await uploadFromUrl(generatedUrl, key)

    await ctx.runMutation(internal.designLab.saveDesignOutput, {
      adminUserId,
      imageUrl,
      storageKey: key,
      prompt,
      promptTitle,
      conceptTitle,
      referenceImageUrls,
      batchName,
      nicheDescription,
    })

    return { imageUrl }
  },
})
