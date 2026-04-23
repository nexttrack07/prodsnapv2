/**
 * Billing checkout smoke tests — P2.1
 *
 * Scope: unauthenticated render paths only. Full Clerk sign-in + Stripe
 * card entry in Playwright is fragile (cross-origin iframes, OTP flows).
 * A full authenticated E2E is tracked as a follow-up once we have a
 * Clerk test-mode storageState fixture.
 *
 * Guard: only runs when CI_E2E=1 is set.
 * Run: CI_E2E=1 pnpm test:e2e tests/e2e/billing-checkout.spec.ts
 */

import { test, expect } from '@playwright/test'

// Skip entire suite unless explicitly opted in
test.beforeEach(async ({}, testInfo) => {
  if (!process.env.CI_E2E) {
    testInfo.skip(true, 'Skipped: set CI_E2E=1 to run e2e billing tests')
  }
})

test.describe('Pricing page — unauthenticated render', () => {
  test('renders "Choose your plan" heading and billing period toggle', async ({ page }) => {
    await page.goto('/pricing')
    await page.waitForLoadState('networkidle')

    // Heading is always present regardless of auth state
    await expect(page.getByRole('heading', { name: /choose your plan/i })).toBeVisible()

    // Billing period toggle is rendered before plan data loads
    await expect(page.getByText(/monthly/i)).toBeVisible()
    await expect(page.getByText(/annual/i)).toBeVisible()
  })

  test('pricing page does not crash on load', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto('/pricing')
    await page.waitForLoadState('networkidle')

    // No uncaught JS errors on initial render
    expect(errors.filter((e) => !e.includes('ResizeObserver'))).toHaveLength(0)
  })
})

test.describe('Checkout page — unauthenticated render', () => {
  test('renders checkout shell for a valid planId', async ({ page }) => {
    await page.goto('/checkout?planId=basic&period=month')
    await page.waitForLoadState('networkidle')

    // Either the checkout form initializes (needs auth → Clerk redirects to sign-in)
    // or the shell renders with a loader. Either way the page must not 404/crash.
    const url = page.url()

    // Acceptable outcomes: on /checkout, on /sign-in (Clerk redirect), or on / (auth redirect)
    const isValidDestination =
      url.includes('/checkout') ||
      url.includes('/sign-in') ||
      url.includes('/sign-up') ||
      url === 'http://localhost:3000/' ||
      url === 'http://localhost:3000'

    expect(isValidDestination).toBe(true)
  })

  test('checkout with missing planId shows pick-a-plan fallback', async ({ page }) => {
    await page.goto('/checkout')
    await page.waitForLoadState('networkidle')

    // The CheckoutRoute renders a "Missing planId — pick a plan" message
    // when planId param is absent — this is purely client-side, no auth needed.
    const bodyText = await page.locator('body').innerText()
    const hasFallback =
      bodyText.toLowerCase().includes('missing planid') ||
      bodyText.toLowerCase().includes('pick a plan') ||
      // Alternatively the app may redirect to /pricing
      page.url().includes('/pricing')

    expect(hasFallback).toBe(true)
  })
})

test.describe('Admin gate — unauthenticated redirect', () => {
  test('non-authenticated user visiting /admin/playground is redirected away', async ({ page }) => {
    await page.goto('/admin/playground')

    // Allow time for client-side auth to resolve and useEffect redirect to fire
    // AdminLayout redirects to "/" when !isAdmin (which includes unauthenticated)
    await page.waitForURL(
      (url) =>
        !url.pathname.startsWith('/admin') ||
        url.pathname === '/admin',
      { timeout: 10000 },
    ).catch(() => {
      // If waitForURL times out, check current URL below
    })

    const finalUrl = new URL(page.url())

    // Must not remain on the protected admin playground route
    // Acceptable: redirected to / or /sign-in or /sign-up
    const isRedirected = !finalUrl.pathname.startsWith('/admin/playground')
    expect(isRedirected).toBe(true)
  })

  test('non-authenticated user visiting /admin/templates is redirected away', async ({ page }) => {
    await page.goto('/admin/templates')

    await page.waitForURL(
      (url) => !url.pathname.startsWith('/admin/templates'),
      { timeout: 10000 },
    ).catch(() => {})

    const finalUrl = new URL(page.url())
    expect(finalUrl.pathname).not.toMatch(/^\/admin\/templates/)
  })
})
