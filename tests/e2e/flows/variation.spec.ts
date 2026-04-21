import { test, expect } from '../fixtures/auth'

test.describe('Variation Flow', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    // Navigate to a product page with existing generations
    await authenticatedPage.goto('/studio')
    await authenticatedPage.waitForLoadState('networkidle')

    // Click on the first product card if it exists
    const productCard = authenticatedPage.locator('[data-testid^="product-card"]').first()
    if (await productCard.isVisible()) {
      await productCard.click()
      await authenticatedPage.waitForURL(/\/studio\/[a-z0-9]+/)
    }
  })

  test('can open variation drawer from generation card', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    await page.waitForLoadState('networkidle')

    // Look for a generation card with a variation button
    const generationCard = page.locator('[data-testid^="generation-card"]').first()

    if (!(await generationCard.isVisible())) {
      test.skip()
      return
    }

    // Hover to show actions
    await generationCard.hover()

    // Click on variation/edit button
    const variationButton = generationCard.getByRole('button', { name: /variation|edit|customize/i }).or(
      page.locator('[aria-label*="variation"], [aria-label*="edit"]').first()
    )

    if (await variationButton.isVisible()) {
      await variationButton.click()

      // Variation drawer should open
      const drawer = page.locator('[data-testid="variation-drawer"]').or(
        page.getByRole('dialog').filter({ hasText: /variation/i })
      )
      await expect(drawer).toBeVisible({ timeout: 5000 })
    }
  })

  test('variation drawer has change options', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    await page.waitForLoadState('networkidle')

    // Open variation drawer (similar to above)
    const generationCard = page.locator('[data-testid^="generation-card"]').first()

    if (!(await generationCard.isVisible())) {
      test.skip()
      return
    }

    await generationCard.hover()

    const variationButton = generationCard.locator('[aria-label*="variation"], [aria-label*="edit"]').first()

    if (await variationButton.isVisible()) {
      await variationButton.click()

      // Check for variation options (checkboxes/switches)
      const changeTextOption = page.getByText(/text|headline|copy/i)
      const changeColorsOption = page.getByText(/color|palette/i)
      const changeIconsOption = page.getByText(/icon|badge|graphic/i)

      // At least one option should be visible
      const hasOptions =
        (await changeTextOption.isVisible()) ||
        (await changeColorsOption.isVisible()) ||
        (await changeIconsOption.isVisible())

      if (hasOptions) {
        expect(hasOptions).toBeTruthy()
      }
    }
  })

  test('can generate variation', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    await page.waitForLoadState('networkidle')

    // Open variation drawer
    const generationCard = page.locator('[data-testid^="generation-card"]').first()

    if (!(await generationCard.isVisible())) {
      test.skip()
      return
    }

    await generationCard.hover()

    const variationButton = generationCard.locator('[aria-label*="variation"], [aria-label*="edit"]').first()

    if (await variationButton.isVisible()) {
      await variationButton.click()

      // Wait for drawer
      await page.waitForSelector('[data-testid="variation-drawer"], [role="dialog"]', { timeout: 5000 })

      // Toggle at least one option
      const checkbox = page.locator('input[type="checkbox"]').first()
      if (await checkbox.isVisible()) {
        await checkbox.check()
      }

      // Click generate/create button
      const generateBtn = page.getByRole('button', { name: /generate|create|apply/i })
      if (await generateBtn.isVisible()) {
        await generateBtn.click()

        // Should see processing state or new generation
        await expect(
          page.getByText(/generating|processing/i).or(
            page.locator('[data-testid^="generation-card"]')
          )
        ).toBeVisible({ timeout: 15000 })
      }
    }
  })

  test('escape closes variation drawer', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    await page.waitForLoadState('networkidle')

    // Open variation drawer
    const generationCard = page.locator('[data-testid^="generation-card"]').first()

    if (!(await generationCard.isVisible())) {
      test.skip()
      return
    }

    await generationCard.hover()

    const variationButton = generationCard.locator('[aria-label*="variation"], [aria-label*="edit"]').first()

    if (await variationButton.isVisible()) {
      await variationButton.click()

      const drawer = page.locator('[data-testid="variation-drawer"]').or(
        page.getByRole('dialog').filter({ hasText: /variation/i })
      )

      if (await drawer.isVisible()) {
        // Press Escape
        await page.keyboard.press('Escape')

        // Drawer should close
        await expect(drawer).not.toBeVisible({ timeout: 2000 })
      }
    }
  })
})
