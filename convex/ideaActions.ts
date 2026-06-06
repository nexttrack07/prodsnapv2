'use node'

import { fal } from '@fal-ai/client'
import { nanoid } from 'nanoid'
import { v } from 'convex/values'
import { internalAction } from './_generated/server'
import { internal } from './_generated/api'
import { uploadFromUrl } from './r2'

fal.config({ credentials: process.env.FAL_KEY })

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

export const processIdea = internalAction({
  args: {
    ideaId: v.id('ideas'),
    adminUserId: v.string(),
  },
  handler: async (ctx, { ideaId, adminUserId }) => {
    const idea = await ctx.runQuery(internal.ideas.getIdea, { id: ideaId })
    if (!idea) return

    await ctx.runMutation(internal.ideas.markGenerating, { id: ideaId })

    try {
      const printPrompt = `${idea.generationPrompt} -- flat graphic design artwork only, isolated on a plain white or transparent background, no t-shirt mockup, no product shape, no clothing, no model, no scene, suitable for direct upload to print-on-demand (Printify)`

      const result = await fal.subscribe('fal-ai/nano-banana-2', {
        input: {
          prompt: printPrompt,
          aspect_ratio: '1:1' as const,
          output_format: 'png',
          resolution: '1K',
        },
      })

      const data = result.data as { images?: Array<{ url?: string }> }
      const generatedUrl = data.images?.[0]?.url
      if (!generatedUrl) throw new Error('Image model returned no URL')

      const key = `design-lab/${nanoid()}.png`
      const imageUrl = await uploadFromUrl(generatedUrl, key)
      const bgRemovedUrl = await removeBackgroundForDesign(imageUrl)

      await ctx.runMutation(internal.ideas.completeIdea, {
        id: ideaId,
        adminUserId,
        imageUrl,
        storageKey: key,
        prompt: idea.generationPrompt,
        promptTitle: idea.title,
        bgRemovedUrl,
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Generation failed'
      await ctx.runMutation(internal.ideas.markFailed, { id: ideaId, errorMessage })
    }
  },
})
