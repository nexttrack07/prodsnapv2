import { test, expect } from '../fixtures/auth'

/**
 * These tests require the Convex dev server to be running for product queries.
 * Currently skipped as the test webServer only runs Vite (pnpm dev:web).
 * To enable: run `pnpm dev:db` alongside tests or configure Convex test mode.
 */
test.describe('Product Upload Flow', () => {
  test.skip('user can access studio page', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    // Should be on studio page
    await expect(page).toHaveURL(/\/studio/)

    // Wait for loading to complete
    await expect(page.getByRole('heading', { name: 'My Products' })).toBeVisible({ timeout: 15000 })
  })

  test.skip('upload dropzone or button is visible', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    // Wait for page to load
    await expect(page.getByRole('heading', { name: 'My Products' })).toBeVisible({ timeout: 15000 })

    // Look for the upload button or dropzone
    const uploadButton = page.getByRole('button', { name: /new product/i })
    await expect(uploadButton).toBeVisible()
  })

  test.skip('empty state shows when no products exist', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    // Wait for page to load
    await expect(page.getByRole('heading', { name: 'My Products' })).toBeVisible({ timeout: 15000 })

    // Check if we're in empty state (no products)
    const emptyStateText = page.getByRole('heading', { name: 'No products yet' })
    const productCards = page.locator('[data-testid^="product-card"]')

    // Either we have products or we see empty state
    const hasProducts = await productCards.count() > 0
    if (!hasProducts) {
      await expect(emptyStateText).toBeVisible()
      await expect(page.getByRole('button', { name: 'Upload Your First Product' })).toBeVisible()
    } else {
      // Has products - verify at least one card is visible
      await expect(productCards.first()).toBeVisible()
    }
  })

  test.skip('product grid shows cards when products exist', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    // Wait for page to load
    await expect(page.getByRole('heading', { name: 'My Products' })).toBeVisible({ timeout: 15000 })

    // Check for product cards
    const productCards = page.locator('[data-testid^="product-card"]')
    const hasProducts = await productCards.count() > 0

    if (hasProducts) {
      // Verify cards have expected structure (image, name)
      const firstCard = productCards.first()
      await expect(firstCard.locator('img')).toBeVisible()
    }
    // If no products, that's fine - just means empty state is showing
  })

  test.skip('no error state on studio page', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    // Wait for page to load
    await expect(page.getByRole('heading', { name: 'My Products' })).toBeVisible({ timeout: 15000 })

    // Verify no error messages
    await expect(page.getByText(/error|failed to load/i)).not.toBeVisible()
  })
})
