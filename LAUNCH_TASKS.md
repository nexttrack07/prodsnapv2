# MVP Launch Tasks

Single source-of-truth checklist for shipping ProdSnap to real users. Every item is grounded in `.omc/launch-audit-{a,b,c,d}-*.md`.

> Note: kept under the name `LAUNCH_TASKS.md` (lowercase `tasks.md` would clobber the existing `TASKS.md` on macOS's case-insensitive filesystem). `TASKS.md` continues to track features/dev-work; this file tracks launch readiness.

## Session log — 2026-05-16

Cleared the engineering blocker sprint from the audit. Net delta: tests still 72/72, build green, **zero dependency vulnerabilities** (was 4: 1 critical, 2 high, 1 moderate).

- ✅ **Credit system shipped end-to-end** (`creditBalances` + `creditPricing` tables, `chargeCredits`/`grantPlanCredits`/`upgradeAdjustCredits` helpers, header pill, out-of-credits modal, webhook integration, daily seed cron). 12 unit tests at `convex/lib/billing/__tests__/credits.test.ts`. Tiers locked: Lite 500cr/$29.99, Pro 1500cr/$59.99, Max 4000cr/$129. Per-action: image gen = 10 credits, BG removal = 2 credits. No premium UI toggle. All Gemini ops unmetered.
- ✅ **Dep upgrades** — `@clerk/react` 6.4.2 → 6.6.4 (auth-bypass CVE patched), `@tanstack/react-router` → 1.170.1 (malware advisory cleared), `@aws-sdk/client-s3` + `s3-request-presigner` → 3.1048.0 (fast-xml-builder vuln patched).
- ✅ **Auth holes closed** — `convex/r2.ts:getUploadUrl` + `uploadProductImage` now require auth (anonymous R2 access was wide open); `convex/studio.ts:getRun` + `getGenerations` now enforce ownership (was IDOR via guessed runId); `convex/prompts.ts:get/update/resetPromptConfig` now require `requireAdminIdentity` (was `requireAuth` — any signed-in user could rewrite the system prompt for all users).
- ✅ **Landing tier alignment** — `src/routes/index.tsx` `PricingSection` now derives from `PLAN_CONFIG`; tiers/prices/gen counts cannot drift from code anymore. (Closes **C1**.)
- ✅ **`BILLING_ENABLED` fail-closed default** — `convex/lib/billing/index.ts:34` now returns `process.env.BILLING_ENABLED !== 'false'`. Forgotten env var enforces billing instead of silently bypassing it. (Partially closes **B2** — you should still set it explicitly.)
- ✅ **Wallet-protection guards in `convex/ai.ts`** — throws if `productImageUrl` missing (was: silent fal.ai error on `[string, undefined]`); logs `console.error` at 4 sites when `userId` missing (was: silent revenue leak on legacy rows).
- ✅ **Rate limits added** to `removeProductBackground` + `removeImageBackground` (was: only image-gen + ad-copy + URL-imports were rate-limited).
- ✅ **Coin icon** in header pill + sidebar.

Items below updated accordingly. New entries added for security findings the prior audit caught.

## Severity legend

- **BLOCKER** — cannot launch; first user hits the issue
- **HIGH** — must do before public marketing push
- **POLISH** — improves experience but post-launch ok

## Status legend

- `[ ] OPEN` — actionable, ready to fix
- `[ ] NEEDS-USER-INPUT` — needs a credential, decision, or external setup from you (Faadhil)
- `[x] DONE` — shipped

---

## Category: Auth / Identity (Clerk)

- [x] **NEW-1 — BLOCKER — Sign-in redirects to `/home`** `DONE`
  - Why: A user signing in from the landing page lands back on the landing page (or wherever they started). They expect to land at `/home` (the dashboard).
  - Fix: add `signInForceRedirectUrl="/home"` and `signUpForceRedirectUrl="/home"` to `<ClerkProvider>` at `src/router.tsx:55-65`. Optionally add `forceRedirectUrl="/home"` on the `<SignIn />` and `<SignUp />` components in the new sign-in/sign-up route files.

- [x] **NEW-2 — VERIFY — Sign-out returns to landing** `DONE` — verified `afterSignOutUrl="/"` at `src/router.tsx:60`; grep confirms zero direct `signOut()` bypass calls in `src/`
  - Why: User-stated requirement. `afterSignOutUrl="/"` is already set at `src/router.tsx:60`. Need to verify every sign-out invocation actually triggers it (no direct `signOut()` calls bypass).

- [ ] **A1 — BLOCKER — Clerk is on Dev keys** `NEEDS-USER-INPUT`
  - Why: `.env.local:9-11` ships `pk_test_...` / `sk_test_...` against `tight-bonefish-24.clerk.accounts.dev`. Real users can't sign up against a Dev instance once Dev quota is hit, and account data won't survive the cutover.
  - Evidence: `.env.local:9,10,11`; consumed at `src/router.tsx:16`; Convex JWT issuer at `convex/auth.config.ts:7`
  - You provide: prod Clerk publishable key, secret key, JWT issuer domain. Then update `.env.local` (and Netlify env vars `VITE_CLERK_PUBLISHABLE_KEY`) and `npx convex env set --prod CLERK_SECRET_KEY ... CLERK_JWT_ISSUER_DOMAIN ...`

- [x] **A2 — BLOCKER — `/sign-in` and `/sign-up` routes added** `DONE` — `src/routes/sign-in.tsx` + `src/routes/sign-up.tsx` render Clerk `<SignIn/>`/`<SignUp/>` with `forceRedirectUrl="/home"`
  - Why: `<ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-in">` at `src/router.tsx:57-58`, but no `src/routes/sign-in.tsx` exists. Sign-out → redirect → TanStack 404.
  - Evidence: `src/router.tsx:57-58`; `find src/routes -name "sign*"` returns nothing; `OnboardingGuard.tsx:19-20` references both routes as public bypass paths
  - Fix: add `src/routes/sign-in.tsx` and `src/routes/sign-up.tsx` rendering Clerk `<SignIn />` / `<SignUp />` components (~20 LoC each)

- [ ] **A3 — BLOCKER — Prod Clerk webhook endpoint not wired** `NEEDS-USER-INPUT`
  - Why: `CLERK_WEBHOOK_SECRET` referenced at `convex/http.ts:12` is unset in prod Convex env. Without this, no plan changes from Clerk reach the app.
  - Evidence: `convex/http.ts:12-16`; webhook handler is production-grade with Svix signature verify + idempotency dedup at `convex/billing/webhookHandler.ts:36-58`
  - You provide: in Clerk prod dashboard, create webhook pointing to `<prod-convex-slug>.convex.site/webhooks/clerk` subscribed to `subscription.*`, `subscriptionItem.*`, `user.updated`, **and add `user.deleted`** (see G3). Copy the Svix signing secret. Then `npx convex env set --prod CLERK_WEBHOOK_SECRET whsec_...`

- [ ] **A4 — HIGH — Prod admin user-id list not configured** `NEEDS-USER-INPUT`
  - Why: `CLERK_ADMIN_USER_IDS` (`convex/lib/admin/requireAdmin.ts:53`) is empty in prod. After your first prod sign-up, your own user ID won't be in the admin list → admin routes/queries are locked out.
  - You provide: after prod sign-up, get your `user_xxx` ID from Clerk dashboard → `npx convex env set --prod CLERK_ADMIN_USER_IDS user_xxx`. Also set `publicMetadata.role = "admin"` on that same user (action-tier admin gate uses publicMetadata).

- [ ] **A5 — HIGH — Prod domain not whitelisted in Clerk** `NEEDS-USER-INPUT`
  - Why: `<ClerkProvider>` will throw on an un-whitelisted hostname.
  - You provide: whitelist `app.prodsnap.io` (or whatever domain) in Clerk Dashboard → Domains. If using a custom Clerk frontend domain, switch `CLERK_JWT_ISSUER_DOMAIN` accordingly.

- [ ] **A6 — HIGH — OAuth providers not selected** `NEEDS-USER-INPUT`
  - Why: No OAuth-specific code paths in `src/`. Provider buttons (Google, GitHub) come from Clerk's hosted UI when `<SignIn />` / `<SignUp />` render — currently nowhere because A2 blocks.
  - You provide: enable desired providers in Clerk prod dashboard → User & Authentication → Social Connections.

---

## Category: Backend / Convex

- [ ] **B1 — BLOCKER — Convex deployment is on Dev** `NEEDS-USER-INPUT`
  - Why: `.env.local:2,4,6` point at `dev:kindred-swan-491`. Dev tier rate-limits aggressively and shares storage.
  - Evidence: `.env.local:2 CONVEX_DEPLOYMENT=dev:kindred-swan-491`, `.env.local:4 VITE_CONVEX_URL=https://kindred-swan-491.convex.cloud`. Source code is correctly env-driven (`src/router.tsx:23-27`); no hardcoded URLs.
  - You provide: provision a prod Convex deployment via `npx convex deploy`. Swap URLs in `.env.local` and Netlify env vars to the new prod slug.

- [ ] **B2 — HIGH — Server-side `BILLING_ENABLED` explicitly set in prod** `NEEDS-USER-INPUT` (severity downgraded from BLOCKER)
  - Why: As of 2026-05-16, the gate at `convex/lib/billing/index.ts:34` is now **fail-closed**: enforcement is ON unless `BILLING_ENABLED='false'` is explicitly set. So a forgotten env var no longer silently grants everyone the app for free. **However**, you should still set it explicitly in prod so the intent is documented + the value can't be flipped accidentally via `--prod BILLING_ENABLED=false`.
  - You provide: `npx convex env set --prod BILLING_ENABLED true` (after B5 plan slugs are confirmed).

- [ ] **B3 — HIGH — Prod R2 / fal.ai / Firecrawl credentials not set** `NEEDS-USER-INPUT`
  - Why: `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`, `FAL_KEY`, `FIRECRAWL_API_KEY` are all referenced in `convex/**` but not currently set in prod env. Every upload, image gen, and URL-import action throws on first call.
  - Evidence: `convex/r2.ts:79-103,210-211,326`, `convex/ai.ts:21`, `convex/urlImportsActions.ts:114`
  - You provide: prod Cloudflare R2 bucket creds, prod fal.ai key, prod Firecrawl key (only if URL-import is in v1 launch). Each via `npx convex env set --prod ...`

- [x] **B4 — HIGH — `.env.local.example` documents all prod-required keys** `DONE`
  - Why: `CLERK_ADMIN_USER_IDS`, `FAL_KEY`, `FIRECRAWL_API_KEY`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` are referenced in code but not documented in `.env.local.example`. New contributors hit silent runtime failures.
  - Fix: add a server-side commented block listing all 7 keys with format hints.

- [x] **B5 — POLISH — `CONVEX_TEST_MODE` flagged dev-only** `DONE`
  - Why: Accidentally setting it in prod bypasses real APIs with mocks (`convex/testMocks.ts:7`).
  - Fix: add a warning comment in `.env.local.example` noting this var is dev-only.

---

## Category: Billing (Clerk Billing on top of Stripe)

- [x] **C1 — BLOCKER — Plan slug mismatch resolved** `DONE` (2026-05-16) — Tiers are now `lite` / `pro` / `max` everywhere. Landing's `PricingSection` (`src/routes/index.tsx:1423-1480`) derives `price`, `imageCredits / 10` (image-gen count), and `brandKitLimit` directly from `PLAN_CONFIG`. Cannot drift.
  - Still NEEDS-USER-INPUT: confirm Clerk dashboard plans use slugs `lite`, `pro`, `max` (not the old solo/studio/agency). If they don't, rename them in Clerk.

- [ ] **C2 — BLOCKER — Brand-kit limit has zero server-side enforcement** `OPEN`
  - Why: Landing advertises 2/8/unlimited brand kits per tier. `convex/brandKits.ts` has no `requireBrandKitLimit` gate. Solo users can create unlimited kits → revenue leakage.
  - Evidence: `convex/brandKits.ts` (no enforcement); `convex/lib/billing/planConfig.ts:19-24` (no `brandKitLimit` field)
  - Fix: add `brandKitLimit?: number` to `PlanConfig`; add `requireBrandKitLimit(ctx)` to `convex/lib/billing/index.ts`; call it from `createBrandKit` in `convex/brandKits.ts`.

- [ ] **C3 — BLOCKER — Trial period not configured per Clerk plan** `NEEDS-USER-INPUT`
  - Why: Landing FAQ at `src/routes/index.tsx:1605` and every CTA promises "7-day free trial". `PlanCard.tsx:52,148-152` reads `freeTrialDays` from Clerk plan data via `usePlans()`. If Clerk plans don't have `trial_period_days = 7`, **users are charged immediately at checkout despite the landing promise.**
  - You provide: in Clerk prod dashboard, set `trial_period_days = 7` on each paid plan. Verify with a real test card before launch.

- [x] **C4 — BLOCKER — Landing CTAs route to `/onboarding`** `DONE` — Hero, Pricing card, FinalCTA primary CTAs all point to `/onboarding`
  - Why: Hero / Pricing / FinalCTA "Start free trial" buttons all go to `/home`. `__root.tsx:118-121` renders `<BillingSync/>` and `<OnboardingGuard/>` only inside `<Authenticated>`. An unauthenticated visitor hits `/home` with no explicit `<Unauthenticated>` redirect → broken/blank state. (Connects to A2 missing sign-in route.)
  - Evidence: `src/routes/index.tsx:243,1574,1719`; `src/routes/__root.tsx:118`
  - Fix: redirect `/home` for unauthenticated users to `/sign-up` (after A2 lands), OR change CTAs to point at `/onboarding` directly which can host its own sign-up modal.

- [x] **C5 — HIGH — `VITE_BILLING_ENABLED` stale doc removed** `DONE`
  - Why: `.env.local.example:8-12` claims this flag gates `/pricing`, `/checkout`, `/account/billing`, sidebar/footer billing links. Grep across `src/` returns zero references. Sidebar (`src/components/layout/Sidebar.tsx:55,285`), MarketingLayout (`src/components/layout/MarketingLayout.tsx:61,113`), and the three billing routes all render unconditionally.
  - Fix: either delete the stale doc, or wire the gate everywhere it's promised.

- [x] **C6 — HIGH — Resume-subscription path** `DONE` — "Resume subscription" button on `/account/billing` opens Clerk's hosted UserProfile (Clerk Backend SDK has no `uncancelSubscriptionItem` API; same pattern used for plan changes)
  - Why: After scheduled cancel, user has no in-app way to reverse. They must navigate to Clerk's UserProfile via "Manage account".
  - Evidence: `src/components/billing/AccountBillingPage.tsx:199-219`
  - Fix: add a "Resume subscription" action that calls Clerk's reactivate API.

- [x] **C7 — HIGH — Cancel-scheduled state persisted** `DONE` — `cancelScheduledAt` field on `userPlans`; persistent banner survives page reloads
  - Why: UI shows green confirmation banner from local action state; on next page reload, no persistent indicator that cancellation is scheduled.
  - Evidence: `convex/billing/syncPlan.ts:290-330`; `src/components/billing/AccountBillingPage.tsx:135-139`
  - Fix: write `userPlans.billingStatus = 'cancel_scheduled'` (or similar field) at cancel time; render that on every reload.

- [x] **C8 — HIGH — Webhook/client identity-key drift fixed** `DONE` — provider read path falls back to `by_clerkUserId` lookup when tokenIdentifier-keyed row is missing
  - Why: Webhook may write `userPlans` row keyed by raw `clerkUserId`; client `BillingSync` writes by `tokenIdentifier`. Two rows for one user → race window where paid mutations say "no subscription".
  - Evidence: `convex/billing/webhookHandler.ts:148-153`; `convex/lib/billing/provider.clerk.ts:42-46`
  - Fix: normalize webhook to write tokenIdentifier-keyed rows (resolve clerkUserId→userId via indexed lookup), or add `clerkUserId` index + fallback read in provider.

- [ ] **C9 — HIGH — Plan-change after `openUserProfile()` doesn't eagerly resync** `OPEN`
  - Why: User changes plan in Clerk's hosted UI → no event hook fires → app waits for focus event, webhook, or next mount. UI shows "Studio" but server gates as old plan in the gap.
  - Evidence: `src/components/billing/PlanCard.tsx:84-90`
  - Fix: hook into `openUserProfile()` close callback, fire `syncUserPlan()`. Worst case, poll for ~5s after modal close.

- [x] **C10 — HIGH — Unused capabilities removed** `DONE` — `HD_OUTPUT` and `ADVANCED_TEMPLATES` removed from CAPABILITIES + plan configs
  - Why: They sit in `ALL_CAPABILITIES` and are listed in plan capabilities, but no `requireCapability` call uses them. Either remove or wire.
  - Evidence: `convex/lib/billing/capabilities.ts:24,26`; no usages in `convex/lib/billing/index.ts`

- [x] **C11 — HIGH — `requireProductLimitForUser` fails closed** `DONE` — unknown plan slug now throws `NO_PLAN` billingError instead of silently allowing unlimited products
  - Why: `index.ts:185-189`: `if (!plan) return` → user with unrecognized slug gets unlimited products. Forward-compat by design but leaks paid features to misconfigured users.
  - Evidence: `convex/lib/billing/index.ts:185-189`

- [x] **C12 — HIGH — Durable webhook retry queue** `DONE` — `webhookRetryQueue` table + `retryFailedWebhooks` cron drain (5 attempts, exponential backoff, idempotent against Svix dedup)
  - Why: `http.ts:60-68` schedules `runAfter(0, ...)` and returns 200; if the scheduled action throws, error is logged but Clerk gets no retry signal.
  - Evidence: `convex/http.ts:60-68`; `convex/billing/webhookHandler.ts:163-169`
  - Fix: idempotent retry loop on failure, or at minimum a Convex log alert.

- [x] **C13 — POLISH — `by_clerkUserId` index added** `DONE`
  - Why: `userPlans.clerkUserId` is unindexed; full table scan on every webhook. OK at low scale.
  - Fix: add `by_clerk_user_id` index in `convex/schema.ts:248-258`.

- [x] **C14 — POLISH — Banner covers all payment-failure statuses** `DONE` — `past_due`, `incomplete`, `unpaid`
  - Why: Banner only fires on exact `past_due`. Other failure states have no UI.
  - Evidence: `src/components/billing/AccountBillingPage.tsx:119-133`

- [ ] **C15 — POLISH — `invoice.payment_failed` events not audited** `OPEN`
  - Why: Webhook handler ignores invoice events (only catches `subscription.*`, `subscriptionItem.*`, `user.updated`).
  - Evidence: `convex/billing/webhookHandler.ts:9-14`

- [ ] **C16 — POLISH — Dead `free_user` plan config** `OPEN`
  - Why: `planConfig.ts:38-43` defines a `free_user` tier never rendered (filtered out by `PricingPage.tsx:70`).

- [ ] **C17 — POLISH — Confirm cancel-during-trial doesn't charge** `NEEDS-USER-INPUT`
  - Why: Code calls `clerk.billing.cancelSubscriptionItem(id, { endNow: false })` during trial; behavior depends on Clerk's trial-cancel interpretation.
  - You verify: run a test subscription, cancel before day 7, confirm no charge lands.

---

## Category: Routes / Links

- [x] **R1 — DONE — All internal routes resolve** (audit C verified)
  - 21/21 navigable destinations match a route file. All `navigate(...)` calls use real routes. All anchor IDs exist on the same route.

- [ ] **R2 — HIGH — `support@prodsnap.io` mailbox not verified** `NEEDS-USER-INPUT`
  - Why: Address appears in 6 places (Footer, PricingPage, StepPlan, terms, privacy, landing). DNS / mailbox status unverified.
  - You verify: ensure the mailbox actually receives mail before launch, or change to a known-good address.

---

## Category: Email / Transactional

- [ ] **E1 — HIGH — No transactional email layer wired** `OPEN` + `NEEDS-USER-INPUT`
  - Why: `package.json` has no Resend/Postmark/SendGrid. `convex/lib/` has no `email/` directory. Result: no trial-ending reminders, no generation-complete emails, no card-declined notifications. Currently all auth emails flow through Clerk's hosted email — that's it.
  - You provide: choose provider (Resend recommended); verify sending domain DNS (SPF, DKIM, DMARC). Add `convex/lib/email/` with one action per template.

- [ ] **E2 — HIGH — `prodsnap.io` SPF/DKIM/DMARC not confirmed** `NEEDS-USER-INPUT`
  - Why: Even if Clerk's transactional emails work, sender reputation matters. Without proper DNS, trial-end emails land in spam.
  - You verify: SPF + DKIM + DMARC records exist on `prodsnap.io`.

- [ ] **E3 — HIGH — Branded Clerk email sender not configured** `NEEDS-USER-INPUT`
  - You verify: in Clerk Dashboard → Customization → Emails, set the branded sender + branded domain so users don't see Clerk's default sender.

---

## Category: Domain / DNS

- [ ] **D1 — BLOCKER — Production domain decided & DNS configured** `NEEDS-USER-INPUT`
  - You provide: pick the prod hostname (e.g., `app.prodsnap.io`). Configure DNS in Netlify, set up SSL, decide www→apex (or apex→www) redirect.

---

## Category: Legal

- [ ] **L1 — HIGH — ToS governing-law clause is meaningless** `NEEDS-USER-INPUT`
  - Why: `src/routes/terms.tsx:1-148` says "United States, without regard to conflict of law principles" — needs a specific state to be enforceable.
  - You provide: state of governing law (e.g., Delaware, California). Update the ToS.

- [ ] **L2 — HIGH — ToS missing entity name** `NEEDS-USER-INPUT`
  - Why: ToS doesn't name the legal entity.
  - You provide: entity (e.g., "ProdSnap, a brand of NextTrack LLC"). Update terms.tsx.

- [ ] **L3 — HIGH — Privacy policy sub-processor list may be incomplete** `OPEN` + `NEEDS-USER-INPUT`
  - Why: `src/routes/privacy.tsx` lists Clerk, Convex, R2, fal.ai. If you also use Replicate / OpenAI / Firecrawl / Resend / others, this is incomplete (GDPR exposure).
  - You verify: confirm full sub-processor list against actual usage.

- [ ] **L4 — POLISH — Cookie consent banner** `NEEDS-USER-INPUT`
  - Why: GDPR/ePrivacy/UK-GDPR requires it for EU traffic. Clerk drops auth cookies; future analytics will too.
  - You decide: US-only at launch (skip), or accept EU traffic (add `cookieconsent` or a Mantine consent strip).

---

## Category: Errors / Observability

- [ ] **O1 — BLOCKER — No error reporting (Sentry/equivalent)** `OPEN` + `NEEDS-USER-INPUT`
  - Why: First production crash → no signal. Operator flies blind. Free-tier Sentry handles MVP volume.
  - You provide: Sentry DSN (or BetterStack / Highlight). Wire `@sentry/react` + `@sentry/node` (~30 min wire-up).

- [ ] **O2 — HIGH — No analytics installed** `OPEN` + `NEEDS-USER-INPUT`
  - Why: Can't measure landing→signup→paid funnel, trial→paid conversion. Critical for shape of growth.
  - You provide: PostHog (recommended; doubles as feature-flag platform), Plausible, or GA. Add script in `__root.tsx`.

- [x] **O3 — HIGH — Global `unhandledrejection` + `window.onerror` handlers** `DONE` (placeholder console.warn; ready for Sentry forwarding once O1 wires)
  - Why: Async errors from event handlers / mutation callbacks / background tasks bypass React boundaries → silently lost in prod.
  - Fix: install Sentry (auto-wires both) OR add a tiny global handler in `src/router.tsx`.

- [x] **O4 — HIGH — Per-route `errorComponent` on heavy routes** `DONE` — added on `studio.$productId`, `account.billing`, `library`
  - Why: A loader throw in `studio.$productId` (Convex unauthorised, 404, etc.) loses the whole app shell.
  - Fix: add `errorComponent: ({ error }) => <RouteError error={error} />` to at least `studio.$productId.tsx`, `account.billing.tsx`, `library.tsx`. ~5 LoC each.

- [x] **O5 — HIGH — `window.confirm()` → Mantine `modals.openConfirmModal`** `DONE` — `@mantine/modals` installed; ImageEnhancerModal + 2 studio call sites converted; `<ModalsProvider>` mounted in `__root.tsx`
  - Why: Native confirm blocks JS thread, looks janky on mobile, inconsistent with Mantine `modals.openConfirmModal` used elsewhere.
  - Evidence: `src/components/product/ImageEnhancerModal.tsx:172`, `src/routes/studio.$productId.tsx:3205,3237`
  - Fix: replace with `modals.openConfirmModal({...})`. ~30 min total.

- [x] **O6 — HIGH — Verbose AI logs gated behind `DEBUG_AI=true`** `DONE` — `convex/ai.ts`, `convex/studio.ts`, `convex/urlImportsActions.ts` all gated; error-path logs unchanged
  - Why: Prompt previews + length traces leak user content fragments to anyone with Convex dashboard access; bloat log retention.
  - Evidence: `convex/ai.ts:889,894,922,928,935`; `convex/studio.ts:557,563`; `convex/urlImportsActions.ts:187,228,792`
  - Fix: gate behind `if (process.env.DEBUG_AI === 'true')`. Don't dead-strip — keep available for incident response.

- [x] **O7 — POLISH — Friendly `DefaultCatchBoundary`** `DONE` — friendly message + support mailto; raw error.message only in `import.meta.env.DEV`
  - Why: `src/components/DefaultCatchBoundary.tsx:9-66` renders TanStack `<ErrorComponent>` which dumps raw `Error` to user.
  - Fix: friendly message + ID + `support@prodsnap.io` link. Render `error.message` only when `import.meta.env.DEV`.

- [ ] **O8 — POLISH — Uptime monitoring not set up** `NEEDS-USER-INPUT`
  - You provide: Better Uptime / Pingdom / UptimeRobot pinging `/` and Convex `/api/...`.

---

## Category: Account self-service

- [x] **G1 — HIGH — `/account` index redirects to `/account/billing`** `DONE`
  - Why: User navigating to `/account` directly hits the 404 page. Sidebar only links sub-routes.
  - Fix: add `src/routes/account.index.tsx` that redirects to `/account/billing` or renders a switchboard. ~10 LoC.

- [ ] **G2 — HIGH — User profile lives only in Clerk modal** `OPEN`
  - Why: All profile edits route through `openUserProfile()`. No issue per se, but worth a UX verification that the modal styling matches your brand and doesn't surface Clerk's "Powered by" footer (depends on plan).
  - You verify: open Clerk modal in prod-style env, screenshot, decide if branding needs upgrade.

- [x] **G3 — BLOCKER — `user.deleted` webhook handler shipped** `DONE` — `convex/billing/userDeletion.ts` walks 10 user-scoped tables + R2 cleanup. Still NEEDS-USER-INPUT to subscribe `user.deleted` event in Clerk prod webhook config.
  - Why: User deletes Clerk account → auth row vanishes, but their products, brand kits, generations, R2 image objects, billing rows in your Convex DB stay forever. GDPR Right-to-Erasure violation the moment you have a paying EU customer who churns.
  - Evidence: `convex/billing/webhookHandler.ts:8-13` only handles `subscription.*`, `subscriptionItem.*`, `user.updated`. Grep for `user.deleted` returns zero matches.
  - Fix:
    1. Add `user.deleted` to `isSupportedEvent()` (`convex/billing/webhookHandler.ts:8`)
    2. New `handleUserDeleted` internal action that walks `products`, `brandKits`, `generations`, `urlImports`, `productImages`, `boards` tables for the user, then `deleteFromR2()` for every key referenced
    3. Subscribe `user.deleted` event in Clerk webhook config
    4. Match retention timeline to privacy policy (30d)
  - Effort: half-day. Strongly recommend pre-launch before you accept any payments.

- [ ] **G4 — POLISH — Data export is manual** `OPEN`
  - Why: Privacy at `src/routes/privacy.tsx:90-93` says "to export your data… contact us directly". OK for MVP; add a "Download my data" button later.

---

## Category: Performance / Build / SEO

- [ ] **P1 — HIGH — OG image missing** ⏸ SKIPPED — needs user-supplied 1200×630 PNG asset
  - Why: `src/utils/seo.ts:5-30` only emits og/twitter image meta when an `image` is passed. Root `__root.tsx:75-78` doesn't pass one → social previews are bare.
  - Fix: add `public/og-prodsnap.png` (1200×630), pass `image: '/og-prodsnap.png'` in root `seo()` call.

- [x] **P2 — HIGH — Twitter handle removed from SEO meta** `DONE` — `twitter:creator` and `twitter:site` lines deleted from `src/utils/seo.ts`
  - Why: `src/utils/seo.ts:18-19` is hardcoded to the TanStack template owner.
  - Fix: replace with your handle, or remove the twitter:creator/site lines entirely.

- [x] **P3 — HIGH — `site.webmanifest` populated** `DONE` — name/short_name="ProdSnap", theme_color=#0063ff, background_color=#0B0D10
  - Why: `public/site.webmanifest` shows blanks — looks broken if a user adds-to-home-screen.
  - Fix: set `name`, `short_name`, `theme_color: "#0063ff"`. ~5 min.

- [x] **P4 — POLISH — `robots.txt` shipped** `DONE` — allow `/`, disallow auth-gated paths, sitemap pointer
  - Fix: add `public/robots.txt` with `Allow: /` + `Disallow: /admin /account` + sitemap line.

- [ ] **P5 — POLISH — No `sitemap.xml`** `OPEN`
  - Fix: hand-build for `/`, `/pricing`, `/privacy`, `/terms`. Most marketing pages are gated behind auth.

- [ ] **P6 — POLISH — Bundle is 792KB uncompressed (index)** `OPEN`
  - Why: Mantine + Clerk bundled together. Tolerable for MVP; revisit if LCP suffers.
  - Fix later: code-split `@mantine/dropzone`, `@mantine/notifications` lazily.

- [ ] **P7 — POLISH — Stale template assets** `OPEN`
  - `public/tanstack.png` (~30KB), maybe `public/github-mark-white.png` — check usage and delete if orphan.

- [ ] **P8 — POLISH — Sourcemaps off in prod (current); flip to `'hidden'` when Sentry lands** `OPEN`
  - Without sourcemaps, Sentry stack traces will be minified gibberish.
  - Fix: when O1 ships, flip `vite.config.ts` to `build.sourcemap: 'hidden'` and upload to Sentry separately.

---

## Category: Security

- [x] **S1 — HIGH — CSP header configured** `DONE` — allow-list covers Clerk, Convex, R2, fal.ai, Stripe, Google Fonts
  - Why: `netlify.toml:8-15` has X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy. CSP is missing → any future XSS via user-content render path is unmitigated.
  - Fix: add CSP that allow-lists Clerk + Convex + R2 + fal.ai. Test on staging — CSP is fragile.

- [x] **S2 — HIGH — HSTS pinned** `DONE` — `max-age=31536000; includeSubDomains; preload`
  - Why: Netlify auto-applies a default; pin it explicitly to be safe: `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`

- [x] **S3 — HIGH — Permissions-Policy locks down camera/mic/geo** `DONE`
  - Fix: lock down camera/mic/geolocation since the app doesn't use them: `Permissions-Policy: camera=(), microphone=(), geolocation=()`

- [x] **S4 — HIGH — URL-import rate-limited 10/user/min** `DONE` — `enforceUrlImportRateLimit` in `convex/urlImports.ts`
  - Why: `convex/urlImports.ts` triggers Firecrawl (paid) + LLM analysis. A user could submit 1000 URLs in a loop and burn your Firecrawl credits.
  - Fix: add `enforceRateLimit(ctx, 'url_import', 10, 60)` or similar.

- [ ] **S5 — POLISH — Network-level rate limiting absent** `NEEDS-USER-INPUT`
  - Why: Netlify Edge doesn't auto-rate-limit. Cloudflare in front of Netlify or Netlify Edge Functions would help against signup-form abuse.
  - You decide: ops-level setup if abuse becomes a real signal post-launch.

- [ ] **S6 — POLISH — `BILLING_TRUST_CACHE` 4h trust window** `OPEN`
  - Why: Operator kill switch; if accidentally set in prod, gives free service for hours.
  - Fix: document loudly in `.env.local.example` and the launch runbook: "NEVER set in prod".

---

## Category: Code hygiene

- [x] **H1 — POLISH — `src/utils/posts.tsx` deleted** `DONE`
  - Leftover from TanStack template. Verify no route imports it, then delete (TASKS.md already flagged).

- [x] **H2 — POLISH — Playwright `baseURL` env-driven** `DONE`
  - Fix: `process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'` so any future CI-against-staging works.

- [x] **H3 — POLISH — Explicit `build` block in `vite.config.ts`** `DONE`
  - Fix: `build: { sourcemap: false, minify: 'esbuild' }` + optional `esbuild: { drop: ['console', 'debugger'] }` to strip dev console output. Future-proof against contributor flips.

- [x] **H4 — POLISH — Date formatting uses browser locale** `DONE`
  - `src/components/ads/AdDetailPanel.tsx:122`, `src/routes/studio.$productId.tsx:2578` — pass `undefined` instead.

- [ ] **H5 — POLISH — `convex/board.ts:82` `getBoards` query has no auth check** `OPEN`
  - Why: Public query exposes seed-board state. Likely intentional (boards.ts is described in comments as starter scaffold), but worth a confirmation.
  - You verify: confirm it's intentional. If not, add `requireAuth(ctx)`.

---

## Cross-cutting (already on TASKS.md)

- [x] **X1 — BLOCKER — Mobile responsiveness gap** `DONE` (2026-05-16)
  - Audit pass at 390px (iPhone 14/15 Pro) found most surfaces already responsive thanks to Mantine's `cols={{ base, sm, md }}` API + the recent landing rebuild's `useIsMobile()` usage. Four targeted fixes shipped:
    - `AppShellLayout.tsx`: `CreditsPill` added to mobile header; desktop breadcrumb-area pill hidden on mobile via `visibleFrom="sm"` to prevent duplication
    - `library.tsx`: fixed-width `Select w={220}` → `flex: '1 1 180px'` so filter doesn't overflow at 390px
    - `products.new.tsx`: footer Group wraps now (`wrap="wrap"`) so Cancel+Save buttons reflow vertically on narrow viewports
    - `studio.$productId.tsx`: images grid clips correctly (`width: '100%'`); wizard badge row wraps now (`wrap="wrap"`)
  - Net delta: +17/-9 LOC across 4 files. tsc clean, 72/72 tests, build green.
  - Not blocking — but pending: real-device test pass on a physical iPhone/Android, polish-level refinements that emerge from actual usage.

---

## Category: Verification (added by architect signoff)

- [ ] **V1 — HIGH — End-to-end paid-flow smoke test on staging** `OPEN` + `NEEDS-USER-INPUT`
  - Why: Every individual config item can pass review while the *combination* fails (slug mismatch + trial period + webhook subscription + R2 creds all interacting). Unit-level audits don't catch combinatorial breakage.
  - Procedure: on a staging deploy with real prod-tier credentials, walk all 8 billing flows (sign-up → trial → upgrade → downgrade → cancel → reactivate → card change → webhook receipt) with a real Stripe test card. Verify each Convex `userPlans` row updates correctly and Clerk webhook events round-trip.
  - You drive: half-day effort once A1-A6, B1-B3, C1, C3, D1 are all configured.

- [x] **V2 — HIGH — Convex `/healthz` endpoint** `DONE` — `GET /healthz` returns `{ ok, schemaVersion, deployedAt }` with no auth
  - Why: Uptime monitors pinging the SPA root can't detect Convex outages — a degraded data plane behind a healthy CDN is the silent failure that hurts early users hardest.
  - Fix options:
    - (a) Point UptimeRobot/Better Uptime at `<convex-slug>.convex.cloud/version` (zero-LoC; recommended for v1)
    - (b) Add a `/healthz` httpAction in `convex/http.ts` returning `{ ok: true, schemaVersion, deployedAt }` (~10 LoC; upgrade later if richer probe data is needed)

---

## Recommended sequence

**Week 1 — code-side things I can do without you:**
- A2 (sign-in/sign-up routes), C5 (VITE_BILLING_ENABLED decision), B4 (.env.local.example completeness), H1-H5 (cleanup), O3 (global error handler), O4 (per-route error boundaries), O5 (window.confirm → Mantine modal), O6 (gate AI logs), O7 (friendly catch boundary), P1-P3 (OG image + manifest + twitter handle), P4 (robots.txt), S1-S3 (security headers), S4 (URL-import rate limit), G1 (`/account` index), G3 (`user.deleted` handler skeleton — wired once webhook event added)

**Need from you:**
- A1, A3-A6 (Clerk prod keys + webhook + admin + domain + OAuth choices)
- B1, B2, B3 (Convex prod deployment + BILLING_ENABLED + R2/fal.ai/Firecrawl creds)
- C1 (decide canonical tier shape: solo/studio/agency vs basic/pro)
- C3, C17 (Clerk plan trial config + cancel-during-trial sanity test)
- D1 (prod domain + DNS)
- E1, E2, E3 (email provider + DNS + Clerk branded sender)
- L1, L2, L3 (governing-law state, entity name, sub-processor list)
- L4, O8, S5 (cookie banner decision, uptime monitor, network rate-limit decision)
- O1, O2 (Sentry DSN, analytics provider+key)

**Once you supply the inputs, I do the wiring.** No item in this list is unbounded — each maps to a concrete code change or a single config/credential.
