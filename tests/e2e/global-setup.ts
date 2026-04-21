import { chromium, FullConfig } from '@playwright/test'
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load environment variables
config({ path: resolve(__dirname, '../../.env.local') })

/**
 * Global setup runs once before all tests.
 * Seeds test data for the authenticated test user.
 */
async function globalSetup(config: FullConfig) {
  const { baseURL } = config.projects[0].use

  const browser = await chromium.launch()
  const page = await browser.newPage()

  try {
    // Navigate to app
    await page.goto(baseURL || 'http://localhost:3000')
    await page.waitForLoadState('networkidle')

    // Sign in
    const signInButton = page.getByRole('button', { name: /sign in/i })
    if (await signInButton.isVisible()) {
      await signInButton.click()

      const email = process.env.TEST_USER_EMAIL
      const password = process.env.TEST_USER_PASSWORD

      if (!email || !password) {
        console.log('⚠️  Test credentials not set, skipping seed')
        return
      }

      // Wait for Clerk modal
      await page.waitForSelector('input[type="email"], input[name="identifier"]', { timeout: 10000 })

      // Fill credentials
      await page.getByPlaceholder('Enter your email address').fill(email)
      await page.getByPlaceholder('Enter your password').fill(password)
      await page.getByRole('button', { name: 'Continue' }).click()

      // Wait for auth to complete
      await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 15000 })
    }

    // Navigate to studio to ensure we're authenticated
    await page.goto(`${baseURL}/studio`)
    await page.waitForLoadState('networkidle')

    // Wait for the page to load (My Products heading)
    await page.waitForSelector('h1, h2, h3', { timeout: 10000 })

    console.log('✅ Global setup: User authenticated')

  } catch (error) {
    console.error('Global setup error:', error)
  } finally {
    await browser.close()
  }
}

export default globalSetup
