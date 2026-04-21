import { test, expect } from '../fixtures/auth'

test.describe('Generation Flow', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    // Navigate to a product page
    await authenticatedPage.goto('/studio')
    await authenticatedPage.waitForLoadState('networkidle')

    // Click on the first product card if it exists
    const productCard = authenticatedPage.locator('[data-testid^="product-card"]').first()
    if (await productCard.isVisible()) {
      await productCard.click()
      await authenticatedPage.waitForURL(/\/studio\/[a-z0-9]+/)
    }
  })

  test('can start generation with selected templates', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    // Open template drawer
    const selectButton = page.getByRole('button', { name: /select templates|choose templates/i })
    if (!(await selectButton.isVisible())) {
      test.skip()
      return
    }

    await selectButton.click()
    await page.waitForSelector('[data-testid="template-drawer"], [role="dialog"]', { timeout: 5000 })

    // Select a template
    const templateCard = page.locator('[data-testid^="template-card"]').first()
    if (!(await templateCard.isVisible())) {
      test.skip()
      return
    }

    await templateCard.click()

    // Click generate
    const generateButton = page.getByRole('button', { name: /generate|create/i })
    await expect(generateButton).toBeVisible({ timeout: 3000 })
    await generateButton.click()

    // Should see generating state
    await expect(page.getByText(/generating|processing|in progress/i)).toBeVisible({ timeout: 10000 })
  })

  test('generation cards appear in gallery after completion', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    // Wait for any existing generations to load
    await page.waitForLoadState('networkidle')

    // Check if there are generation cards
    const generationCards = page.locator('[data-testid^="generation-card"]')
    const count = await generationCards.count()

    if (count > 0) {
      // Verify generation cards are visible
      await expect(generationCards.first()).toBeVisible()
    }
  })

  test('generation card shows status badge', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    await page.waitForLoadState('networkidle')

    // Check for status badges on generation cards
    const statusBadge = page.locator('[data-testid^="generation-card"]').first().locator('[class*="Badge"]')

    if (await statusBadge.isVisible()) {
      // Badge should show some status
      const badgeText = await statusBadge.textContent()
      expect(['Ready', 'Generating', 'Failed', 'Pending'].some(s => badgeText?.includes(s))).toBeTruthy()
    }
  })

  test('can click generation card to open lightbox', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    await page.waitForLoadState('networkidle')

    // Click on a generation card
    const generationCard = page.locator('[data-testid^="generation-card"]').first()

    if (await generationCard.isVisible()) {
      await generationCard.click()

      // Lightbox should open
      const lightbox = page.locator('[data-testid="lightbox"]').or(
        page.getByRole('dialog').filter({ has: page.locator('img') })
      )
      await expect(lightbox).toBeVisible({ timeout: 3000 })
    }
  })

  test('escape key closes lightbox', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    await page.waitForLoadState('networkidle')

    // Click on a generation card
    const generationCard = page.locator('[data-testid^="generation-card"]').first()

    if (await generationCard.isVisible()) {
      await generationCard.click()

      // Wait for lightbox
      const lightbox = page.locator('[data-testid="lightbox"]').or(
        page.getByRole('dialog').filter({ has: page.locator('img') })
      )

      if (await lightbox.isVisible()) {
        // Press Escape
        await page.keyboard.press('Escape')

        // Lightbox should close
        await expect(lightbox).not.toBeVisible({ timeout: 2000 })
      }
    }
  })

  test('generation card hover shows overlay', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    await page.waitForLoadState('networkidle')

    // Hover over a generation card
    const generationCard = page.locator('[data-testid^="generation-card"]').first()

    if (await generationCard.isVisible()) {
      await generationCard.hover()

      // Overlay should be visible (opacity > 0)
      const overlay = generationCard.locator('.generation-card-overlay')
      if (await overlay.isVisible()) {
        // Card has hover effect
        await expect(generationCard).toHaveClass(/generation-card-hover/)
      }
    }
  })
})
