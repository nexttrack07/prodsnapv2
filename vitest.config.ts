import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'edge-runtime',
    include: ['convex/**/*.test.ts', 'convex/**/__tests__/**/*.test.ts'],
    server: {
      deps: {
        // Allow edge-runtime to resolve these Node.js packages used in Convex actions.
        inline: ['@clerk/backend'],
      },
    },
  },
  resolve: {
    alias: {
      // Stub out @clerk/backend in tests so convex-test can load syncPlan.ts.
      // The tests exercise the mutation/query layer, not the Clerk API calls.
      '@clerk/backend': new URL('./convex/testing/clerkBackendStub.ts', import.meta.url).pathname,
    },
  },
})
