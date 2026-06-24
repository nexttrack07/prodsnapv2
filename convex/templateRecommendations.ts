/**
 * Template Intelligence — Phase 4: recommend templates for a marketing angle.
 *
 * On-demand (NOT persisted): given a product + a selected marketing angle,
 * pick a cheap deterministic candidate set of published library templates, run
 * ONE LLM rerank over their `intelligence` strategy, and return the top ~8
 * enriched with thumbnail/image for the UI card grid.
 *
 * No schema changes. Auth + ownership mirror angleGenerations.ts. The LLM call
 * is delegated to `internal.ai.callTextInternal` (importing fal here is not
 * allowed). In test mode the LLM step is skipped so build/tests stay green.
 */
import { v } from 'convex/values'
import { z } from 'zod'
import { action, internalQuery } from './_generated/server'
import { internal } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'
import { isTestMode } from './testMocks'

const MAX_CANDIDATES = 40
const MAX_RESULTS = 8

type RecommendedTemplate = {
  templateId: Id<'adTemplates'>
  reason: string
  thumbnailUrl: string
  imageUrl: string
  aspectRatio: '1:1' | '4:5' | '9:16' | '16:9'
}

// ─── Internal query: candidate selection (cheap, deterministic) ──────────────
// Runs in the default Convex runtime (db access). Scans published adTemplates
// via the by_status index, keeps curated + public rows that carry
// `intelligence`, scores them by category / angleType fit, and returns the top
// MAX_CANDIDATES. Also returns the resolved angle for prompt building.
export const selectCandidates = internalQuery({
  args: {
    productId: v.id('products'),
    angleIndex: v.number(),
    userId: v.string(),
  },
  handler: async (ctx, { productId, angleIndex, userId }) => {
    const product = await ctx.db.get(productId)
    if (!product) throw new Error('Product not found')
    if (product.userId && product.userId !== userId) {
      throw new Error('Not authorized to access this product')
    }
    if (!product.marketingAngles || product.marketingAngles.length === 0) {
      throw new Error('No marketing angles available — re-run analysis first')
    }
    if (angleIndex < 0 || angleIndex >= product.marketingAngles.length) {
      throw new Error('Invalid angle index')
    }
    const angle = product.marketingAngles[angleIndex]
    const productCategory = product.category?.toLowerCase().trim()
    const angleType = angle.angleType

    const all = await ctx.db
      .query('adTemplates')
      .withIndex('by_status', (q) => q.eq('status', 'published'))
      .order('desc')
      .collect()

    type Scored = { doc: Doc<'adTemplates'>; score: number }
    const scored: Scored[] = []
    for (const t of all) {
      // Browse visibility: curated + anyone's public custom; never private.
      if (t.ownerUserId && t.visibility !== 'public') continue
      // Need deep intelligence to rerank meaningfully.
      const intel = t.intelligence
      if (!intel) continue

      let score = 0
      const cats = intel.strategy.bestFor.productCategories.map((c) =>
        c.toLowerCase().trim(),
      )
      if (productCategory && cats.includes(productCategory)) score += 3
      // Penalise explicit bad-fit categories.
      const badCats = intel.strategy.bestFor.badFitCategories.map((c) =>
        c.toLowerCase().trim(),
      )
      if (productCategory && badCats.includes(productCategory)) score -= 5

      const templateAngleType =
        intel.strategy.angle.angleType ?? t.angleType ?? undefined
      if (angleType && templateAngleType && templateAngleType === angleType) {
        score += 2
      }
      scored.push({ doc: t, score })
    }

    // Stable sort: higher score first, then most recent (already desc order).
    scored.sort((a, b) => b.score - a.score)
    const candidates = scored.slice(0, MAX_CANDIDATES).map((s) => s.doc)

    return {
      angle: {
        title: angle.title,
        description: angle.description,
        hook: angle.hook,
        suggestedAdStyle: angle.suggestedAdStyle,
        angleType: angle.angleType,
      },
      product: {
        category: product.category,
        description: product.productDescription,
        targetAudience: product.targetAudience,
      },
      candidates: candidates.map((t) => {
        const intel = t.intelligence!
        return {
          templateId: t._id,
          thumbnailUrl: t.thumbnailUrl,
          imageUrl: t.imageUrl,
          aspectRatio: t.aspectRatio,
          // Compact strategy summary for the prompt.
          angleTitle: intel.strategy.angle.title,
          creativeConcept: intel.strategy.creativeConcept,
          creativeArchetype: intel.adaptation.creativeArchetype,
          coreMechanic: intel.adaptation.coreMechanic,
          bestForCategories: intel.strategy.bestFor.productCategories,
        }
      }),
    }
  },
})

// Zod schema for the LLM rerank response.
const rerankSchema = z.object({
  ranked: z
    .array(
      z.object({
        templateId: z.string(),
        reason: z.string(),
        matchedAngle: z.string().optional(),
      }),
    )
    .default([]),
})

/**
 * Public action: recommend templates for a product's marketing angle.
 * Returns up to MAX_RESULTS enriched, ranked templates. Computed on demand;
 * nothing is persisted.
 */
export const recommendTemplatesForAngle = action({
  args: {
    productId: v.id('products'),
    angleIndex: v.number(),
  },
  handler: async (
    ctx,
    { productId, angleIndex },
  ): Promise<RecommendedTemplate[]> => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')
    const userId = identity.tokenIdentifier

    const { angle, product, candidates } = await ctx.runQuery(
      internal.templateRecommendations.selectCandidates,
      { productId, angleIndex, userId },
    )

    if (candidates.length === 0) return []

    const byId = new Map(candidates.map((c) => [c.templateId as string, c]))
    const candidateIds = new Set(byId.keys())

    // Build the ordered list of (id, reason) we will enrich + return.
    let ranked: { templateId: string; reason: string }[]

    if (isTestMode()) {
      // No LLM call in tests — return the first MAX_RESULTS candidates with
      // deterministic stub reasons so build/tests stay green.
      ranked = candidates.slice(0, MAX_RESULTS).map((c) => ({
        templateId: c.templateId as string,
        reason: `Matches the "${angle.title}" angle (${c.creativeArchetype}).`,
      }))
    } else {
      const compactCandidates = candidates.map((c) => ({
        templateId: c.templateId as string,
        angleTitle: c.angleTitle,
        creativeConcept: c.creativeConcept,
        creativeArchetype: c.creativeArchetype,
        coreMechanic: c.coreMechanic,
        bestFor: c.bestForCategories,
      }))

      const systemPrompt =
        'You are a senior Meta media buyer matching ad-creative templates to a ' +
        'product marketing angle. Pick the templates whose strategy and ' +
        'creative mechanic best execute the given angle for this product. ' +
        'Respond with ONLY a JSON object.'

      const prompt = [
        'PRODUCT:',
        JSON.stringify(
          {
            category: product.category ?? 'unknown',
            description: product.description ?? '',
            targetAudience: product.targetAudience ?? '',
          },
          null,
          0,
        ),
        '',
        'SELECTED MARKETING ANGLE:',
        JSON.stringify(
          {
            title: angle.title,
            description: angle.description,
            hook: angle.hook,
            suggestedAdStyle: angle.suggestedAdStyle,
            angleType: angle.angleType ?? null,
          },
          null,
          0,
        ),
        '',
        'CANDIDATE TEMPLATES:',
        JSON.stringify(compactCandidates, null, 0),
        '',
        `Rank the best matches (max ${MAX_RESULTS}). Use ONLY templateId values ` +
          'from the candidates above. For each, give a short one-sentence ' +
          '`reason` (how the template executes this angle) and a `matchedAngle` ' +
          '(the candidate angle title that aligns).',
        '',
        'Return JSON shaped exactly as:',
        '{"ranked":[{"templateId":"<id>","reason":"<short reason>","matchedAngle":"<title>"}]}',
      ].join('\n')

      const raw: string = await ctx.runAction(internal.ai.callTextInternal, {
        prompt,
        systemPrompt,
      })

      let parsed: z.infer<typeof rerankSchema>
      try {
        parsed = parseRerank(raw)
      } catch (err) {
        // LLM/parse failure must not break the UI — fall back to deterministic
        // candidate order.
        console.warn(
          `[recommendTemplatesForAngle] rerank parse failed, falling back: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
        parsed = { ranked: [] }
      }

      // Validate ids against the candidate set (drop hallucinated ids), dedupe.
      const seen = new Set<string>()
      ranked = []
      for (const r of parsed.ranked) {
        if (!candidateIds.has(r.templateId)) continue
        if (seen.has(r.templateId)) continue
        seen.add(r.templateId)
        ranked.push({
          templateId: r.templateId,
          reason: r.reason?.trim() || 'Recommended for this angle.',
        })
        if (ranked.length >= MAX_RESULTS) break
      }

      // If the model returned nothing usable, fall back to candidate order.
      if (ranked.length === 0) {
        ranked = candidates.slice(0, MAX_RESULTS).map((c) => ({
          templateId: c.templateId as string,
          reason: `Matches the "${angle.title}" angle (${c.creativeArchetype}).`,
        }))
      }
    }

    // Enrich from the candidate snapshots (already loaded, no extra reads).
    const result: RecommendedTemplate[] = []
    for (const r of ranked) {
      const c = byId.get(r.templateId)
      if (!c) continue
      result.push({
        templateId: c.templateId,
        reason: r.reason,
        thumbnailUrl: c.thumbnailUrl,
        imageUrl: c.imageUrl,
        aspectRatio: c.aspectRatio,
      })
      if (result.length >= MAX_RESULTS) break
    }
    return result
  },
})

// Reuses the same extraction strategy as ai.ts:parseJsonFromResponse but kept
// local (ai.ts's helper is not exported). Strips code fences, extracts the
// first JSON object, validates with zod.
function parseRerank(response: string): z.infer<typeof rerankSchema> {
  let jsonStr = response.trim()
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim()
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
  if (jsonMatch) jsonStr = jsonMatch[0]
  const parsed = JSON.parse(jsonStr)
  return rerankSchema.parse(parsed)
}
