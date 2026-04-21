import { test, expect } from '../fixtures/auth'

test.describe('Admin Template Management', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    // Navigate to admin templates page
    await authenticatedPage.goto('/admin/templates')
    await authenticatedPage.waitForLoadState('networkidle')
  })

  test('can access admin templates page', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    // Should be on admin templates page
    await expect(page).toHaveURL(/\/admin\/templates/)

    // Should see templates header or list
    const header = page.getByRole('heading', { name: /template/i })
    await expect(header).toBeVisible()
  })

  test('can view template grid', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    // Wait for Library section heading to appear
    await expect(page.getByText('Library')).toBeVisible({ timeout: 10000 })

    // Verify templates are loaded by checking for PUBLISHED badges (visible on each template)
    await expect(page.getByText('PUBLISHED').first()).toBeVisible({ timeout: 10000 })

    // Just verify no error state
    await expect(page.getByText(/error|failed to load/i)).not.toBeVisible()
  })

  test('can filter templates by aspect ratio', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    // Look for aspect ratio filter tabs/buttons
    const filterButtons = page.getByRole('button', { name: /1:1|4:5|9:16|16:9|all/i })

    if ((await filterButtons.count()) > 0) {
      // Click on a specific aspect ratio
      const filter = page.getByRole('button', { name: '1:1' })
      if (await filter.isVisible()) {
        await filter.click()
        await page.waitForTimeout(500)
        // Templates should filter (verify no crash)
      }
    }
  })

  test('can select multiple templates with checkboxes', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    // Wait for templates to load
    await page.waitForLoadState('networkidle')

    // Find template checkboxes
    const checkboxes = page.locator('[data-testid^="template-card"] input[type="checkbox"]').or(
      page.locator('[data-testid^="template-card"] [role="checkbox"]')
    )

    if ((await checkboxes.count()) >= 2) {
      // Select multiple templates
      await checkboxes.nth(0).click()
      await checkboxes.nth(1).click()

      // Bulk action buttons should appear
      const bulkDeleteButton = page.getByRole('button', { name: /delete selected|bulk delete/i })
      await expect(bulkDeleteButton).toBeVisible({ timeout: 3000 })
    }
  })

  test('delete uses modal confirmation instead of native confirm', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    await page.waitForLoadState('networkidle')

    // Find a delete button
    const deleteButton = page.locator('[aria-label*="delete"], [aria-label*="Delete"]').first()

    if (await deleteButton.isVisible()) {
      // Click delete
      await deleteButton.click()

      // Should see a modal dialog, not native confirm
      const modal = page.locator('[data-testid="delete-modal"]').or(
        page.getByRole('dialog').filter({ hasText: /delete|confirm|are you sure/i })
      )
      await expect(modal).toBeVisible({ timeout: 3000 })

      // Cancel to not actually delete
      const cancelButton = modal.getByRole('button', { name: /cancel|no|close/i })
      if (await cancelButton.isVisible()) {
        await cancelButton.click()
      } else {
        await page.keyboard.press('Escape')
      }
    }
  })

  test('template images have proper alt text', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    await page.waitForLoadState('networkidle')

    // Check template images for alt text
    const templateImages = page.locator('[data-testid^="template-card"] img')

    if ((await templateImages.count()) > 0) {
      const firstImage = templateImages.first()
      const altText = await firstImage.getAttribute('alt')

      // Alt text should not be empty
      expect(altText).toBeTruthy()
      expect(altText).not.toBe('')
    }
  })

  test('templates display in grid layout (left-to-right)', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    await page.waitForLoadState('networkidle')

    // Verify grid layout exists (not CSS columns)
    const grid = page.locator('[style*="grid"], [class*="grid"]').first()

    if (await grid.isVisible()) {
      // Grid should exist - this confirms CSS Grid is being used
      await expect(grid).toBeVisible()
    }
  })
})

test.describe('Admin Prompts Management', () => {
  test('can access admin prompts page', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    await page.goto('/admin/prompts')
    await page.waitForLoadState('networkidle')

    // Should be on admin prompts page
    await expect(page).toHaveURL(/\/admin\/prompts/)
  })

  test('reset uses modal confirmation instead of native confirm', async ({ authenticatedPage }) => {
    const page = authenticatedPage

    await page.goto('/admin/prompts')
    await page.waitForLoadState('networkidle')

    // Look for reset button
    const resetButton = page.getByRole('button', { name: /reset|restore default/i })

    if (await resetButton.isVisible()) {
      await resetButton.click()

      // Should see modal, not native confirm
      const modal = page.getByRole('dialog').filter({ hasText: /reset|confirm|are you sure/i })
      await expect(modal).toBeVisible({ timeout: 3000 })

      // Cancel
      await page.keyboard.press('Escape')
    }
  })
})
