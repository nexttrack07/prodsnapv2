# Step 0 — Spike: Validate Clerk JWT Claims in Convex

This spike must pass before the billing implementation can be trusted. It answers: "Does `ctx.auth.getUserIdentity()` expose Clerk's `pla` and `fea` claims, and does `@clerk/react/experimental` export the billing hooks we depend on?"

**Time estimate:** 15 minutes (10 for Clerk dashboard setup + 5 to run the spike)

## Prerequisites

- Logged into Clerk dashboard as instance admin
- Dev instance of the app running locally (`pnpm dev`)
- A temporary file `convex/billing-spike.ts` (see step 3) — delete this after the spike

## Step-by-step

### 1. Enable Billing on the Clerk dev instance

1. Go to https://dashboard.clerk.com/~/billing/settings
2. Click **Enable Billing**.
3. Choose **Clerk development gateway** (no Stripe account needed for dev).
4. Save.

### 2. Create a test plan and subscribe as yourself

1. Go to https://dashboard.clerk.com/~/billing/plans.
2. Click **Add plan** (Plans for Users tab).
   - Plan slug: `test-spike`
   - Display name: `Spike Test`
   - Monthly price: $1/mo
   - Mark as Publicly available.
3. Click **Features** → add a feature:
   - Feature slug: `spike-feature`
   - Name: `Spike Test Feature`
4. Assign `spike-feature` to the `test-spike` plan.
5. In the dev app, sign in. Visit any Clerk-provided subscription surface (e.g., `<UserButton />` → Manage account → Billing) and subscribe to `Spike Test`. Use Stripe test card `4242 4242 4242 4242`.
6. Confirm the subscription shows up in Clerk dashboard under **Users** → your test user.

### 3. Add the temporary Convex inspection query

Create a new file **`convex/billing-spike.ts`** with this content (DO NOT COMMIT — this file must be deleted after the spike):

```ts
import { query } from './_generated/server'

export const inspectIdentity = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    console.log('Full identity:', JSON.stringify(identity, null, 2))
    return identity
  },
})
```

Call it from the dev app:

```ts
// In any React component while signed in
const identity = useQuery(api.billingSpike.inspectIdentity)
console.log(identity)
```

### 4. Verify the expected claims

Look at the logged `identity` object. You MUST see:

- `pla` — a string like `"u:test-spike"` (u: = user plan, o: = org plan)
- `fea` — a string like `"u:spike-feature"` or comma-separated features

**If both are present:** ✅ Proceed to Step 5 (experimental hook check).

**If either is missing:** You need a Clerk Custom JWT Template.
1. Go to https://dashboard.clerk.com/~/jwt-templates (or equivalent path).
2. Create a new template named `convex` with audience `convex`.
3. Add these claims to the token payload:
   - `pla`: `{{billing.user_plan_slug}}` (or equivalent — check Clerk's current claim reference)
   - `fea`: `{{billing.user_features}}`
4. Update `convex/auth.config.ts` if the audience changed.
5. Re-test.

### 5. Verify `@clerk/react/experimental` exports the billing hooks

Create a temporary file `src/routes/spike-imports.tsx` (DO NOT COMMIT):

```tsx
// Smoke test — import and log. Delete after spike.
import {
  useCheckout,
  usePaymentElement,
  usePlans,
  CheckoutProvider,
  PaymentElement,
  PaymentElementProvider,
} from '@clerk/react/experimental'

console.log({
  useCheckout: typeof useCheckout,
  usePaymentElement: typeof usePaymentElement,
  usePlans: typeof usePlans,
  CheckoutProvider: typeof CheckoutProvider,
  PaymentElement: typeof PaymentElement,
  PaymentElementProvider: typeof PaymentElementProvider,
})
```

Check the TypeScript compile output and browser console.

**Expected:** All 6 log as `'function'` or `'object'`.

**If TypeScript errors** (e.g., "no exported member 'useCheckout'"): the `@clerk/react` version may not yet ship the experimental billing APIs. Options:
- Upgrade to the latest `@clerk/react` (minor bump) and retry.
- Install `@clerk/tanstack-react-start` alongside `@clerk/react` and import from there.
- Temporarily fall back to `<PricingTable />` for this launch (the plan's contingency path).

### 6. Cleanup

- `rm convex/billing-spike.ts`
- `rm src/routes/spike-imports.tsx`
- Verify `convex/billing-spike.ts` does NOT appear in `git status`.

### 7. Record the result

Edit `.omc/progress.txt` with the spike outcome:

```
Step 0 spike result: PASSED / NEEDS_CUSTOM_JWT_TEMPLATE / EXPERIMENTAL_APIS_UNAVAILABLE
Date: YYYY-MM-DD
Clerk JWT exposes pla: yes / no
Clerk JWT exposes fea: yes / no
@clerk/react/experimental exports billing hooks: yes / no
Custom JWT template created: yes / no (path: ...)
Fallback required: none / custom-template / @clerk/tanstack-react-start / pricing-table
```

## Acceptance criteria (all must be true before proceeding)

- [ ] `ctx.auth.getUserIdentity()` returns an object containing `pla` and `fea` fields (either natively or via a Clerk Custom JWT Template)
- [ ] `@clerk/react/experimental` exports all 6 hooks/components (or a documented fallback is in place)
- [ ] `convex/billing-spike.ts` deleted
- [ ] `src/routes/spike-imports.tsx` deleted
- [ ] Result recorded in `.omc/progress.txt`
