/// <reference types="vite/client" />
/**
 * Tests for Template Intelligence ingestion (Phases 1 + 2).
 *
 * The ingest pipeline itself runs inside a @convex-dev/workflow handler, which
 * is driven by the workflow component's own scheduler and isn't directly
 * invocable from convex-test. These tests instead exercise the exact data flow
 * that handler runs — Pass A (computeTemplateTags, now incl. `look`), Pass B
 * (computeTemplateStrategy), Pass C (computeTemplateAdaptation), then the
 * saveTemplateIntelligence mutation — and assert that an `intelligence` object
 * lands on the adTemplates row, all in test mode (CONVEX_TEST_MODE).
 */
import { convexTest, type TestConvex } from 'convex-test'
import { beforeAll, expect, test } from 'vitest'
import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'

const modules = import.meta.glob('./**/*.*s')

// The AI actions short-circuit to deterministic mocks when this is set.
beforeAll(() => {
  process.env.CONVEX_TEST_MODE = 'true'
})

async function seedTemplate(t: TestConvex<typeof schema>): Promise<Id<'adTemplates'>> {
  return t.run((ctx) =>
    ctx.db.insert('adTemplates', {
      imageUrl: 'https://example.com/template.png',
      thumbnailUrl: 'https://example.com/template-thumb.png',
      aspectRatio: '1:1',
      width: 1024,
      height: 1024,
      status: 'pending',
    }),
  )
}

test('Pass A computeTemplateTags returns the on-image look object', async () => {
  const t = convexTest(schema, modules)
  const tags = await t.action(internal.ai.computeTemplateTags, {
    imageUrl: 'https://example.com/template.png',
  })
  expect(tags.look).toBeDefined()
  expect(tags.look.visibleText).toBeDefined()
  expect(typeof tags.look.visibleText.headline).toBe('string')
})

test('Pass B + Pass C return well-formed strategy and adaptation objects', async () => {
  const t = convexTest(schema, modules)
  const strategy = await t.action(internal.ai.computeTemplateStrategy, {
    imageUrl: 'https://example.com/template.png',
  })
  expect(strategy.angle.title.length).toBeGreaterThan(0)
  expect(strategy.hook.length).toBeGreaterThan(0)
  expect(Array.isArray(strategy.claims)).toBe(true)
  expect(Array.isArray(strategy.bestFor.productCategories)).toBe(true)

  const adaptation = await t.action(internal.ai.computeTemplateAdaptation, {
    imageUrl: 'https://example.com/template.png',
    strategyJson: JSON.stringify(strategy),
    lookJson: JSON.stringify({ visibleText: {} }),
  })
  expect(adaptation.adaptation.coreMechanic.length).toBeGreaterThan(0)
  expect(adaptation.reverseEngineeredPrompt.length).toBeGreaterThan(0)
  expect(Array.isArray(adaptation.adaptation.productSubstitutionRules)).toBe(true)
})

test('ingest data flow stores an intelligence object on the template row', async () => {
  const t = convexTest(schema, modules)
  const templateId = await seedTemplate(t)

  // Mirror the workflow handler's orchestration.
  const tags = await t.action(internal.ai.computeTemplateTags, {
    imageUrl: 'https://example.com/template.png',
  })
  const strategy = await t.action(internal.ai.computeTemplateStrategy, {
    imageUrl: 'https://example.com/template.png',
  })
  const adaptation = await t.action(internal.ai.computeTemplateAdaptation, {
    imageUrl: 'https://example.com/template.png',
    strategyJson: JSON.stringify(strategy),
    lookJson: JSON.stringify(tags.look),
  })

  await t.mutation(internal.templates.saveTemplateIntelligence, {
    templateId,
    intelligence: {
      look: {
        visibleText: {
          headline: tags.look.visibleText.headline,
          subheadline: tags.look.visibleText.subheadline,
          body: tags.look.visibleText.body,
          badge: tags.look.visibleText.badge,
          cta: tags.look.visibleText.cta,
        },
        productPlacement: tags.look.productPlacement,
        humanPresence: tags.look.humanPresence,
        negativeSpace: tags.look.negativeSpace,
        safeZones: tags.look.safeZones,
      },
      strategy,
      adaptation: adaptation.adaptation,
      reverseEngineeredPrompt: adaptation.reverseEngineeredPrompt,
      extractedAt: Date.now(),
      modelVersion: 'google/gemini-2.5-pro',
    },
  })

  const row = await t.run((ctx) => ctx.db.get(templateId))
  expect(row?.intelligence).toBeDefined()
  expect(row?.intelligence?.strategy.angle.title.length).toBeGreaterThan(0)
  expect(row?.intelligence?.adaptation.coreMechanic.length).toBeGreaterThan(0)
  expect(row?.intelligence?.reverseEngineeredPrompt.length).toBeGreaterThan(0)
  expect(row?.intelligence?.modelVersion).toBe('google/gemini-2.5-pro')
  expect(typeof row?.intelligence?.extractedAt).toBe('number')
})

test('saveTemplateIntelligence is a no-op for a missing template id', async () => {
  const t = convexTest(schema, modules)
  // Create then delete to get a valid-shaped-but-dangling id.
  const templateId = await seedTemplate(t)
  await t.run((ctx) => ctx.db.delete(templateId))

  await expect(
    t.mutation(internal.templates.saveTemplateIntelligence, {
      templateId,
      intelligence: {
        look: { visibleText: {} },
        strategy: {
          angle: { title: 'x', insight: 'y' },
          hook: 'h',
          creativeConcept: 'c',
          targetBuyer: 'b',
          claims: [],
          bestFor: { productCategories: [], badFitCategories: [], neededAssets: [] },
        },
        adaptation: {
          creativeArchetype: 'a',
          coreMechanic: 'm',
          adaptationInstructions: 'i',
          productSubstitutionRules: [],
          preserve: [],
          avoid: [],
        },
        reverseEngineeredPrompt: 'p',
        extractedAt: Date.now(),
      },
    }),
  ).resolves.toBeNull()
})
