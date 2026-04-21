/**
 * Pre-defined mock responses for AI operations during e2e tests.
 * These are used when CONVEX_TEST_MODE=true to avoid real API calls.
 */

// Mock response for product analysis (vision model)
export const mockVisionResponse = {
  productName: 'Test Product',
  category: 'Electronics',
  description: 'A high-quality test product for e2e testing with premium features and modern design.',
  tags: ['test', 'electronics', 'premium', 'modern'],
}

// Mock response for template tag computation
export const mockTemplateTags = ['product', 'lifestyle', 'minimalist', 'professional']

// Mock response for prompt composition
export const mockPromptResponse = {
  prompt: 'A professional product photo of Test Product, electronics category, on a clean minimalist background with soft studio lighting, high-end commercial photography style',
}

// Mock response for variation prompt
export const mockVariationPromptResponse = {
  prompt: 'A creative variation of Test Product with dynamic lighting, artistic composition, premium product photography',
}

// Mock image URLs - these should be actual test fixtures uploaded to R2
// For now, using placeholder that will be replaced with real test images
export const mockGeneratedImageUrl = 'https://placehold.co/1024x1024/1a1a1a/5474b4?text=Mock+Generated'
export const mockVariationImageUrl = 'https://placehold.co/1024x1024/1a1a1a/5474b4?text=Mock+Variation'

// Test product image for uploads
export const testProductImageUrl = 'https://placehold.co/800x800/2a2a2a/ffffff?text=Test+Product'
