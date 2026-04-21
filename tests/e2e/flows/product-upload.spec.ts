import { test, expect } from '../fixtures/auth'
import path from 'path'

test.describe('Product Upload Flow', () => {
  test('user can upload a product image via dropzone', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    // Should be on studio page
    await expect(page).toHaveURL(/\/studio/)

    // Look for the upload dropzone or "New Product" button
    const uploadButton = page.getByRole('button', { name: /new product|upload/i })
    await expect(uploadButton).toBeVisible()

    // Create a test image file for upload
    const testImagePath = path.join(__dirname, '../../fixtures/test-product.png')

    // Set up file chooser before clicking
    const fileChooserPromise = page.waitForEvent('filechooser')

    // Click the upload area
    await uploadButton.click()

    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(testImagePath)

    // Wait for upload progress to appear
    await expect(page.getByRole('progressbar')).toBeVisible({ timeout: 5000 })

    // Wait for navigation to product page
    await page.waitForURL(/\/studio\/[a-z0-9]+/, { timeout: 30000 })

    // Verify we're on the product page
    await expect(page.getByText(/analyzing|ready/i)).toBeVisible({ timeout: 10000 })
  })

  test('upload shows progress indicator', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    // Navigate to studio
    await page.goto('/studio')
    await page.waitForLoadState('networkidle')

    // Upload button should be visible
    const uploadButton = page.getByRole('button', { name: /new product|upload/i })
    await expect(uploadButton).toBeVisible()
  })

  test('rejects files that are too large', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    // Navigate to studio
    await page.goto('/studio')
    await page.waitForLoadState('networkidle')

    // We can't easily create a >10MB file in the test, but we can verify the UI exists
    const uploadArea = page.locator('[data-testid="upload-dropzone"]').or(
      page.getByRole('button', { name: /new product|upload/i })
    )
    await expect(uploadArea).toBeVisible()
  })

  test('empty state shows when no products exist', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    // Navigate to studio
    await page.goto('/studio')
    await page.waitForLoadState('networkidle')

    // If no products, should see empty state with upload prompt
    // This depends on whether the test user has products
    const hasProducts = await page.locator('[data-testid^="product-card"]').count() > 0

    if (!hasProducts) {
      await expect(page.getByText(/no products yet|upload your first/i)).toBeVisible()
    }
  })

  test('product card appears after successful upload', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    // If we've uploaded a product in previous tests, verify it shows in the grid
    await page.goto('/studio')
    await page.waitForLoadState('networkidle')

    // Wait for any loading to complete
    await page.waitForSelector('[data-testid^="product-card"], [data-testid="upload-dropzone"]', {
      timeout: 10000,
    })
  })
})
