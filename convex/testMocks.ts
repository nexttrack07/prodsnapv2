/**
 * Mock responses for Convex AI actions during e2e tests.
 * Used when CONVEX_TEST_MODE=true environment variable is set.
 */

// Check if we're in test mode
export const isTestMode = () => process.env.CONVEX_TEST_MODE === 'true'

// Mock response for product analysis (vision model)
// Must match the return type of analyzeProduct action
export const mockVisionResponse = {
  category: 'electronics' as const,
  productDescription: 'A high-quality test product for e2e testing with premium features and modern design.',
  targetAudience: 'testers, developers, QA engineers, tech enthusiasts',
  valueProposition: 'The reliable choice for teams who need premium quality without the enterprise price tag.',
  marketingAngles: [
    {
      title: 'Premium without the price tag',
      description: 'Position as the smart-money pick for buyers who notice quality but watch the budget.',
      hook: "Premium feel, mid-range price. The teams in the know already switched.",
      suggestedAdStyle: 'before/after demo',
      angleType: 'comparison' as const,
      tags: {
        productCategory: 'electronics',
        imageStyle: 'product-hero',
        setting: 'studio',
        primaryColor: 'cool',
      },
    },
    {
      title: 'Built for power users',
      description: 'Lean into pro features that hobbyist tools skip.',
      hook: "If you've outgrown the basic option, you already know.",
      suggestedAdStyle: 'lifestyle UGC',
      angleType: 'problem-callout' as const,
      tags: {
        productCategory: 'electronics',
        imageStyle: 'lifestyle',
        setting: 'home',
        primaryColor: 'neutral',
      },
    },
  ],
}

// Mock response for template tag computation
export const mockTemplateTags = ['product', 'lifestyle', 'minimalist', 'professional']

// Mock response for prompt composition
export const mockComposedPrompt =
  'A professional product photo of Test Product, electronics category, on a clean minimalist background with soft studio lighting, high-end commercial photography style'

// Mock response for variation prompt
export const mockVariationPrompt =
  'A creative variation of Test Product with dynamic lighting, artistic composition, premium product photography'

// Mock generated image URL - placeholder for tests
// In production tests, replace with actual R2 test fixture URL
export const mockGeneratedImageUrl = 'https://placehold.co/1024x1024/1a1a1a/5474b4?text=Mock+Generated'

// Simulate async delay like real AI calls (but much faster)
export const mockDelay = (ms: number = 100) => new Promise((resolve) => setTimeout(resolve, ms))
