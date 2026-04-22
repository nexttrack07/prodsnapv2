// Stub for @clerk/backend used in vitest/convex-test environment.
// The real Clerk calls happen in actions (not testable via convex-test);
// this stub lets convex-test load syncPlan.ts without the Node.js SDK.
export function createClerkClient(_opts: { secretKey: string }) {
  return {
    billing: {
      getUserBillingSubscription: async (_userId: string) => {
        throw new Error('Clerk not available in test environment')
      },
      cancelSubscriptionItem: async (_itemId: string, _opts: unknown) => {},
      getPlans: async () => [],
      listPlans: async () => [],
    },
  }
}
