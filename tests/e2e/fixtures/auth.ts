import { test as base, expect, Page } from '@playwright/test'

/**
 * Extended test fixture with authentication support.
 * Uses Clerk test user credentials from environment variables.
 */

// Extend the base test with an authenticated page fixture
export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    // Navigate to the app
    await page.goto('/')

    // Wait for the page to load
    await page.waitForLoadState('networkidle')

    // Check if already authenticated (session persisted)
    const isAuthenticated = await page.evaluate(() => {
      return !!window.localStorage.getItem('__clerk_client_jwt')
    }).catch(() => false)

    if (!isAuthenticated) {
      // Click sign in button
      const signInButton = page.getByTestId('sign-in-button').or(page.getByRole('button', { name: /sign in/i }))

      if (await signInButton.isVisible()) {
        await signInButton.click()

        // Fill in Clerk credentials
        const email = process.env.TEST_USER_EMAIL
        const password = process.env.TEST_USER_PASSWORD

        if (!email || !password) {
          throw new Error('TEST_USER_EMAIL and TEST_USER_PASSWORD environment variables must be set')
        }

        // Wait for Clerk modal/page to load
        await page.waitForSelector('input[name="identifier"], input[type="email"]', { timeout: 10000 })

        // Fill email
        await page.getByPlaceholder('Enter your email address').fill(email)

        // Fill password (Clerk shows both fields at once)
        await page.getByPlaceholder('Enter your password').fill(password)

        // Click the visible Continue button
        await page.getByRole('button', { name: 'Continue' }).click()

        // Wait for sign-in modal to close (successful auth)
        await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 15000 })
      }
    }

    // Ensure we're on the studio page
    if (!page.url().includes('/studio')) {
      await page.goto('/studio')
    }

    await page.waitForLoadState('networkidle')

    await use(page)
  },
})

export { expect }

/**
 * Helper to save authentication state for reuse across tests.
 * Run this once to generate auth state file.
 */
export async function saveAuthState(page: Page, path: string) {
  await page.context().storageState({ path })
}
