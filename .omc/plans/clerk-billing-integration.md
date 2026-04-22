# Clerk Billing Integration Plan -- ProdSnap

**Status:** DRAFT (Iteration 4 -- custom UI via Clerk experimental hooks; Architect + Critic re-review optional)
**Created:** 2026-04-21
**Complexity:** HIGH (billing/payments, security-critical, beta API)

---

## RALPLAN-DR Summary

### Principles

1. **Never trust the client for plan checks.** Every paid feature must be enforced on the Convex backend via JWT claims. UI gating is cosmetic only.
2. **Clerk is the single source of truth for subscription state; append-only audit log permitted.** No subscription/plan data is persisted in Convex tables for enforcement purposes. Plan checks read directly from the Clerk JWT claims (`pla`, `fea`). However, an append-only `billingEvents` table records every gate check (especially denials) for dispute resolution and compliance.
3. **Capability-based gating, never plan-based.** Mutation code calls `requireCapability(ctx, CAPABILITIES.X)` — never `requirePlan('pro')`. This decouples enforcement logic from pricing tiers. Adding a plan means appending an entry to `PLAN_CONFIG` and mirroring it in the Clerk dashboard; no mutation code touches.
4. **Pin versions during beta.** Lock `@clerk/react` and `clerk-js` to exact versions. Clerk Billing is beta; breaking changes are expected.
5. **Graceful degradation (two intentionally opposite modes).** (a) When `BILLING_ENABLED=false` on the Convex server, all paid features are accessible to all authenticated users (fail-open, since users may have already paid). (b) When Clerk JWT lacks `pla`/`fea` claims but `BILLING_ENABLED=true`, deny all paid features and redirect to `/pricing` (fail-closed on the premium side — no Free tier to fall back to in v1). These two modes are intentionally opposite and must not be confused.
6. **Design for evolution.** Plans, features, capabilities, and pricing will change as the product matures. Mutation code references capabilities through a central registry — never raw strings, never plan slugs. Plan→capability and plan→limit mappings live in a single declarative config file, not in helper logic. Adding a feature, a plan tier, or a metered capability must be a config change, not a logic change. Every hardcoded plan or feature slug outside `convex/lib/billing/capabilities.ts` or `convex/lib/billing/planConfig.ts` is a bug.

### Decision Drivers (Top 3)

1. **Convex JWT identity model.** Convex `ctx.auth.getUserIdentity()` exposes standard OIDC claims plus Clerk's custom claims. The `pla` and `fea` JWT claims must be accessible server-side for enforcement. If they are not exposed by default, a Clerk custom JWT template targeting the `convex` audience must be configured to include them.
2. **Custom UI via Clerk's experimental hooks.** We are NOT using Clerk's `<PricingTable/>` (generic styling). Instead we use `usePlans()`, `<CheckoutProvider>`, `useCheckout()`, `usePaymentElement()`, and `<PaymentElement/>` from `@clerk/react/experimental` — these let us fully control pricing, checkout, and subscription management surfaces while Clerk still handles the Stripe-backed payment session. `<Show>` is still used for capability gating (not a UI concern). No package swap required.
3. **Clerk development gateway for testing.** Clerk provides a shared test Stripe account for dev instances, so no real Stripe account is needed until production.

### Viable Options

#### Option A: Clerk JWT Claims Only (Pure)

Read plan/feature claims directly from the Clerk JWT via `ctx.auth.getUserIdentity()` in Convex functions. No data stored in Convex at all.

**Pros:**
- Zero additional tables or sync logic
- Real-time: JWT refreshes on plan change (Clerk handles this)
- Clerk is sole source of truth -- no drift possible

**Cons:**
- No server-side audit trail for disputes or compliance
- Depends on Clerk JWT containing `pla`/`fea` claims (needs spike validation)
- JWT has ~60s TTL; plan changes not instant

**Verdict:** Rejected for production -- no audit trail is a compliance/dispute liability for a payment-adjacent system.

#### Option B: Webhook-Synced Subscription Table in Convex

Listen to Clerk billing webhooks, persist subscription state in a Convex `userSubscriptions` table, and check that table in mutations/queries.

**Pros:**
- Full control over subscription data
- Can add custom logic (grace periods, usage counters)

**Cons:**
- Significant complexity: webhook endpoint, signature verification, table schema, sync logic
- Eventual consistency: webhook delivery is not instant
- Dual source of truth risk (Clerk + Convex can drift)

**Verdict:** Overkill for current needs. No metered billing or custom logic required.

#### Option C: Hybrid -- JWT Enforcement + Audit Log (CHOSEN)

Use JWT claims for enforcement (same as Option A), but add an append-only `billingEvents` table that logs every gate check. No webhooks, no enforcement from the table -- it exists purely for audit/dispute resolution.

**Pros:**
- Same simplicity as Option A for enforcement logic
- Audit trail for disputes and compliance (marginal cost: one insert per gated call)
- Foundation for future analytics without requiring webhooks
- Single source of truth for enforcement (JWT) with a passive record

**Cons:**
- One additional table and one insert per gated mutation call
- Table grows over time (needs TTL/cleanup policy eventually)

### Pre-Mortem (Deliberate Mode -- 4 Scenarios)

#### Scenario 1: JWT Claims Not Exposed in Convex UserIdentity

**What goes wrong:** `ctx.auth.getUserIdentity()` returns a `UserIdentity` object that does not include Clerk's custom `pla` and `fea` claims. `extractBillingClaims` returns the free-tier default and `requireCapability` blocks all users, including paid ones.

**Early warning:** The spike task in Step 0 fails to read claims. Caught in dev before any production deployment.

**Mitigation:** Create a Clerk Custom JWT Template named `convex` that explicitly includes `pla` and `fea` in the token payload. Update `convex/auth.config.ts` if the audience changes. Alternatively, use Clerk's `getToken({ template: 'convex' })` if the standard session token is insufficient.

#### Scenario 2: Plan Downgrade Race Condition

**What goes wrong:** User downgrades from Pro to Free. JWT has ~60s TTL. During the window before token refresh, user can still call paid mutations (e.g., generate with advanced templates). They get 1-2 "free" generations.

**Early warning:** Monitoring shows generation counts exceeding tier limits for recently-downgraded users.

**Mitigation:** Acceptable risk for ProdSnap (AI generation has a real cost but a few extra generations are tolerable). For tighter enforcement, add a server-side check that queries Clerk's API for current subscription status on high-cost operations (generation mutations). This is a future enhancement, not needed at launch.

**Cost exposure quantification:** Worst case per downgrade event: 1-2 extra AI generations within the ~60s JWT window. At ~$0.04/generation (estimated API cost), max exposure is ~$0.08/user/downgrade. At <100 users, total monthly risk is negligible (<$8). Revisit at 1000+ users or if generation cost increases.

#### Scenario 3: Clerk Billing Beta Breaking Change

**What goes wrong:** Clerk ships a breaking change to the billing API. `has()` throws, JWT claim names change (`pla` -> something else), or Clerk server-side billing semantics shift. (The experimental-hook surface is covered separately in Scenario 5.)

**Early warning:** CI/CD smoke tests fail on Clerk component rendering. Convex function logs show unexpected errors from `requireCapability`. `extractBillingClaims` unit tests start failing on fresh Clerk dev-instance tokens.

**Mitigation:** (a) Pin `@clerk/react` and `clerk-js` to exact versions. (b) Add a health-check test that verifies `PricingTable` renders and `has()` returns a boolean. (c) Claim-format churn is absorbed by adding a `v2` branch to `extractBillingClaims` without touching callers. (d) Subscribe to Clerk's changelog/beta announcements. (e) Kill switch: flip `BILLING_ENABLED` in Convex dashboard (instant, no rebuild) to disable all server-side enforcement. Optionally set `VITE_BILLING_ENABLED=false` in Netlify and rebuild to hide UI.

#### Scenario 4: Post-Checkout Stale JWT (PRIMARY CONVERSION PATH)

**What goes wrong:** User completes checkout on `/pricing`, but Convex still has stale JWT with `pla: "u:free"`. User immediately navigates to studio and tries a paid feature. Gets "requires paid plan" error seconds after paying.

**Early warning:** Support tickets from users saying "I just paid but it's not working." Billing event log shows denials within 60s of a plan change.

**Mitigation:** After `checkout.finalize()` succeeds, show an "Activating your plan..." interstitial. The interstitial polls a lightweight Convex query (`getBillingStatus`) that reads the plan claim from the current JWT. After `clerk.session?.reload()` forces a JWT refresh, the poll detects the new plan and redirects to studio. Timeout after 10 seconds with a "Still activating -- try refreshing" message and retry button. See Step 4 for implementation details.

#### Scenario 5: Clerk Experimental Hook API Churn (Custom UI Path)

**What goes wrong:** `@clerk/react/experimental` ships a breaking change to one of the billing hooks we depend on (`useCheckout`, `usePaymentElement`, `usePlans`, `<CheckoutProvider>`, `<PaymentElement>`). Hook signatures change, a hook is renamed, or the `/experimental` export path is reorganized. Custom pricing/checkout/billing pages break or render blank after a package upgrade.

**Early warning:** TypeScript compile errors after a `pnpm update`. E2E tests (custom checkout flow) fail. Convex dev-deploy goes green but the client bundle throws runtime errors on the `/pricing`, `/checkout`, or `/account/billing` routes.

**Mitigation:** (a) Pin `@clerk/react` AND `@clerk/clerk-js` to exact versions (no `^`, no `~`); see Step 5. (b) Never auto-upgrade Clerk packages — treat every bump as a dedicated PR with full E2E validation of all three custom surfaces. (c) Isolate Clerk-experimental dependencies: all usage of `useCheckout`, `usePaymentElement`, etc. lives in a small set of files under `src/routes/(billing)/` or `src/components/billing/`. If the API changes, changes are localized. (d) CI runs a smoke test on `/pricing`, `/checkout`, and `/account/billing` after every Clerk upgrade PR. (e) Kill switch (`BILLING_ENABLED=false` Convex + `VITE_BILLING_ENABLED=false` Netlify) disables all custom billing surfaces; users see a "Billing temporarily unavailable" interstitial on pricing/account routes. (f) Subscribe to Clerk's experimental-APIs changelog (not the main changelog) and prefer Clerk Billing's GA cutover when available.

### Test Plan (Deliberate Mode -- Expanded)

#### Unit Tests
- `extractBillingClaims` (v1): test with mock `UserIdentity` containing `pla`/`fea` in the Clerk v1 format, test with missing claims (returns `{plan: 'free', capabilities: []}`), test with only `pla` or only `fea`.
- `requireCapability` helper: test with mock context containing the required capability (allows), missing capability (throws), no identity (throws "Not authenticated").
- `requireCapability` with `BILLING_ENABLED=false` -- allows every authenticated user regardless of capability.
- `requireProductLimit`: test each plan's scalar limit from `PLAN_CONFIG`, assert the throw message includes both N (current) and M (limit).
- Registry/config consistency: every capability in `CAPABILITIES` appears in at least one `PLAN_CONFIG` entry; every capability referenced in `PLAN_CONFIG` is declared in `CAPABILITIES`.

#### Integration Tests
- Convex function tests using `convex-test`: call `generateFromProduct` with a mock identity that has the `pro` plan, verify it succeeds. Call with `free` plan identity, verify it throws with the descriptive capability error.
- Test `createProduct` with free tier (should succeed up to `PLAN_CONFIG.free.productLimit` = 3).
- **Billing gate coverage test** (`tests/billing-gates.test.ts`): enumerates all public mutations in `convex/products.ts`, `convex/studio.ts`, `convex/productImages.ts`. For each billing-gated mutation, calls it with a free-tier mock identity (`pla: "u:free"`, `fea: ""`) and asserts throw. For each non-gated mutation, asserts no throw. Also asserts registry/config consistency (every `CAPABILITIES` entry used in `PLAN_CONFIG`, every `PLAN_CONFIG` capability declared in `CAPABILITIES`). CI fails if new public mutations are added without being categorized.

#### E2E Tests
- **Happy path:** Sign up -> navigate to `/pricing` -> click Pro card's Subscribe button -> land on `/checkout?planId=...&period=month` -> verify order summary shows Pro + $129.99 -> enter Stripe test card `4242424242424242` in the `<PaymentElement/>` -> submit -> interstitial appears -> JWT refresh completes -> redirect to `/studio` -> verify paid features are visible. Navigate to `/account/billing` and verify current plan shows Pro with masked card and next renewal date.
- **Post-checkout refresh:** User subscribes via test card, then within 5 seconds calls a paid Convex mutation. Assert it succeeds (means JWT refresh + interstitial worked).
- **Card failure:** Use Stripe test card `4000000000000002` (decline) -> verify error message in PricingTable checkout -> verify user has no active subscription and is redirected to `/pricing` when attempting studio features.
- **Plan change mid-cycle:** Subscribe to Pro -> downgrade to Free -> verify UI updates (paid features hidden) -> verify Convex mutations reject paid operations after token refresh.
- **Concurrent tabs:** Two tabs open, one at `/pricing`, one at `/studio`. Subscribe in tab 1. Verify tab 2 picks up the new plan within 60s.
- **Subscription expiry mid-cycle:** Simulate Stripe subscription going `past_due`. Verify Convex denies paid mutations once JWT reflects status change.
- **Unknown plan slug fallback:** Mock identity with `pla: "u:legacy_tier"` (a slug not in `PLAN_CONFIG`). Assert enforcement helpers throw "No active subscription" and emit a warning. This catches Clerk-dashboard/code drift at runtime.
- **Credit quota exhaustion (Basic):** mock Basic user, call `generateVariations` 100 times across the current UTC month. Assert first 100 succeed, 101st throws the quota error. Reset mock clock to the 1st of next month, assert the next call succeeds.
- **Credit quota exhaustion (Pro):** same pattern, threshold 500.
- **Month-boundary counting:** call a generation mutation at Oct 31 23:59:58 UTC (credit use row inserted with Oct timestamp). Fast-forward to Nov 1 00:00:10 and verify the Oct mutation doesn't count against Nov's quota.
- **Retries consume credits:** call `retryGeneration` explicitly and assert a new `billingEvents` usage row is inserted. Repeat 100 times for Basic and assert 101st retry is blocked.
- **`BILLING_ENABLED=false` bypasses quota:** set the env var, assert unlimited `generateVariations` succeed even past 500.
- **No-plan user:** mock identity with no `pla` claim (signed in but unsubscribed). Assert all generation mutations throw with the `/pricing`-redirect error. Free-tier-less v1 means this path must always lead to the pricing page.

#### Observability
- Log plan/capability claim values on every `requireCapability` call (debug level, disable in production).
- `billingEvents` table provides queryable audit trail. Denials are always recorded; `context` field distinguishes enforcement vs checkout vs future webhook/usage sources.
- Add Convex dashboard monitoring for increased error rates on billing-gated mutations after Clerk SDK upgrades.
- When claim-version bumps (e.g., `extractBillingClaims` gains a `v2` branch), add a metric counting calls per version so the old format can be retired safely.

---

## Plan Context

### Current State
- ProdSnap uses `@clerk/react` v6.4.2 for auth with `ConvexProviderWithClerk`.
- Convex backend gates mutations in `convex/products.ts` and `convex/productImages.ts` via `requireAuth()`.
- **Auth gap:** `convex/studio.ts` has 5 public mutations (`createRun`, `updateRunAnalysis`, `reanalyze`, `submitRun`, `retryGeneration`) -- NONE call `requireAuth()`.
- **Auth gap:** `convex/board.ts` has 7 public mutations (`createColumn`, `createItem`, `deleteItem`, `updateItem`, `updateColumn`, `updateBoard`, `deleteColumn`) -- NONE call `requireAuth()`.
- No billing, no subscription tiers, no feature gating.
- `@clerk/react` already exports `PricingTable` and `Show` components.
- No `convex/http.ts` exists yet (relevant for future webhook endpoint).

### Target State
- Free + Pro + Business tiers defined in Clerk Dashboard, mirrored in `convex/lib/billing/planConfig.ts`.
- Fully custom `/pricing`, `/checkout`, and `/account/billing` routes (Mantine UI, Clerk experimental hooks) with post-checkout JWT refresh interstitial.
- Fully custom `/pricing`, `/checkout`, `/account/billing` routes built with `usePlans()` + `<CheckoutProvider>` + `useCheckout()` + `usePaymentElement()` + `<PaymentElement/>` from `@clerk/react/experimental`. Mantine theming end-to-end. Clerk's `<PricingTable/>` not used.
- UI capability gating via `<Show when={{feature: CAPABILITIES.X}}>` — slugs imported from the central registry, never inline strings.
- Convex-side enforcement via `requireCapability()` / `requireProductLimit()` helpers backed by the `BillingProvider` interface, reading JWT claims through a versioned `extractBillingClaims`, with `billingEvents` audit log (schema includes forward-compat `units` / `metadata` / `context` fields for future metering).
- All public mutations across all files protected by `requireAuth()` at minimum.
- Dual kill switch: `BILLING_ENABLED` (Convex env, runtime) + `VITE_BILLING_ENABLED` (client, build-time).
- Version-pinned Clerk packages.

---

## Work Objectives

### Guardrails

**Must Have:**
- Server-side (Convex) enforcement of plan limits on all generation mutations
- `requireAuth()` on ALL public mutations (pre-existing gap fix)
- **Capability registry as single source of truth** for slugs (`convex/lib/billing/capabilities.ts`); no raw strings in mutation code
- **Declarative plan config** (`convex/lib/billing/planConfig.ts`) for plan → capabilities + scalar limits; no boolean-encoded limits
- **Pluggable `BillingProvider` interface** — current impl `ClerkBillingProvider`, swappable without touching mutation code
- **Versioned JWT claim extractor** (`extractBillingClaims`) insulated from Clerk beta churn
- Version pinning for `@clerk/react` AND `@clerk/clerk-js` to exact versions (experimental billing hooks live in `clerk-js`)
- **Clerk experimental-API usage confined to `src/components/billing/**`** — CI grep blocks imports of `@clerk/react/experimental` outside that folder
- **Mantine-themed Stripe Elements appearance** (`src/lib/billing/stripeAppearance.ts`) so the PCI-required card iframe matches brand colors
- Dual kill switch: `BILLING_ENABLED` (Convex runtime) + `VITE_BILLING_ENABLED` (client build-time)
- Append-only `billingEvents` audit log with forward-compat fields (`units`, `metadata`, `context`)
- Post-checkout JWT refresh mechanism

**Must NOT Have:**
- Webhook endpoint (not needed for v1 — JWT claims are sufficient)
- Custom Stripe integration (Clerk handles Stripe entirely)
- **Credit pack / top-up purchases** (one-time Stripe Checkout outside Clerk Billing) — future scope; plan is designed to accommodate via `billingEvents` with `context: 'usage'` and a new ledger table when needed
- **Credit rollover between months** — v1 uses hard monthly quota with calendar-month reset; no accumulation across months
- **Subscription-anchor billing periods** (resets per user's signup date) — v1 uses calendar month UTC for everyone; switch when webhooks land
- **Free tier** — v1 requires a paid plan to use paid features. Signed-in users without a subscription are redirected to `/pricing`

---

## Task Flow

### Step 0: Spike -- Validate JWT Claims in Convex (BLOCKING)

**Goal:** Confirm that Clerk's `pla` and `fea` JWT claims are accessible via `ctx.auth.getUserIdentity()` in Convex functions.

**Actions:**
1. In Clerk Dashboard (dev instance), enable Billing and create a test plan `test-spike` with a feature `spike-feature`.
2. Use the Clerk development gateway (no Stripe account needed).
3. Subscribe the dev user to `test-spike`.
4. In a temporary Convex query, log the full `UserIdentity` object:
   ```typescript
   // convex/billing-spike.ts (TEMPORARY -- delete after spike)
   export const inspectIdentity = query({
     args: {},
     handler: async (ctx) => {
       const identity = await ctx.auth.getUserIdentity();
       console.log("Full identity:", JSON.stringify(identity));
       return identity;
     },
   });
   ```
5. Call this query from the running app and inspect the Convex logs.
6. **If `pla` and `fea` are present:** Proceed with Option C.
7. **If NOT present:** Create a Clerk Custom JWT Template (name: `convex`, audience: `convex`) that adds `pla` and `fea` claims. Re-test.

**Additional spike sub-check (custom UI path):**
8. In a temporary client-side file, verify `@clerk/react/experimental` exports the billing hooks: `useCheckout`, `usePaymentElement`, `usePlans`, `CheckoutProvider`, `PaymentElement`, `PaymentElementProvider`. A 10-line smoke test (console.log the hook existence) is sufficient.
9. If any hook is missing or the import path has changed, document the actual export shape and update Step 4 accordingly. If the hooks are entirely unavailable in `@clerk/react/experimental`, fall back to one of: (a) add `@clerk/tanstack-react-start` alongside `@clerk/react` and import from there, or (b) temporarily use `<PricingTable />` until the custom-UI APIs ship for `@clerk/react`.

**Acceptance Criteria:**
- A Convex query can read the user's active plan slug and feature list from the identity object.
- The exact field paths are documented (e.g., `identity.pla`, `identity.fea`, or within `identity.publicMetadata`).
- `@clerk/react/experimental` is confirmed to export `useCheckout`, `usePaymentElement`, `usePlans`, `CheckoutProvider`, `PaymentElement`, `PaymentElementProvider`. Any deviations documented in `open-questions.md`.
- `convex/billing-spike.ts` is deleted after spike completes. CI grep check ensures `inspectIdentity` does not appear in any committed file after Step 1 merges.

---

### Step 1: Pre-Billing Security Patch -- Add `requireAuth()` to All Unguarded Mutations

**Goal:** Close pre-existing authentication gaps BEFORE layering billing gates. This is a security prerequisite, not a billing feature.

**Actions:**

1. **`convex/studio.ts`** -- Add `requireAuth()` (imported from a shared location or defined locally) to all 5 public mutations:

   | Mutation | Current Auth | Action |
   |----------|-------------|--------|
   | `createRun` | NONE | Add `requireAuth()`, store `userId` on run |
   | `updateRunAnalysis` | NONE | Add `requireAuth()`, verify run ownership |
   | `reanalyze` | NONE | Add `requireAuth()`, verify run ownership |
   | `submitRun` | NONE | Add `requireAuth()`, verify run ownership |
   | `retryGeneration` | NONE | Add `requireAuth()`, verify generation ownership |

2. **`convex/board.ts`** -- Mark as **out-of-scope for billing** (board is not a billable feature). However, the pre-existing auth gap is a security issue. Add `requireAuth()` to all 7 public mutations:

   | Mutation | Action |
   |----------|--------|
   | `createColumn` | Add `requireAuth()` |
   | `createItem` | Add `requireAuth()` |
   | `deleteItem` | Add `requireAuth()` |
   | `updateItem` | Add `requireAuth()` |
   | `updateColumn` | Add `requireAuth()` |
   | `updateBoard` | Add `requireAuth()` |
   | `deleteColumn` | Add `requireAuth()` |

   **Note:** Board mutations are explicitly out-of-scope for billing gates. They need auth but not feature gates.

**Acceptance Criteria:**
- Every public mutation in `convex/studio.ts` and `convex/board.ts` calls `requireAuth()`.
- Unauthenticated calls to any of these mutations throw "Not authenticated".
- Existing functionality is not broken (manual smoke test of studio flow and board).
- This step merges as its own PR before billing work begins.

---

### Step 2: Clerk Dashboard Configuration

**Goal:** Define production-ready plans, features, and pricing in the Clerk Dashboard.

**Actions:**

1. **Enable Billing** at `https://dashboard.clerk.com/~/billing/settings`
   - Dev instance: Use "Clerk development gateway" (shared test Stripe)
   - Production: Connect a real Stripe account (separate from dev)

2. **Create Plans** at `https://dashboard.clerk.com/~/billing/plans` (Plans for Users tab). No Free tier in v1 — every authenticated user must be on Basic or Pro to use paid features.

   | Plan Slug | Display Name | Monthly Price | Annual Price | Product Limit | Monthly Credits | Is Default |
   |-----------|-------------|---------------|--------------|---------------|-----------------|------------|
   | `basic`   | Basic       | $49.99/mo     | $39.99/mo    | 5             | 100             | Yes        |
   | `pro`     | Pro         | $129.99/mo    | $99.00/mo    | 20            | 500             | No         |

   Product limits and monthly credit quotas are NOT configured in Clerk — they live in `PLAN_CONFIG` (Step 3). Clerk only knows plan slug + price + capabilities.

   **Unit economics reference** (full-cap usage, assuming $0.10/generation API cost, 3.6% + $0.30 payment fees):
   - Basic monthly: $49.99 → ~$37.89 gross margin (~76%)
   - Basic annual: $39.99 → ~$28.52 gross margin (~71%)
   - Pro monthly: $129.99 → ~$75.01 gross margin (~58%)
   - Pro annual: $99.00 → ~$45.41 gross margin (~46%)

   Pro annual at full cap is tight (46%). Bet is on <50% cap utilization average. Monitor actual utilization via `billingEvents` queries post-launch; adjust quota or price if utilization skews high.

3. **Create Capabilities (Clerk Features)** and assign to plans. In v1 both plans get every capability — differentiation is volume-only (product limit + monthly credits). Capability gates still exist because (a) they document *what* a paid user is paying for, and (b) future tiers may restrict capabilities.

   | Capability Slug (= Clerk Feature) | Description                          | Basic | Pro |
   |----------------------------------|--------------------------------------|-------|-----|
   | `advanced-templates`             | Access to premium template library   | Yes   | Yes |
   | `hd-output`                      | High-resolution output (2048px)      | Yes   | Yes |
   | `variations`                     | Generate variations from outputs     | Yes   | Yes |
   | `batch-generation`               | Generate up to 4 variations/template | Yes   | Yes |
   | `background-removal`             | AI background removal                | Yes   | Yes |

   **Product limits and monthly credits are NOT encoded as features.** They live as scalars in `PLAN_CONFIG` (Step 3). The Convex `requireProductLimit()` reads `PLAN_CONFIG[plan].productLimit`; `requireCredit()` reads `PLAN_CONFIG[plan].monthlyCredits`.

   **Every capability slug above MUST match a `CAPABILITIES.*` entry in `convex/lib/billing/capabilities.ts`.** If the Clerk dashboard drifts from the registry, `billing-gates.test.ts` fails.

   **Unauthenticated / unsubscribed users** — no Free tier means a signed-in user with no active subscription has no plan claim. The enforcement helpers must handle this: `requireCapability()` and `requireCredit()` throw "No active subscription — choose a plan at /pricing" when `plan` is undefined or not in `PLAN_CONFIG`. UI routes that need billing (studio, generation flows) should redirect to `/pricing` for unsubscribed users.

4. **Mark all plans and features as "Publicly available"** so they are returned by `usePlans({ for: 'user' })` and rendered by the custom `/pricing` page.

**Acceptance Criteria:**
- Three plans visible in Clerk Dashboard with correct pricing.
- Features assigned to correct plans.
- Dev user can subscribe to a plan via Clerk Dashboard (manual test).

---

### Step 3: Convex Billing Helpers + Enforcement + Audit Log

**Goal:** Create server-side helpers that read JWT claims, enforce capability access on all relevant mutations, and log gate decisions to an audit table. Everything here is designed for extension — capabilities, plans, and limits are data, not code.

**Module layout** (all files live under `convex/lib/billing/` so they can be imported by both Convex functions and — via a Vite alias — the client; Convex module resolution does not allow `src/` imports, so `convex/` is the single source of truth):

```
convex/lib/billing/
├── capabilities.ts    # Central capability registry (the ONLY place slugs are declared)
├── planConfig.ts      # Declarative plan → { productLimit, capabilities[] } mapping
├── claims.ts          # Versioned JWT claim extractor (insulated from Clerk beta churn)
├── provider.ts        # BillingProvider interface + ClerkBillingProvider implementation
├── index.ts           # Public API: getBillingContext, requireCapability, requireProductLimit
└── provider.clerk.ts  # Clerk-specific implementation (only file that knows about Clerk)
```

**Actions:**

1. **Add `billingEvents` table to `convex/schema.ts`** with forward-compatible fields:
   ```ts
   billingEvents: defineTable({
     userId: v.string(),
     mutationName: v.string(),
     capability: v.optional(v.string()),     // which capability was checked (normalized slug)
     allowed: v.boolean(),
     claimedPlan: v.optional(v.string()),
     timestamp: v.number(),
     // Forward-compat: populated later when metered billing / webhooks land.
     units: v.optional(v.number()),          // usage units consumed (e.g., 1 generation)
     metadata: v.optional(v.any()),          // arbitrary structured context
     context: v.optional(v.union(
       v.literal('enforcement'),             // emitted by requireCapability
       v.literal('checkout'),                // emitted by post-checkout flow
       v.literal('webhook'),                 // emitted by future webhook handler
       v.literal('usage'),                   // emitted by future metering
     )),
   })
     .index('by_userId', ['userId'])
     .index('by_timestamp', ['timestamp'])
     .index('by_capability', ['capability'])
   ```
   Populating the forward-compat fields is a pure additive change — no schema migration when metering lands.

2. **Create `convex/lib/billing/capabilities.ts`** — the central registry. Every capability slug in the codebase and in the Clerk dashboard must have a corresponding entry here.
   ```ts
   export const CAPABILITIES = {
     GENERATE_VARIATIONS: 'variations',
     REMOVE_BACKGROUND: 'background-removal',
     HD_OUTPUT: 'hd-output',
     ADVANCED_TEMPLATES: 'advanced-templates',
     BATCH_GENERATION: 'batch-generation',
   } as const
   export type Capability = typeof CAPABILITIES[keyof typeof CAPABILITIES]
   ```
   Mutation code calls `requireCapability(ctx, CAPABILITIES.GENERATE_VARIATIONS)` — TypeScript rejects invented strings at compile time. The client imports the same module (via a Vite path alias to `convex/lib/billing/capabilities.ts`) to use the same names in `<Show>` gating.

3. **Create `convex/lib/billing/planConfig.ts`** — declarative plan config, the *app's* view of plans:
   ```ts
   import { CAPABILITIES, Capability } from './capabilities'

   export type PlanConfig = {
     slug: string
     productLimit: number                 // Infinity reserved for future tiers
     monthlyCredits: number               // generations per calendar month; hard cap, resets 1st UTC
     capabilities: readonly Capability[]
     // Extend later: prioritySupport, concurrentGenerations, creditPackEligible, etc.
   }

   const ALL_CAPABILITIES = [
     CAPABILITIES.GENERATE_VARIATIONS,
     CAPABILITIES.REMOVE_BACKGROUND,
     CAPABILITIES.HD_OUTPUT,
     CAPABILITIES.ADVANCED_TEMPLATES,
     CAPABILITIES.BATCH_GENERATION,
   ] as const

   export const PLAN_CONFIG: Record<string, PlanConfig> = {
     basic: {
       slug: 'basic',
       productLimit: 5,
       monthlyCredits: 100,
       capabilities: ALL_CAPABILITIES,
     },
     pro: {
       slug: 'pro',
       productLimit: 20,
       monthlyCredits: 500,
       capabilities: ALL_CAPABILITIES,
     },
   }
   ```
   **Sync constraint (documented):** `PLAN_CONFIG` capabilities and the Clerk dashboard feature assignments MUST agree. Clerk remains source of truth for *which* capability a user has (read from the JWT `fea` claim). `PLAN_CONFIG` is the source of truth for scalar fields (`productLimit`, `monthlyCredits`) that Clerk cannot express as boolean features. If they drift, `billing-gates.test.ts` catches it.

   **Design for evolution:** both plans having the same capabilities today is a v1 choice, not a permanent one. When a future tier (e.g., `studio`) restricts a capability or a higher one (e.g., `agency`) adds one, those are one-line changes to `PLAN_CONFIG` — mutation code and UI gating don't move.

4. **Create `convex/lib/billing/claims.ts`** — versioned JWT claim extractor:
   ```ts
   import type { UserIdentity } from 'convex/server'

   export type BillingClaims = { plan: string; capabilities: string[] }

   export function extractBillingClaims(
     identity: UserIdentity,
     version: 'v1' = 'v1',
   ): BillingClaims {
     if (version === 'v1') return extractV1(identity)
     throw new Error(`Unknown claim version: ${version}`)
   }

   // v1: Clerk session token format (as of Clerk Billing beta, 2026).
   // pla: "u:plan-slug" (user plan) or "o:plan-slug" (org plan)
   // fea: "u:cap,o:cap,..." comma-separated
   function extractV1(identity: UserIdentity): BillingClaims {
     const raw = identity as any
     const plan = (raw.pla as string | undefined)?.replace(/^[uo]:/, '') ?? 'free'
     const capabilities = (raw.fea as string | undefined)
       ?.split(',').map((c) => c.replace(/^[uo]:/, '')).filter(Boolean) ?? []
     return { plan, capabilities }
   }
   ```
   If Clerk changes the claim format (beta risk), add an `extractV2` branch. Rest of the system depends only on the normalized `BillingClaims` shape. Unit tests lock in each version.

5. **Create `convex/lib/billing/provider.ts`** — pluggable provider interface:
   ```ts
   import type { QueryCtx, MutationCtx } from '../../_generated/server'
   import type { BillingClaims } from './claims'

   export type BillingContext = {
     userId: string
     plan: string
     capabilities: string[]
     hasCapability: (slug: string) => boolean
   }

   export interface BillingProvider {
     getContext(ctx: QueryCtx | MutationCtx): Promise<BillingContext | null>
   }
   ```
   Create `provider.clerk.ts` that implements this using `ctx.auth.getUserIdentity()` + `extractBillingClaims`. Then in `index.ts`, export a single module-level instance:
   ```ts
   import { ClerkBillingProvider } from './provider.clerk'
   export const billingProvider: BillingProvider = new ClerkBillingProvider()
   ```
   Swapping providers (e.g., Clerk Billing → Stripe direct) is a one-line change in `index.ts`. Mutation code never imports `provider.clerk` directly.

6. **Create `convex/lib/billing/index.ts`** — the public API that mutations call:
   - `getBillingContext(ctx)`: delegates to `billingProvider.getContext(ctx)`. Checks `process.env.BILLING_ENABLED` first — if not `'true'`, returns a context with `hasCapability: () => true` and bypasses quota (fail-open, the kill switch).
   - `requireCapability(ctx, capability: Capability, mutationName: string)`: gets context, checks capability, appends to `billingEvents` on denial (context: `'enforcement'`), throws on miss. Throws "No active subscription — choose a plan at /pricing" when user has no plan.
   - `requireProductLimit(ctx, userId, mutationName)`: reads `PLAN_CONFIG[context.plan].productLimit`, counts existing products, throws on over-limit with the downgrade-aware message.
   - `requireCredit(ctx, userId, mutationName)`: **monthly credit quota enforcement.** Reads `PLAN_CONFIG[context.plan].monthlyCredits`. Counts `billingEvents` rows with `context: 'usage'`, `userId` matching, `timestamp >= startOfMonthUtc()`. If count >= monthlyCredits, throws: `"You have used all N credits for this month. Credits reset on the 1st."` On success, the caller is expected to insert a `billingEvents` row with `context: 'usage'`, `units: 1`, `mutationName`, `capability` = the generation kind — this is done by a companion helper `recordCreditUse(ctx, userId, mutationName, capability)` which is always called immediately after the mutation's business logic begins (before the API call, so that retries/failures still count — see counting-rule note below).

   **Counting rule for retries and failures:** Every invocation of a generation mutation consumes one credit, regardless of whether the downstream AI API call succeeds. This is intentional — failed generations still incur API cost. Users are informed on the pricing page and in the generation UI ("Not every generation is perfect — each attempt uses one credit"). `recordCreditUse` is called BEFORE the workflow schedules the API call, so an errored workflow still leaves the credit-use row in place.

   **Month-boundary edge case:** credit counting uses the `billingEvents.timestamp` field (when the row was inserted). A mutation called at Oct 31 23:59:59 UTC counts against October; its downstream workflow completing Nov 1 00:00:10 does not get re-counted. Acceptable loss of precision; flagged in test plan.

   **Calendar month reset (v1):** `startOfMonthUtc()` returns the Unix timestamp for the first of the current UTC month at 00:00. No subscription-anchor logic. Users who subscribe mid-month get full monthly credits immediately; their next reset is on the 1st. Documented on the pricing page: "Credits reset on the 1st of each month (UTC)." Follow-up: switch to subscription anchor once webhooks are added.

7. **Downgrade behavior for product limits** (unchanged from Iteration 1):
   - Existing products remain accessible (read + edit) indefinitely after downgrade.
   - `createProduct` throws: `"You have N products but your plan allows M. Archive products or upgrade."`
   - UI shows banner on `studio.index` (see Step 4).

8. **Add enforcement to existing mutations** in `convex/products.ts`. Every generation-performing mutation calls `requireCapability` + `requireCredit` + `recordCreditUse` in that order:

   | Mutation | Gates (in order) |
   |----------|------------------|
   | `createProduct` | `requireProductLimit(ctx, userId, 'createProduct')` |
   | `generateFromProduct` | `requireCapability(CAPABILITIES.GENERATE_VARIATIONS)` in variation mode; `requireCapability(CAPABILITIES.BATCH_GENERATION)` when variations>2; `requireCredit()` for each variation counted; `recordCreditUse()` per variation before scheduling |
   | `generateVariations` | `requireCapability(CAPABILITIES.GENERATE_VARIATIONS)`; `requireCredit()` per variation; `recordCreditUse()` per variation |
   | `removeProductBackground` | `requireCapability(CAPABILITIES.REMOVE_BACKGROUND)` — **does not consume credits** (v1 scope: credits = generations only; background removal is included unlimited in both tiers. See ADR follow-up for future change.) |

9. **Add enforcement to `convex/studio.ts`** (all mutations have `requireAuth()` from Step 1):

   | Mutation | Billing Gate |
   |----------|-------------|
   | `createRun` | None (creating a run is free) |
   | `updateRunAnalysis` | None |
   | `reanalyze` | None |
   | `submitRun` | Same as `generateFromProduct` — capability + credit per generation produced |
   | `retryGeneration` | `requireCredit()` + `recordCreditUse()` — retries count per the counting rule above |

10. **Add enforcement to `convex/productImages.ts`:**

    | Mutation | Gate |
    |----------|------|
    | `removeImageBackground` | `requireCapability(CAPABILITIES.REMOVE_BACKGROUND)` — no credit consumption in v1 |
    | `addProductImage` / `setPrimaryImage` / `deleteProductImage` | None |

11. **Billing gate coverage test** — `tests/billing-gates.test.ts`:
    - Enumerates all public mutations in `convex/products.ts`, `convex/studio.ts`, `convex/productImages.ts`.
    - For each billing-gated mutation, calls with mock identity `pla: "u:free"`, `fea: ""` — asserts throw.
    - For each non-gated mutation, asserts no throw with free identity.
    - Asserts that every capability in `CAPABILITIES` appears in at least one `PLAN_CONFIG` plan (no dangling registry entries).
    - Asserts that every capability referenced in `PLAN_CONFIG` is declared in `CAPABILITIES` (no plan-config typos).
    - CI fails if new public mutations are added without being categorized in this test.

**Acceptance Criteria:**
- Capability registry, plan config, and provider modules exist at the paths above.
- `requireCapability()` accepts only `Capability`-typed arguments (TypeScript rejects raw strings at compile time).
- `requireCapability()` short-circuits to allow when `BILLING_ENABLED !== 'true'`.
- `requireCredit()` and `recordCreditUse()` enforce the monthly quota correctly against `billingEvents` rows with `context: 'usage'` and `timestamp >= startOfMonthUtc()`.
- `requireProductLimit()` reads scalar limit from `PLAN_CONFIG`, no boolean feature encoding.
- `billingEvents` schema includes `units`, `metadata`, `context` as fields; usage rows populated by `recordCreditUse`.
- `extractBillingClaims` has unit tests covering v1 format with and without `pla`/`fea` present.
- All generation mutations call `requireCapability` + `requireCredit` + `recordCreditUse` in that order before scheduling downstream API work.
- Users with no plan (shouldn't happen post-launch since no Free tier, but handled) get a clear "No active subscription" error redirecting to `/pricing`.
- Basic users hit the 100/month cap and get the reset-on-1st message; Pro users hit at 500/month.
- `tests/billing-gates.test.ts` passes and covers registry/config consistency, mutation categorization, and quota enforcement.

---

### Step 4: Custom Pricing / Checkout / Billing UI + Feature Gating + Post-Checkout Refresh

**Goal:** Build fully custom pricing, checkout, and subscription management surfaces using Clerk's experimental hooks (NOT `<PricingTable/>`). Gate UI by capability. Handle post-checkout JWT refresh.

**File layout** — isolate Clerk experimental-API usage so a breaking change is contained:

```
src/
├── routes/
│   ├── pricing.tsx                 # Custom pricing page (uses usePlans)
│   ├── checkout.tsx                # Custom checkout page (CheckoutProvider stack)
│   └── account/
│       └── billing.tsx             # Custom subscription management
├── components/billing/             # ALL Clerk experimental imports confined here
│   ├── PlanCard.tsx
│   ├── CheckoutForm.tsx
│   ├── CurrentSubscriptionCard.tsx
│   ├── CreditsIndicator.tsx
│   └── PostCheckoutInterstitial.tsx
└── lib/billing/
    └── stripeAppearance.ts         # Mantine → Stripe Elements appearance token map
```

**Actions:**

1. **Build `src/routes/pricing.tsx` — custom pricing page:**
   - Use `usePlans({ for: 'user' })` from `@clerk/react/experimental` to fetch live plan data (name, price, period, features) — never hardcode prices in the UI; they come from Clerk.
   - Render with Mantine `Card` components in a `SimpleGrid`. Each card shows: plan name, price (monthly / annual toggle), monthly credit quota from `PLAN_CONFIG`, product limit from `PLAN_CONFIG`, capability checklist, CTA button.
   - Highlight the current plan if the user is subscribed (use `useAuth()` + `has({plan: 'basic' | 'pro'})`).
   - CTA button: `<Button component={Link} to="/checkout" search={{planId, period}}>Subscribe</Button>` — navigates to checkout route with plan info in search params.
   - Mobile-responsive via Mantine breakpoints.
   - Marketing copy, FAQ section, and money-back guarantee text are standard Mantine components, fully owned by us.

2. **Build `src/routes/checkout.tsx` — custom checkout page:**
   - Read `planId` and `period` from route search params.
   - Wrap with `<CheckoutProvider for="user" planId={planId} planPeriod={period}>` from `@clerk/react/experimental`.
   - Render `<CheckoutForm />` from `src/components/billing/CheckoutForm.tsx` which uses:
     - `useCheckout()` for session state (`checkout.status`, `checkout.totals`, `checkout.plan`, `checkout.start()`, `checkout.confirm()`, `checkout.finalize()`, `errors`, `fetchStatus`)
     - `usePaymentElement()` for card form control (`submit()`, `isFormReady`)
     - `<PaymentElementProvider checkout={checkout}>` wrapper
     - `<PaymentElement />` rendering the Stripe-owned card input
   - Stripe Elements `appearance` prop is populated from `src/lib/billing/stripeAppearance.ts`, which maps Mantine theme tokens (colors, fonts, radius) to Stripe's appearance API. This is the only way to brand the card iframe; everything around it is Mantine.
   - Order summary (left/top): Mantine `Card` showing plan name, price, period, total — sourced from `checkout.plan` and `checkout.totals`.
   - Payment form (right/bottom): `<PaymentElement />` + submit button + inline error list from `errors.global`.
   - Loading states: use Mantine `Loader` for `fetchStatus === 'fetching'`; disable submit while processing.
   - On `checkout.status === 'needs_initialization'`, show a "Continue to payment" button that calls `checkout.start()`.
   - On submit flow (per Clerk's reference example):
     1. `const { data, error } = await submit()` — ignore Stripe validation errors
     2. `const { error: confirmError } = await checkout.confirm(data)`
     3. `await checkout.finalize({ navigate: ({ decorateUrl }) => router.navigate({ to: decorateUrl('/') }) })` — but intercept the navigation to first show the post-checkout interstitial (see #4).
   - Any error: surface via Mantine `Alert` with error category classification (payment declined, card invalid, network, unknown).

3. **Build `src/routes/account/billing.tsx` — custom subscription management:**
   - Displays current plan, billing period, next renewal, payment method (masked last 4 digits), plus actions: change plan, update payment method, cancel.
   - "Change plan" → redirect to `/pricing` (same flow as initial subscribe).
   - "Update payment method" → use Clerk's custom flow for [adding a new payment method](https://clerk.com/docs/guides/development/custom-flows/billing/add-new-payment-method) (similar pattern to checkout).
   - "Cancel subscription" → use Clerk's cancel subscription API (to be documented in Step 0 spike); show confirmation modal with "you'll keep access until {periodEnd}".
   - Also shows billing history — list of recent invoices. Clerk Billing surfaces these via `useInvoices` or similar hook (confirm in spike).

4. **Post-checkout interstitial** (`src/components/billing/PostCheckoutInterstitial.tsx`):
   - Rendered via a controlled `Modal` (Mantine) that appears on successful `checkout.confirm()` before `finalize()` navigation completes.
   - Calls `clerk.session?.reload()` immediately to force JWT refresh.
   - Polls `getBillingStatus` Convex query every 500ms, up to 10s.
   - When the returned `plan` matches the just-subscribed plan, close interstitial and navigate to `/studio`.
   - If 10s elapses without plan showing: show "Still activating — try refreshing" with a `Button` that calls `window.location.reload()`.

5. **Update `src/routes/__root.tsx`:**
   - Add `<NavLink to="/pricing">Pricing</NavLink>` in desktop nav between Home and Studio, wrapped behind `VITE_BILLING_ENABLED` check.
   - Add corresponding `<MobileNavLink>` in the drawer.
   - Replace reliance on `<UserButton />`'s automatic billing management surface — instead the nav includes a "Billing" link to `/account/billing` for signed-in users.

6. **Gate UI in `src/routes/studio.$productId.tsx`:**
   - Import `CAPABILITIES` from the registry.
   - Wrap variation controls with `<Show when={{feature: CAPABILITIES.GENERATE_VARIATIONS}}>`.
   - Wrap background removal with `<Show when={{feature: CAPABILITIES.REMOVE_BACKGROUND}}>`.
   - Fallback for gated features: a Mantine `Paper` upgrade prompt linking to `/pricing` (not raw text).
   - Template selection: premium templates get a `<Show when={{feature: CAPABILITIES.ADVANCED_TEMPLATES}} fallback={<LockedOverlay />}>` wrapper with a subtle lock icon + "Upgrade" hover.
   - **Never inline capability slugs** — adding a gate means importing from `CAPABILITIES`, not typing `'variations'`. ESLint rule (future): ban string literals as the `feature` prop value on `<Show>`.

7. **Gate UI in `src/routes/studio.index.tsx`:**
   - Show **product count indicator** (e.g., "2/5 products" for Basic, "8/20" for Pro).
   - Show **credits indicator** via `<CreditsIndicator />` component — fetched via a Convex query `getBillingStatus` returning `{plan, productCount, productLimit, creditsUsed, creditsTotal, resetsOn}`. Rendered in the header/sidebar, always visible in studio.
   - When credits ≤ 10% remaining: soft Mantine `Alert` banner "Low on credits — N left this month. [Upgrade]".
   - When credits exhausted: disable all generation buttons; show `Alert` "You have used all N credits for this month. They reset on [date]. [Upgrade to Pro]." Upgrade link navigates to `/pricing` with the Pro card pre-selected.
   - When over product limit: "Over product limit — create disabled. [Archive products] or [Upgrade]." Disable create button.

8. **`src/lib/billing/stripeAppearance.ts`** — Mantine → Stripe Elements appearance mapping:
   - Exports a function `stripeAppearance(theme: MantineTheme)` that returns Stripe's Elements appearance object with colors, fonts, border radius, spacing derived from Mantine tokens.
   - Supports both light and dark color schemes (the app is currently dark-only via `forceColorScheme="dark"`, but this keeps the door open).
   - Used only by `<PaymentElementProvider>` / `<PaymentElement>` in `CheckoutForm`.

**Acceptance Criteria:**
- `/pricing` renders custom Mantine UI populated from `usePlans()`. No `<PricingTable/>` import anywhere in the codebase.
- `/checkout?planId=X&period=month` renders the custom CheckoutForm with Stripe Elements appearance matching the Mantine brand palette.
- Checkout flow: submit card → confirm → interstitial → JWT refresh → redirect to `/studio`. Sad paths (declined, network error, stale JWT) each have explicit UI states.
- `/account/billing` shows current plan, payment method, next renewal, cancel/change actions. Fully custom Mantine UI.
- All Clerk experimental-API usage is confined to `src/components/billing/**`. A grep for `@clerk/react/experimental` outside that folder fails CI.
- Paid features show upgrade prompts for users without the capability.
- Nav includes "Pricing" and "Billing" links (only when `VITE_BILLING_ENABLED` is true).
- `stripeAppearance()` produces valid Stripe Elements appearance config that visually matches Mantine brand colors.

---

### Step 5: Environment Config + Version Pinning

**Goal:** Configure dual kill switches and pin package versions for stability.

**Actions:**

1. **Pin `@clerk/react` AND `@clerk/clerk-js` to exact versions** in `package.json`:
   ```json
   "@clerk/react": "6.4.2",
   "@clerk/clerk-js": "x.y.z"   // determined at install time; match what @clerk/react resolves
   ```
   (Remove the `^` prefix on both; pin exact.) `@clerk/clerk-js` is the underlying runtime where experimental billing hooks (`useCheckout`, `usePaymentElement`, etc.) actually live. Pinning only `@clerk/react` is insufficient — a point-release to `@clerk/clerk-js` could still change hook behavior. Treat both packages as a locked unit; upgrade together in dedicated PRs with full E2E billing regression.

2. **Client-side kill switch -- `VITE_BILLING_ENABLED`:**
   - Build-time variable (Vite string-replaces it). Set in `.env` and Netlify dashboard.
   - When `false`: hides the custom `/pricing`, `/checkout`, and `/account/billing` routes, `<Show>` gating, and the nav links. Affected routes show a "Billing temporarily unavailable" interstitial. All other UI acts as if billing does not exist.
   - Requires a rebuild + redeploy to toggle.

3. **Server-side kill switch -- `BILLING_ENABLED`:**
   - Convex environment variable, set in Convex dashboard. Runtime toggle -- no rebuild needed.
   - When not `'true'`: `requireCapability()` and `requireProductLimit()` short-circuit to allow (graceful degradation, fail-open).
   - This is the **primary rollback mechanism** -- instant effect on all Convex functions.

4. **No new Clerk env vars needed.** The existing `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `CLERK_JWT_ISSUER_DOMAIN` are sufficient. Billing is enabled via the Clerk Dashboard, not via env vars.

5. **Netlify env vars** (for production deployment):
   - Ensure `VITE_BILLING_ENABLED=true` is set in Netlify dashboard.
   - No additional Netlify config needed (no webhook endpoint in v1).

**Acceptance Criteria:**
- `@clerk/react` is pinned to exact version (no `^` or `~`).
- `VITE_BILLING_ENABLED=false` hides all billing UI (requires rebuild).
- `BILLING_ENABLED` not set to `'true'` in Convex dashboard causes all feature gates to pass (instant, no rebuild).
- Both kill switches can be toggled independently.

---

### Step 6: Rollout + Cutover Plan

**Goal:** Safe, staged deployment from dev to production.

**Phase 1 -- Development (Clerk dev instance)**
1. Complete Steps 0-5 against dev Clerk instance.
2. Use Clerk development gateway (shared test Stripe).
3. Test with Stripe test cards:
   - `4242424242424242` -- successful payment
   - `4000000000000002` -- declined
   - `4000000000000341` -- attaches but fails on charge
4. Verify all E2E test scenarios pass.

**Phase 2 -- Staging (Clerk production instance, Stripe test mode)**
1. Create a separate Clerk production instance (or use the existing one in a staging environment).
2. Connect a real Stripe account in **test mode**.
3. Recreate plans and features with same slugs.
4. Deploy to a Netlify preview branch with `VITE_BILLING_ENABLED=true`.
5. Full regression test of auth + billing flows.

**Phase 3 -- Production**

Important: v1 has no Free tier, so existing users without a subscription will be blocked from paid features the instant `BILLING_ENABLED=true` flips. You have two reasonable options — pick one before cutover:

- **Option X (recommended, customer-friendly): complimentary month of Basic.** Before flipping `BILLING_ENABLED`, use the Clerk Dashboard or a one-off admin action to grant every current user a complimentary Basic subscription (Clerk supports 100%-off coupons / manual subscription assignment for this). They get 30 days + 100 credits, and a notification explaining "ProdSnap now has paid plans — you've been comped your first month of Basic. Visit /pricing to switch tiers or provide payment." If they don't convert by day 30, they lose access — but they've been warned.
- **Option Y (simpler, more abrupt): hard cutover.** Flip the flag. All existing users without a subscription see the `/pricing` page on next action. Send a pre-announcement email 7 days earlier.

Steps:
1. **2 weeks before cutover**: email all existing users explaining the upcoming pricing change and giving them 7-14 days notice. Link to `/pricing` preview if possible.
2. **At cutover** (per chosen option):
   - If Option X: grant complimentary Basic subscriptions via Clerk admin tooling/API *before* flipping `BILLING_ENABLED`. Verify subscriptions are attached. Then flip.
   - If Option Y: flip `BILLING_ENABLED=true` in Convex dashboard; deploy with `VITE_BILLING_ENABLED=true`.
3. Send launch announcement email.
4. **Monitor for 24-48 hours with concrete thresholds:**

   | Metric | Threshold | Action |
   |--------|-----------|--------|
   | Convex error rate on billing-gated mutations | >2% over 1h | Investigate; consider rollback |
   | Stripe payment failure rate | >15% | Rollback |
   | % of existing users who subscribed by end of day 1 (Option X) / day 7 (Option Y) | <baseline expectation | Review pricing / messaging, don't auto-rollback |
   | Support tickets: "can't access after paying" | >5/day | Rollback |
   | Support tickets: "out of credits" (new post-launch signal) | >10/day in first 30 days | Accelerate credit-top-up follow-up |

**Rollback plan (two levels):**
- **Instant (server-side):** Set `BILLING_ENABLED=false` in Convex dashboard. All feature gates pass immediately. No rebuild needed. Users retain their Clerk subscriptions (Clerk is unaffected).
- **Full (server + UI):** Additionally set `VITE_BILLING_ENABLED=false` in Netlify and redeploy. All billing UI disappears.

**Acceptance Criteria:**
- All three phases completed without incidents.
- Existing users handled per chosen rollout option (X or Y) before `BILLING_ENABLED=true`.
- At least one successful end-to-end payment in staging with test card.
- Rollback tested: flipping `BILLING_ENABLED=false` in Convex dashboard instantly allows all gated operations.
- Monitoring thresholds documented and alerting configured.
- Pre-cutover user notification email sent with ≥7 days advance notice.

---

## Extension Recipes

Quick recipes for the most likely evolution paths. Each recipe lists the minimum set of files to touch.

### Add a new capability
Example: introduce `ai-upscale`.
1. `convex/lib/billing/capabilities.ts` — add `AI_UPSCALE: 'ai-upscale'` to `CAPABILITIES`.
2. `convex/lib/billing/planConfig.ts` — add `CAPABILITIES.AI_UPSCALE` to the `capabilities` array of every plan that should include it.
3. Clerk dashboard — add a matching Feature (`ai-upscale`) and tick the boxes for the plans you updated in step 2. Slug must match exactly.
4. Mutation(s) that expose the capability — call `requireCapability(ctx, CAPABILITIES.AI_UPSCALE, 'mutationName')`.
5. UI site(s) — wrap with `<Show when={{feature: CAPABILITIES.AI_UPSCALE}} fallback={<UpgradePrompt />}>`.
6. `tests/billing-gates.test.ts` — add the mutation to the gated-mutation enumeration.

Files touched: 3 code files + 1 test + 1 dashboard config. No helper logic changes.

### Add a new plan tier
Example: introduce a `starter` plan with 10 products.
1. `convex/lib/billing/planConfig.ts` — add `starter: { slug: 'starter', productLimit: 10, capabilities: [...] }`.
2. Clerk dashboard — add a matching Plan with the same slug, set pricing, assign features.

Files touched: 1 code file + 1 dashboard config. Mutation code unchanged.

### Change a scalar limit
Example: raise Basic from 5 → 10 products, or bump Pro credits 500 → 750.
1. `convex/lib/billing/planConfig.ts` — change one number.

Files touched: 1. Clerk dashboard unchanged.

### Add a new tier between Basic and Pro
Example: introduce `studio` at $79.99/mo with 250 credits + 10 products.
1. `convex/lib/billing/planConfig.ts` — add `studio: { slug: 'studio', productLimit: 10, monthlyCredits: 250, capabilities: ALL_CAPABILITIES }`.
2. Clerk dashboard — add a matching plan with the same slug and price; assign all capabilities.

Files touched: 1 code file + 1 dashboard config. Mutation code unchanged. The custom `/pricing` page picks up the new plan automatically via `usePlans()`.

### Add credit top-ups / one-time credit pack purchases (future)
Not in v1. Shape of future change:
1. Add a `creditLedger` table (append-only) to `convex/schema.ts`.
2. Create a Stripe Checkout Session flow (Convex action + redirect) — this lives outside Clerk Billing since Clerk's one-time-purchase support isn't ready.
3. On checkout success (via redirect or Stripe webhook), insert a positive-delta row into `creditLedger`.
4. Update `requireCredit()` to subtract consumed credits from subscription quota first, then draw from `creditLedger` balance.
5. UI on the studio page: "You're out of monthly credits — [Buy a credit pack]" button alongside "[Upgrade plan]".

Files touched at that time: 1 new table + 1 new Convex action + 1 updated helper + 1 UI site. The existing audit schema and enforcement helpers already accommodate this without rewrite.

### Add a metered capability
Example: track generations-per-month for Free users.
1. Continue calling `requireCapability` as usual for gated access.
2. At the point the unit is consumed (e.g., inside `generateFromProduct`), insert into `billingEvents` with `context: 'usage'`, `units: 1`, and `metadata: { kind: 'generation' }` — no schema change (those fields are already optional).
3. Add a metering query: `getMonthlyUsage(userId, kind)` that sums `units` from `billingEvents` in the current billing period.
4. Enforce the monthly cap via a new helper `requireUsageUnder(ctx, CAPABILITIES.X, monthlyCap)` that combines `requireCapability` + the metering query.
5. When Clerk Billing exits beta and supports metered billing natively, report usage upward via Clerk's usage reporting API — the `billingEvents` rows already contain what's needed.

Files touched: mutation + new helper + new query. No schema migration.

### Swap the billing provider
Example: Clerk Billing → Stripe direct (hypothetical; bar: Clerk Billing remains beta >1 year or pricing changes materially).
1. Implement a new `provider.stripe.ts` conforming to `BillingProvider`.
2. Change one line in `convex/lib/billing/index.ts`: `export const billingProvider = new StripeBillingProvider()`.
3. Replace `extractBillingClaims` with Stripe-customer-metadata lookup inside the new provider.
4. Client — the custom `/pricing` and `/checkout` surfaces get reworked to call the new provider's plan-fetching + checkout APIs instead of `usePlans()` / `<CheckoutProvider>`. Because all Clerk-experimental imports are confined to `src/components/billing/**`, the blast radius is that one folder. `<Show>` gating continues working if the new provider also supplies a React `has()`-equivalent.

Files touched: new provider file + one line in `index.ts` + pricing page component. Mutation code unchanged.

---

## ADR (Architecture Decision Record)

### Decision
Use Clerk JWT claims (`pla`, `fea`) for subscription enforcement in Convex (Option C: hybrid) through a pluggable `BillingProvider` interface, with a central `CAPABILITIES` registry, a declarative `PLAN_CONFIG` holding per-plan `productLimit`, `monthlyCredits`, and `capabilities`, and an append-only `billingEvents` audit table that doubles as the monthly-credit ledger (via rows with `context: 'usage'`). `@clerk/react` `<PricingTable />` / `<Show>` for UI. **V1 scope is two paid tiers (Basic $49.99 / Pro $129.99), no Free tier, hard monthly credit caps resetting on the 1st UTC, no credit rollover, no top-up packs, no webhooks.**

### Drivers
1. Clerk is already the auth provider; billing is a natural extension.
2. JWT-based enforcement avoids sync complexity and dual source of truth.
3. Beta status requires version pinning and kill switch capability.
4. Payment-adjacent system requires audit trail for dispute resolution.

### Alternatives Considered
- **Option A (JWT only, no audit):** Rejected -- no server-side record of denials is a compliance/dispute liability. Any dispute before webhooks are added requires manual Clerk Dashboard lookup.
- **Option B (Webhook-synced Convex table):** Rejected -- excessive complexity for current needs, eventual consistency issues, dual source of truth risk.
- **Direct Stripe integration (no Clerk Billing):** Rejected -- would require building checkout UI, webhook handling, subscription management, and plan-JWT mapping from scratch. All of this is already handled by Clerk Billing. Would reconsider only if Clerk Billing remains in beta for >1 year without stabilizing, or if Clerk pricing changes materially make it uneconomical.

### Why Chosen
Option C provides the simplest path to server-side enforcement with minimal additional infrastructure (one audit table, one insert per gated call). Clerk handles all Stripe interaction, checkout UI, and subscription lifecycle. The JWT-based approach leverages Convex's existing auth model. The audit table adds negligible overhead but provides dispute resolution capability from day one.

### Consequences
- **Positive:** Fast to implement (~5-7 days including security patch + audit table + extensibility scaffolding + credit-quota enforcement). Minimal new code at mutation sites (one `requireCapability` + `requireCredit` + `recordCreditUse` call stack each). Single source of truth for enforcement. Audit trail from day one — the same `billingEvents` table powers both dispute logs and monthly-credit counting. **Every likely evolution path (new capability, new plan, new limit, credit packs, provider swap) is a small, localized change — see Extension Recipes.**
- **Negative:** Capability slugs declared in three places that must agree (registry, plan config, Clerk dashboard) — mitigated by `billing-gates.test.ts` consistency assertions. Credit counting via table scans (`billingEvents` filtered by userId + timestamp) is fine at v1 scale but will need caching/summary rows or a dedicated `creditLedger` table when users accumulate tens of thousands of rows each (follow-up). `~60s` JWT latency on plan changes — client mitigated by post-checkout interstitial. Calendar-month resets are slightly unfair to late-month signups (they get full credits immediately, then another full batch on the 1st; documented as "early-month bonus"). `billingEvents` grows unbounded — TTL follow-up.
- **Risks:** JWT claim format may change — mitigated by versioning inside `extractBillingClaims`. Clerk API instability — mitigated by the `BillingProvider` seam. **Credit exhaustion rage-quit risk** — without top-up packs in v1, a user who runs out on the 15th of the month has no path except upgrade-or-wait. Monitor support ticket volume for "out of credits" in the first 30 days; ship credit packs fast if it's high.

### Follow-ups (ordered roughly by likelihood of needing them)
- [ ] **Credit top-up packs** (Stripe Checkout Session + `creditLedger` table). Ship fast if "out of credits" support tickets trend high post-launch. See Extension Recipe.
- [ ] Add webhook endpoint (Convex HTTP action) for richer event logging and to anchor billing periods to subscription dates rather than calendar month.
- [ ] Migrate credit-counting from table scan to a `creditBalance` cache row (updated transactionally with each `recordCreditUse`). Needed when per-user `billingEvents` rows exceed ~10k.
- [ ] New tier between Basic and Pro (e.g., `studio` at ~$79.99 / 250 credits) if market data suggests a gap.
- [ ] Consider moving background removal into credits (1 credit = 1 bg removal) if its API cost shows up as a meaningful line item in Convex metrics.
- [ ] Add admin dashboard showing subscription metrics from `billingEvents` (group by `capability`, `context`, time window, utilization percentiles).
- [ ] Migrate to `@clerk/tanstack-react-start` if server-side `has()` becomes needed for SSR gating.
- [ ] **Migrate off `/experimental` APIs once Clerk Billing reaches GA.** The hooks we depend on (`useCheckout`, `usePaymentElement`, `usePlans`, etc.) currently live under `@clerk/react/experimental` — when they graduate to stable, swap imports and remove the CI grep fence. Track via Clerk's changelog.
- [ ] Consider 3D Secure support when Clerk adds it.
- [ ] Add TTL/cleanup policy for `billingEvents` (retain 24 months by default; extend for jurisdictions that require longer retention).
- [ ] Evaluate scalar `publicMetadata` claim (e.g., `maxProducts: 20`) on the Clerk plan — if available, `requireProductLimit` could read directly from the JWT. Low priority until Clerk exposes it.
- [ ] Add an ESLint rule forbidding string literals as the `feature` prop of `<Show>` to enforce registry usage.
- [ ] Add Org-level subscriptions (Clerk supports B2B) — `BillingProvider.getContext` returns `{ plan, capabilities, scope: 'user' | 'org' }` with additive change only.

---

## Mutations/Queries Requiring Feature Gates (Complete Inventory)

### `convex/products.ts`

| Function | Type | Has `requireAuth()`? | Billing Gate |
|----------|------|---------------------|--------------|
| `createProduct` | mutation | YES | `requireProductLimit()` |
| `updateProduct` | mutation | YES | None |
| `reanalyzeProduct` | mutation | YES | None |
| `archiveProduct` | mutation | YES | None |
| `restoreProduct` | mutation | YES | None |
| `removeProductBackground` | mutation | YES | `requireCapability(ctx, CAPABILITIES.REMOVE_BACKGROUND)` |
| `clearBackgroundRemoval` | mutation | YES | None |
| `generateFromProduct` | mutation | YES | `requireCapability(CAPABILITIES.GENERATE_VARIATIONS)` in variation mode; `requireCapability(CAPABILITIES.BATCH_GENERATION)` for >2 variations |
| `generateVariations` | mutation | YES | `requireCapability(CAPABILITIES.GENERATE_VARIATIONS)` |
| `deleteGeneration` | mutation | YES | None |
| `listProducts` | query | soft (getAuthUserId) | None |
| `getProduct` | query | soft (getAuthUserId) | None |
| `getProductWithStats` | query | soft (getAuthUserId) | None |
| `getProductGenerations` | query | soft (getAuthUserId) | None |
| `listTemplates` | query | None | None (show all; UI marks premium) |

### `convex/studio.ts`

| Function | Type | Has `requireAuth()`? | Billing Gate |
|----------|------|---------------------|--------------|
| `createRun` | mutation | **NO -- add in Step 1** | None |
| `updateRunAnalysis` | mutation | **NO -- add in Step 1** | None |
| `reanalyze` | mutation | **NO -- add in Step 1** | None |
| `submitRun` | mutation | **NO -- add in Step 1** | Same as `generateFromProduct` |
| `retryGeneration` | mutation | **NO -- add in Step 1** | None |
| `getRun` | query | None | None |
| `getGenerations` | query | None | None |
| `matchTemplates` | query | None | None |

### `convex/productImages.ts`

| Function | Type | Has `requireAuth()`? | Billing Gate |
|----------|------|---------------------|--------------|
| `addProductImage` | mutation | YES | None |
| `setPrimaryImage` | mutation | YES | None |
| `deleteProductImage` | mutation | YES | None |
| `removeImageBackground` | mutation | YES | `requireCapability(ctx, CAPABILITIES.REMOVE_BACKGROUND)` |
| `getProductImages` | query | soft (getAuthUserId) | None |
| `getProductImagesList` | query | soft (getAuthUserId) | None |
| `getProductImage` | query | soft (getAuthUserId) | None |

### `convex/board.ts` (OUT OF SCOPE for billing)

| Function | Type | Has `requireAuth()`? | Billing Gate |
|----------|------|---------------------|--------------|
| `createColumn` | mutation | **NO -- add in Step 1** | None (not billable) |
| `createItem` | mutation | **NO -- add in Step 1** | None |
| `deleteItem` | mutation | **NO -- add in Step 1** | None |
| `updateItem` | mutation | **NO -- add in Step 1** | None |
| `updateColumn` | mutation | **NO -- add in Step 1** | None |
| `updateBoard` | mutation | **NO -- add in Step 1** | None |
| `deleteColumn` | mutation | **NO -- add in Step 1** | None |
| `getBoards` | query | -- | None |
| `getBoard` | query | -- | None |

---

## Open Questions

See `.omc/plans/open-questions.md` for tracked items.

---

## Revision History

### Iteration 1 (2026-04-21)
Applied 12 edits from Architect + Critic feedback:

1. **Edit 1 (kill switch):** Split into `VITE_BILLING_ENABLED` (client, build-time) and `BILLING_ENABLED` (Convex env, runtime). Updated Steps 5 and 6.
2. **Edit 2 (post-checkout JWT refresh):** Added Scenario 4 pre-mortem and post-checkout interstitial implementation to Step 4.
3. **Edit 3 (mutation inventory):** Expanded `studio.ts` inventory to all 5 public mutations. Added `board.ts` inventory (7 mutations). Added Step 1 (pre-billing auth patch).
4. **Edit 4 (audit trail):** Changed from Option A to Option C (hybrid). Added `billingEvents` table. Updated Principle 2 and ADR.
5. **Edit 5 (downgrade behavior):** Documented existing-products-remain-accessible policy in Step 3 and Step 4 UI.
6. **Edit 6 (dual-limit fragility):** Added precedence rule, `console.warn` on dual-limit, unit test. Added scalar claim follow-up to ADR.
7. **Edit 7 (enforcement verification):** Added `tests/billing-gates.test.ts` spec to Step 3 acceptance criteria.
8. **Edit 8 (rollback thresholds):** Added concrete metric thresholds table to Step 6 Phase 3.
9. **Edit 9 (spike cleanup):** Added `inspectIdentity` deletion and CI grep check to Step 0 acceptance criteria.
10. **Edit 10 (test plan entries):** Added post-checkout refresh, concurrent tabs, subscription expiry, dual-limit, and downgrade cost quantification tests.
11. **Edit 11 (ADR alternatives):** Expanded Direct Stripe rejection rationale and reconsidering bar.
12. **Edit 12 (Principle 5 precision):** Rewrote Principle 5 to specify both degradation modes (fail-open when disabled, fail-closed on missing claims).

### Iteration 2 (2026-04-21) — Extensibility Refactor
User-driven. Cross-cutting meta-requirement: the plan must be extensible and flexible for future modifications (early-stage product, significant evolution ahead, no short-term decisions). 10 refinements applied; strategic decision (Option C hybrid) unchanged — only the implementation shape made config-driven.

1. **R1 (Principle 6 — Design for Evolution):** Added as the 6th principle. Rewrote Principle 3 from "feature-based gating" to "capability-based gating via central registry" for consistency.
2. **R2 (capability registry):** Introduced `convex/lib/billing/capabilities.ts` as the sole declaration site for capability slugs. Mutation code and UI gates now reference `CAPABILITIES.X` typed constants — no raw strings.
3. **R3 (declarative plan config):** Introduced `convex/lib/billing/planConfig.ts` with `PLAN_CONFIG` mapping plan slug → `{ productLimit, capabilities[] }`. Source of truth for scalar limits; synced with Clerk dashboard for capability assignments.
4. **R4 (scalar product limits):** Removed `max-products-3` / `max-products-25` / `unlimited-products` from the Clerk dashboard feature list and from Step 2. `requireProductLimit` now reads `PLAN_CONFIG[plan].productLimit` — precedence logic and dual-limit edge case eliminated. Related unit test replaced with "unknown plan slug fallback" test.
5. **R5 (versioned JWT claim extractor):** Extracted JWT parsing into `extractBillingClaims(identity, version)`. `v1` locked in; future Clerk claim changes handled by adding a `v2` branch without touching callers.
6. **R6 (`BillingProvider` interface):** Added a pluggable provider seam. Current impl `ClerkBillingProvider` in `provider.clerk.ts`. Swapping providers = one-line change in `index.ts`; mutations never know about Clerk.
7. **R7 (audit schema forward-compat):** `billingEvents` now includes optional `units`, `metadata`, `context` fields. Metered billing and webhook events are additive, no schema migration.
8. **R8 (`requireFeature` → `requireCapability`):** Renamed throughout plan. The helper takes a `Capability` branded type (compile-time typo prevention) rather than a string.
9. **R9 (Extension Recipes section):** New section before the ADR. Concrete recipes for adding a capability / plan / limit / metered capability / swapping providers. Each recipe lists the minimum set of files to touch.
10. **R10 (ADR Follow-ups expansion):** Added items for ESLint rule on inline slugs, Org-level subscriptions (additive via `BillingProvider`), and clarified that metered billing follows the recipe without schema migration.

**Not changed:** Strategic decision stays Option C (hybrid JWT + audit). 7-step execution order unchanged. Pre-mortem scenarios unchanged (Scenario 1 + 3 wording updated to reflect new module boundaries). Acceptance criteria strengthened for consistency checks. ADR Decision line expanded to mention the extensibility scaffolding.

### Iteration 3 (2026-04-21) — Pricing model + monthly credit quotas
User-driven final scope. Concrete pricing and metering decisions locked in. Metered billing moved from Must-NOT-Have into v1 scope (quotas are metering, functionally).

1. **Plans (final v1):** Basic ($49.99 / $39.99 annual) and Pro ($129.99 / $99 annual). No Free tier. Both plans have identical capabilities; differentiation is volume only (products and monthly credits).
2. **Scalar limits per plan:** Basic 5 products / 100 credits. Pro 20 products / 500 credits. Credits reset monthly on the 1st UTC. No rollover.
3. **Capability flat distribution:** both Basic and Pro get all 5 capabilities (`advanced-templates`, `hd-output`, `variations`, `batch-generation`, `background-removal`). The capability gates exist for future tier restrictions and as the enforcement seam; v1 just never denies them across Basic/Pro.
4. **Counting rule locked:** every generation mutation consumes one credit regardless of success/failure. Retries also consume. Failed-generation cost is priced into the plan; users informed on pricing page and in studio UI.
5. **Added `requireCredit` + `recordCreditUse` helpers** in `convex/lib/billing/index.ts`. `requireCredit` reads `PLAN_CONFIG[plan].monthlyCredits` and counts `billingEvents` rows with `context: 'usage'` since `startOfMonthUtc()`. `recordCreditUse` inserts the usage row before scheduling downstream API work.
6. **No `creditLedger` table in v1.** The existing `billingEvents` table doubles as the monthly-credit source-of-truth (rows with `context: 'usage'` are the ledger). If/when top-up packs ship, a dedicated ledger table is added per the Extension Recipe.
7. **Background removal is uncounted in v1** — no credit consumed; included capability. Flagged as a watch-item in ADR follow-ups (move into credits if its API cost shows up as meaningful).
8. **Month-boundary handling:** counting uses `billingEvents.timestamp` at the moment the mutation is called. Workflows crossing UTC midnight are counted against the starting month. Test plan covers this edge.
9. **Dropped unit-economics disclaimer** from the plan table and added actual unit-economics reference (gross margin per plan at full cap) so future readers see the math.
10. **Added Extension Recipes for (a) "Add a new tier between Basic and Pro" and (b) "Add credit top-ups / one-time credit pack purchases (future)"** — the latter is the full design shape for when top-ups ship.

**Scope changes that matter:**
- `Must NOT Have` removed "Metered billing or usage counters (future scope)" (it's now v1) and added explicit items: no credit rollover, no top-ups, no subscription-anchor periods, no Free tier.
- `Consequences` added a "credit exhaustion rage-quit" risk and the mitigation (monitor support tickets, ship top-ups fast if needed).
- `Follow-ups` reordered by likelihood; credit top-ups now the #1 follow-up.

**Not changed:** All 6 principles still hold. The 7-step execution order. Kill switch design. Post-checkout interstitial. `BillingProvider` seam. Audit schema shape (but `context: 'usage'` rows now have a production role as the credit ledger in addition to audit).

### Iteration 4 (2026-04-21) — Custom UI via Clerk experimental hooks
User-driven. Clerk's out-of-box `<PricingTable/>` is generic and off-brand; replacing it with fully custom Mantine-themed pricing/checkout/billing surfaces. Strategic decision unchanged; this is a Step 4 rewrite plus pinning/pre-mortem tightening.

1. **Dropped `<PricingTable/>` entirely.** Custom `/pricing`, `/checkout`, and `/account/billing` routes built with Clerk's experimental billing hooks (`usePlans`, `useCheckout`, `usePaymentElement`, `<CheckoutProvider>`, `<PaymentElement/>`). Mantine owns the layout, Stripe owns the card iframe (PCI-required), `stripeAppearance.ts` maps Mantine tokens into Stripe Elements' appearance API so the iframe is on-brand.
2. **Isolated experimental-API usage.** All imports from `@clerk/react/experimental` are confined to `src/components/billing/**`. CI grep blocks imports elsewhere. Containment makes a Clerk breaking change localizable to one folder.
3. **Added `@clerk/clerk-js` to the pinning list.** The experimental hooks actually live in `clerk-js`; pinning only `@clerk/react` is insufficient. Both packages are now pinned exactly and upgraded only in dedicated PRs with full E2E regression.
4. **Added 5th pre-mortem scenario** (Clerk Experimental Hook API Churn) with 6 concrete mitigations, including the CI fence, the containment folder, and the kill-switch fallback UI.
5. **Step 0 spike expanded** with a sub-check verifying `@clerk/react/experimental` exports the 6 hooks we depend on. Fallback plan documented if the exports differ (add `@clerk/tanstack-react-start` or temporarily use `<PricingTable/>`).
6. **Step 4 fully rewritten** with 8 numbered actions producing: `src/routes/pricing.tsx` (usePlans + Mantine cards), `src/routes/checkout.tsx` (CheckoutProvider + custom form), `src/routes/account/billing.tsx` (current plan, payment method, change/cancel actions), `src/components/billing/**` (shared components + post-checkout interstitial), `src/lib/billing/stripeAppearance.ts` (Mantine → Stripe tokens).
7. **Happy-path E2E test rewritten** to cover the custom flow (plan card → `/checkout` → PaymentElement submit → interstitial → redirect → `/account/billing` verification).
8. **Added follow-up** to migrate off `/experimental` imports once Clerk Billing exits beta.

**Scope changes that matter:**
- Effort estimate: ~5-7 days → **~8-11 days** (Step 4 grew by 3-4 days for the three custom surfaces). Reflected in ADR Consequences.
- `Drivers` updated: "no package swap needed because PricingTable works" no longer applicable; replaced with "custom UI via experimental hooks" as the second driver.
- `Must Have` updated: custom surfaces, CI grep fence, `clerk-js` pin, Mantine-tokened Stripe appearance are now explicit requirements.
- New risk surfaced in Scenario 5: `/experimental` APIs are more unstable than Clerk Billing itself (beta on beta). Mitigated by containment + pin + CI smoke + kill switch.

**Not changed:** Strategic Option C hybrid. 7-step order. All 6 principles. Enforcement helpers (`requireCapability`, `requireCredit`, `requireProductLimit`). Audit schema. `billingEvents` table design. Kill switches. Plan config. Capability registry. `BillingProvider` seam. Rollout options X/Y.
