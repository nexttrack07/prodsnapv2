/**
 * Canonical product-category list. Surfaced as the Select options on the
 * /products/new form AND fed to the LLM during URL-import distillation
 * so the model picks one of these instead of inventing a free-form value.
 *
 * Convex actions can't import from src/, so the same list lives mirrored
 * in convex/urlImportsActions.ts. Keep both in sync when adding entries.
 */
export const PRODUCT_CATEGORIES = [
  'Apparel',
  'Backpacks & Bags',
  'Beauty',
  'Books & Media',
  'Electronics',
  'Food & Beverage',
  'Footwear',
  'Headphones & Audio',
  'Health & Wellness',
  'Home & Garden',
  'Jewelry & Watches',
  'Pet Supplies',
  'Skincare',
  'Software & Apps',
  'Sports & Outdoors',
  'Supplements',
  'Toys & Games',
  'Other',
] as const

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number]
