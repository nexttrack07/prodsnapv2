# Step 2 — Clerk Dashboard Configuration

**Time estimate:** 15 minutes.

**Prerequisite:** Step 0 spike passed.

This sets up production plans + capabilities in Clerk. Plan slugs and capability slugs MUST match the app's `convex/lib/billing/planConfig.ts` and `convex/lib/billing/capabilities.ts` exactly — drift is caught by `tests/billing-gates.test.ts`.

## Do this in BOTH dev and production Clerk instances

### 1. Enable Billing

- Dev: https://dashboard.clerk.com (switch to dev instance) → Billing → Enable with **Clerk development gateway**.
- Prod: https://dashboard.clerk.com (switch to prod instance) → Billing → Enable and connect your **Stripe live account** (separate from dev).

### 2. Create the two plans

Go to **Billing → Plans** (Plans for Users tab). Create each with the EXACT slug shown below:

| Plan slug (required exact match) | Display Name | Monthly | Annual | Default |
|---|---|---|---|---|
| `basic` | Basic | $49.99/mo | $39.99/mo | Yes |
| `pro` | Pro | $129.99/mo | $99.00/mo | No |

Mark both as **Publicly available** so they are returned by `usePlans({ for: 'user' })`.

**Do NOT** create a `free` tier — the v1 plan explicitly omits Free. Unsubscribed users are redirected to `/pricing`.

### 3. Create the capabilities (Clerk features)

Go to **Billing → Features**. Create each with the EXACT slug:

| Feature slug (required exact match — Clerk forces underscores) | Description |
|---|---|
| `advanced_templates` | Access to premium template library |
| `hd_output` | High-resolution output (2048px) |
| `variations` | Generate variations from outputs |
| `batch_generation` | Generate >2 variations per template |
| `background_removal` | AI background removal |

Mark each as **Publicly available**.

### 4. Assign all 5 features to both plans

Both Basic and Pro get all 5 features. Capabilities are identical across tiers in v1 — differentiation is volume only (product count + monthly credits, enforced app-side via `PLAN_CONFIG`).

### 5. Verify

- Visit `/pricing` in the dev app. `usePlans()` should return Basic and Pro with correct prices.
- Subscribe to Basic using test card `4242 4242 4242 4242`. Confirm `pla: "u:basic"` in the identity (via the spike query if retained, or via browser devtools network tab inspecting the Clerk session token).
- Unsubscribe and resubscribe to Pro. Confirm `pla: "u:pro"`.

## Acceptance criteria

- [ ] Both plans exist in Clerk with exact slugs `basic` and `pro`
- [ ] All 5 features exist with exact slugs matching `CAPABILITIES.*`
- [ ] Each plan has all 5 features assigned
- [ ] Prices match: Basic $49.99/$39.99, Pro $129.99/$99
- [ ] Dev instance uses Clerk development gateway; production uses Stripe live account (separate)
- [ ] `usePlans()` in the dev app returns both plans with the expected shape
