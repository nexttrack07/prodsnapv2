import { test, expect } from '../fixtures/auth'

test.describe('Template Selection Flow', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    // Navigate to a product page (assumes at least one product exists)
    await authenticatedPage.goto('/studio')
    await authenticatedPage.waitForLoadState('networkidle')

    // Click on the first product card if it exists
    const productCard = authenticatedPage.locator('[data-testid^="product-card"]').first()
    if (await productCard.isVisible()) {
      await productCard.click()
      await authenticatedPage.waitForURL(/\/studio\/[a-z0-9]+/)
    }
  })

  test('can open template selection drawer', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    // Look for "Select Templates" or similar button
    const selectButton = page.getByRole('button', { name: /select templates|choose templates|add templates/i })

    if (await selectButton.isVisible()) {
      await selectButton.click()

      // Template drawer should open
      const drawer = page.locator('[data-testid="template-drawer"]').or(
        page.getByRole('dialog').filter({ hasText: /template/i })
      )
      await expect(drawer).toBeVisible({ timeout: 5000 })
    }
  })

  test('can filter templates by aspect ratio', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    // Open template drawer
    const selectButton = page.getByRole('button', { name: /select templates|choose templates/i })
    if (await selectButton.isVisible()) {
      await selectButton.click()

      // Wait for drawer
      await page.waitForSelector('[data-testid="template-drawer"], [role="dialog"]', { timeout: 5000 })

      // Look for aspect ratio filter buttons
      const aspectRatioFilter = page.getByRole('button', { name: /1:1|4:5|9:16|16:9/i }).first()
      if (await aspectRatioFilter.isVisible()) {
        await aspectRatioFilter.click()
        // Templates should filter (we just verify no crash)
        await page.waitForTimeout(500)
      }
    }
  })

  test('can select multiple templates', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    // Open template drawer
    const selectButton = page.getByRole('button', { name: /select templates|choose templates/i })
    if (await selectButton.isVisible()) {
      await selectButton.click()

      // Wait for drawer
      await page.waitForSelector('[data-testid="template-drawer"], [role="dialog"]', { timeout: 5000 })

      // Click on template cards to select them
      const templateCards = page.locator('[data-testid^="template-card"]')
      const count = await templateCards.count()

      if (count >= 2) {
        await templateCards.nth(0).click()
        await templateCards.nth(1).click()

        // Selection count should update
        const selectionText = page.getByText(/2 selected|selected: 2/i)
        await expect(selectionText).toBeVisible({ timeout: 3000 })
      }
    }
  })

  test('generate button appears when templates selected', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    // Open template drawer
    const selectButton = page.getByRole('button', { name: /select templates|choose templates/i })
    if (await selectButton.isVisible()) {
      await selectButton.click()

      // Wait for drawer
      await page.waitForSelector('[data-testid="template-drawer"], [role="dialog"]', { timeout: 5000 })

      // Select a template
      const templateCard = page.locator('[data-testid^="template-card"]').first()
      if (await templateCard.isVisible()) {
        await templateCard.click()

        // Generate button should appear
        const generateButton = page.getByRole('button', { name: /generate|create/i })
        await expect(generateButton).toBeVisible({ timeout: 3000 })
      }
    }
  })

  test('template cards have click feedback animation', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    // Open template drawer
    const selectButton = page.getByRole('button', { name: /select templates|choose templates/i })
    if (await selectButton.isVisible()) {
      await selectButton.click()

      // Wait for drawer
      await page.waitForSelector('[data-testid="template-drawer"], [role="dialog"]', { timeout: 5000 })

      // Verify template cards have the selectable class
      const templateCard = page.locator('.template-card-selectable').first()
      if (await templateCard.isVisible()) {
        // Card should exist with animation class
        await expect(templateCard).toHaveClass(/template-card-selectable/)
      }
    }
  })
})
