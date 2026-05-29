# ProdSnap + Quilt Stack — Master Launch Plan

**Date:** 2026-05-29
**Goal:** First 100 customers on ProdSnap; $100k combined MRR across ProdSnap + Quilt Stack by June 2027.
**Strategy:** Parallel-track — ProdSnap distribution starts now while Quilt Stack research happens via Outrank.so. Quilt Stack build kicks off Day 60.

Effort key: M=minutes, H=hours, D=days, W=weeks, C=continuous.

---

## Runtime Bug Audit (2026-05-29)

Code-verified audit of the live user flows (signup → onboarding → upload → template → generate → result → pay) for **actual runtime errors a real user hits** — not TypeScript/lint. Every item below was confirmed by reading the source; file:line refs included. Severity: **P0** = money/data correctness (charged with no result, or charged twice, or paid-but-can't-use); **P1** = broken/confusing flow; **P2** = minor/edge/scale.

### P0 — money correctness

- [x] **[P0] Double-charge + no-refund on AI generation.** ✅ FIXED 2026-05-29. Reordered all 3 generation actions to charge *after* the durable R2 upload, and routed charging through a new idempotent `chargeForGenerationInternal` mutation guarded by a `creditCharged` flag on the `templateGenerations` row. A failed upload now never bills; a workflow retry can't re-bill (second pass sees the flag and skips). Files: `convex/schema.ts` (`creditCharged` field), `convex/lib/billing/chargeMutation.ts`, `convex/ai.ts` (`generateFromTemplate` ~821, `generateFromAngle` ~1021, `generateVariation` ~1221). _(Original cause: charged before upload, non-idempotent, `retryActionsByDefault: true` in `convex/studio.ts:24`. Note: `removeBackground` at ai.ts:1357 already charged post-upload and runs outside the retrying workflow, so it was left as-is.)_
- [x] **[P0] Credit-balance keying asymmetry — a paid user can show 0 credits.** ✅ FIXED 2026-05-29. Added `reconcileClerkKeyedBilling` to `convex/billing/syncPlan.ts`, called at the end of `writePlan` (the first place both the canonical `tokenIdentifier` and the raw `clerkUserId` are known). On every client sync it migrates/merges any `clerkUserId`-keyed `creditBalances` row onto the canonical key (absorbing purchased top-up so nothing paid-for is lost) and deletes the orphan `clerkUserId`-keyed `userPlans` row so future webhooks converge on the canonical row. _(Original cause: webhook grants under raw `clerkUserId` when no mapping exists yet, but charge/read key by `tokenIdentifier`.)_

### P1 — broken or confusing flows

- [x] **[P1] Out-of-credits users get a red "failed generation" instead of a clean message.** ✅ FIXED 2026-05-29. Added a `requireCredits` pre-flight (now batch-aware via a `units` multiplier) to all three primary submit mutations — `products.generateFromProduct`, `products.generateVariations`, `angleGenerations.submitAngleGeneration`, `promptGenerations.submitPromptGeneration` — so an out-of-credits user is rejected up front with a clean `CREDITS_EXHAUSTED` before any fal.ai work runs. _(Legacy `studio.submitRun` intentionally left for the separate P2 item below.)_
- [x] **[P1] Product stuck "analyzing" forever.** ✅ FIXED 2026-05-29. Moved the `imageUrl` guard inside the try/catch in `runProductAnalysis` (and the deprecated `runBackgroundRemoval`) so a missing image now marks the product `failed` instead of throwing into the void. File: `convex/products.ts`.
- [x] **[P1] Onboarding plan step can render blank on mobile Safari.** ✅ FIXED 2026-05-29. Wrapped the Clerk `PricingTable` in a `Suspense` (loader fallback) **and** a `PricingErrorBoundary` that falls back to a "View plans" button linking to `/pricing` if the embedded table fails to mount, plus a persistent "Open the pricing page" escape link below it. File: `src/components/onboarding/StepPlan.tsx`.
- [x] **[P1] Onboarding URL-scrape can spin forever.** ✅ FIXED 2026-05-29. Added a 90s `SCRAPE_TIMEOUT_MS` safety timer in `StepBusiness.tsx`: when the scraping phase exceeds it, any non-terminal import is forced to `failed`, so the existing transition logic runs (preview if any succeeded, else back to input with a toast). Covers deleted/null import rows and dead backend actions.
- [x] **[P1] Paid users can get trapped post-checkout.** ✅ FIXED 2026-05-29. `SubscriptionRequired` now self-heals: when signed in with no visible plan it proactively calls `syncUserPlan` once (pulling the plan from Clerk) before redirecting, and the grace window was bumped 3s→6s to allow that round-trip. A just-paid user arriving via bookmark/direct nav now gets their plan confirmed instead of bounced to `/pricing`. The `PostCheckoutInterstitial` already had retry/refresh/continue affordances; this closes the loop on its "Continue to Studio" path. File: `src/components/billing/SubscriptionRequired.tsx`.
- [x] **[P1] Embedded-subscribe onboarding completion.** ✅ FIXED 2026-05-29; HARDENED 2026-05-29. The onboarding `PricingTable` redirected to `/home` without ever calling `completeOnboarding`, causing a brief `/home → /onboarding → /home` bounce until the paid-plan rescue caught up. The table now redirects to `/onboarding?subscribed=1`, but the query param is only a UI hint: `finalizeOnboardingAfterCheckout` verifies an active paid Clerk subscription server-side, writes/syncs the plan, applies credits, and only then marks onboarding complete. Failure shows retry/pricing recovery instead of an infinite loader. Files: `convex/onboardingProfiles.ts`, `src/components/onboarding/StepPlan.tsx`, `src/routes/onboarding.tsx`.
- [x] **[P1] Credit grants are no longer webhook-only.** ✅ FIXED 2026-05-29. `syncUserPlan` and `syncUserPlanInternal` now call the idempotent credit-grant path after a paid plan sync, so a paid user is not dependent on Clerk webhook delivery before their `creditBalances` row exists. File: `convex/billing/syncPlan.ts`.
- [x] **[P1] Generation rate limit counted the wrong events.** ✅ FIXED 2026-05-29. Submit mutations now record `billingEvents.context='usage'` with `units` equal to the batch size, and `enforceGenerationRateLimit` sums recent units instead of raw row count. This makes the advertised 20/min generation density check apply before work is queued. Files: `convex/products.ts`, `convex/angleGenerations.ts`, `convex/promptGenerations.ts`, `convex/studio.ts`.
- [x] **[P1] `/products/new` URL import could spin forever.** ✅ FIXED 2026-05-29. Added the same 90s timeout/recovery pattern as onboarding: stuck imports are released with an orange toast and the user can retry or upload manually. File: `src/routes/products.new.tsx`.
- [x] **[P1] Variation generation trusted client-supplied image URLs.** ✅ FIXED 2026-05-29. `generateVariations` now verifies source generation ownership/readiness and derives both the source image URL and product image URL server-side from owned records, ignoring client-provided URL values for AI input. File: `convex/products.ts`.
- [x] **[P1] Public admin prompt enhancer was ungated.** ✅ FIXED 2026-05-29. `convex/ai.ts:enhancePrompt` now requires server-side admin auth before calling the text model, closing the unauthenticated cost-abuse path.

### P2 — minor / edge / scale

- [x] **[P2]** ✅ FIXED 2026-05-29. `studio.matchTemplates` now requires identity + run ownership (same error for missing/non-owned to avoid leaking run ids); `studio.submitRun` now runs `enforceGenerationRateLimit` + a `requireCredits` pre-flight. (Both are legacy paths unused by the current UI, but still publicly callable.) File: `convex/studio.ts`.
- [x] **[P2]** ✅ FIXED 2026-05-29. `listProducts` bounds its generation scan with `.take(5000)` (was unbounded `.collect()`) so a power user can't blow the Convex read limit and error out the whole products page; per-product count is approximate beyond the cap. `getFocusProduct` was already bounded (`.take(1000)`), left as-is. File: `convex/products.ts`.
- [x] **[P2]** ✅ FIXED 2026-05-29. Delete-last-image now uses in-app `navigate({ to: '/home' })` instead of `window.location.href` (no full reload). File: `src/routes/studio.$productId.tsx`.
- [x] **[P2]** ✅ FIXED 2026-05-29. Template download failure now shows a red error toast instead of only `console.error`. File: `src/routes/templates.tsx`.
- [x] **[P2]** ✅ FIXED 2026-05-29. `uploadFromUrl` now enforces a 25 MB cap (Content-Length pre-check + post-buffer backstop) on the fal→R2 path to bound timeout/OOM risk. File: `convex/r2.ts`.

### Investigated and dismissed (do NOT spend time here)

- **"Auth doesn't propagate from actions to `runQuery`/`runMutation`"** — FALSE. Convex propagates identity through `ctx.runQuery`/`runMutation`. "Suggest prompts" and "save inspiration from URL" (`src/routes/studio.$productId.tsx:3135`, `:4838`) are shipped and working.
- **`boards/$boardId` invariant crash** — not reachable: the route is a leftover from the Trellaux template and is **not linked anywhere** in the app.

---

## Tier 1 — Must fix before any cold DM (~2–3 focused days)

These bite skeptical first-time visitors immediately. Do these before driving any cold traffic.

- [ ] **[30M]** Verify `creditPricing` prod rows match locked spec ($29.99/50cr · $60/150cr · $129/400cr; 1cr=std gen, 3cr=premium, 1cr=BG). Write a Convex admin query to dump rows; compare to spec. Closes biggest unknown, gates everything else.
- [ ] **[10M]** Create branded `u/prodsnap_faadhil` Reddit account + join r/shopify, r/ecommerce, r/Entrepreneur, r/dropship, r/EcommerceMarketing. **Karma takes 2–3 weeks to mature — every day delayed = a day delayed on DMs. Start today.**
- [x] **[3H]** ✅ DONE 2026-05-29. Credit charging moved *after* the durable upload + `creditCharged` idempotency flag added to block retry double-charge (no separate refund path needed since we no longer charge before the output exists). See the **Runtime Bug Audit → P0 "Double-charge + no-refund"** item above for the full implementation. The single P0 launch blocker — now closed.
- [ ] **[5H]** Pre-seed demo product (e.g., Harry's-style) + "Try with sample" button in empty-state hero. File: `src/routes/home.tsx:370`. Activation killer if missing — cold-DM users won't upload before seeing the tool work.
- [x] **[2H]** ✅ DONE 2026-05-29. Clerk PricingTable wrapped in Suspense + error boundary with a `/pricing` fallback button and a persistent escape link. See **Runtime Bug Audit → P1 "Onboarding plan step can render blank on mobile Safari"** above. File: `src/components/onboarding/StepPlan.tsx`.
- [ ] **[15M]** Promote onboarding Step 2 "Skip" to equal visual weight as Continue. File: `src/components/onboarding/StepBusiness.tsx`.
- [ ] **[1H]** End-to-end mobile Safari smoke test: signup → onboarding → upload product → pick template → generate → see result → pay → confirm Resend trial-end email lands. Use a fresh email + real test card.
- [ ] **[5M]** Send test email to `info@prodsnap.io` from outside; confirm receipt + phone push notification.

---

## Tier 2 — Day 1 parallel setup (alongside Tier 1)

- [ ] **[10M]** Subscribe to Outrank.so; configure for ProdSnap blog domain.
- [ ] **[4H]** **Build Convex blog CMS:**
  - Add `blogPosts` table to `convex/schema.ts` (slug, title, markdownBody, metaDescription, ogImageUrl, publishedAt, status, tags, readingTimeMinutes, outrankArticleId for idempotency)
  - HTTP action in `convex/http.ts` accepting Outrank webhook (validate shared secret; pull external images into R2 and rewrite markdown URLs)
  - `src/routes/blog.index.tsx` (paginated listing) + `src/routes/blog.$slug.tsx` (renderer)
  - `src/routes/sitemap.xml.ts` (auto-emit from `blogPosts` query)
  - Add markdown rendering stack: `react-markdown` + `remark-gfm` + `rehype-highlight` + `rehype-slug` + `rehype-autolink-headings` + `@tailwindcss/typography`
  - Configure Outrank webhook URL to point at the Convex action
- [ ] **[30M]** Build outreach tracking sheet — columns: source, profile/thread, message sent, reply Y/N, signup Y/N, paid Y/N.
- [ ] **[1H]** Draft 3 DM templates (Reddit / Twitter-X / LinkedIn) + 5 comment-response templates. Personalized hook; mention product only when directly asked.
- [ ] **[2H]** Sentry alert on fal.ai error rate spike (uses existing Sentry integration from commit `4be282c`). Without this, an AI outage during a DM push is invisible until conversions drop.

---

## Tier 3 — Daily ongoing during karma build (Days 4–17)

- [ ] **[C, daily]** Comment in 5 target subs without mentioning ProdSnap. 9:1 helpful:promotional. 5–10 comments/day, 14–21 day window.
- [ ] **[W, part-time]** Template library expansion toward 1,500 templates (NOT 10k). Order: skincare → supplements → beauty → food → apparel. Use existing bulk import script. Scrape Pinterest / behance / ecom ad swipe files.
- [ ] **[30M]** Set up daily DataFast dashboard review habit (bounce rate, time-to-first-gen, trial conversion rate).
- [ ] **[2H]** Add Resend "first generation completed" celebration email + 24h "haven't generated yet" nudge.

---

## Tier 4 — Polish during outreach (week 1–2 of DMs)

- [ ] **[1H]** Add fal.ai 429/503 detection → user-friendly "AI is busy, try again" message. File: `convex/ai.ts:679-706`.
- [ ] **[3H]** Server-side admin auth guards on Convex functions called from `src/routes/admin.*`.
- [ ] **[30M]** Grep landing page for hardcoded `$29.99` / `$60` / `$129`; replace with `PLAN_CONFIG` references.
- [ ] **[10M]** Alias `support@prodsnap.io` → `info@` OR update Footer to use `info@` consistently.

---

## Tier 5 — DM execution (begins Day 14–18)

- [ ] **[C]** Start mentioning ProdSnap in Reddit comments where directly relevant ("what tool did you use?" context). Keep 9:1 ratio.
- [ ] **[C]** Begin Twitter/X DMs (30–60 personalized/day) to people complaining about Shopify product photos / ecom ad creative.
- [ ] **[C]** Daily DataFast + Sentry review; iterate funnel based on real DM drop-off points.

---

## Tier 6 — Competitive differentiation (weeks 4–8)

- [ ] **[1W]** Ship **Angles & Hooks meta-discovery layer** using existing `angleType` schema field. ProdSnap's response to Magritte's strongest UX idea (psychological-lever discovery: "Sold Out → Back in Stock," "Chart Comparison," "X Reasons," etc.). Position as "AI Templates" — Magritte has this as "coming soon"; ship while they're still building.
- [ ] **[3–5D]** Ship **swipe file / saved collections** feature. Table stakes vs Magritte.

---

## Tier 7 — Programmatic SEO (month 2–3)

- [ ] **[2D]** Add `seoPages` Convex table + parameterized `(category)-(useCase).tsx` route. Seed 500 long-tail landing pages from data + AI generation (e.g., "AI ad generator for skincare brands" × N categories × M use-cases). Distinct second content track from Outrank editorial blog.

---

## Tier 8 — Quilt Stack horizon (Day 60+)

- [ ] **[Day 60 hard deadline]** Begin Quilt Stack MVP build regardless of how much Outrank research remains. 60-day window is the cap on "study Outrank before building."
- [ ] **[Decision]** Quilt Stack stack choices: AWS KMS vs app-layer encryption for BYOK keys; Replicate as primary provider; no credit system.

---

## Calendar shape

| Window | Focus |
|---|---|
| Days 1–3 | Tier 1 (must-fix-before-DM) + Tier 2 (setup), in parallel |
| Days 4–17 | Tier 3 (daily karma + template library + monitoring) + Tier 4 (polish in slack time) |
| Days 18+ | Tier 5 (DM execution) continues + Tier 3 work |
| Weeks 4–8 | Tier 6 (Angles UI + swipe file) shipped in parallel with outreach |
| Day 60 | Tier 7 (Quilt Stack build kicks off) |

---

## Open decisions to make as you go

- [ ] Free hook tool for ProdSnap (Magritte playbook) — should ProdSnap launch a free background remover or free product photo enhancer as a top-of-funnel acquisition asset?
- [ ] Quilt Stack: flat $99 single tier in MVP vs two tiers $99/$199?
- [ ] Quilt Stack: free public LLM-visibility audit at quiltstack.com/check as acquisition wedge?
- [ ] Programmatic SEO: which category × use-case matrix to seed first?

---

## References (saved memory)

- Growth goal: $100k combined MRR by June 2027; first 100 customers
- Acquisition strategy: cold DMs + Reddit comments + SEO + Google Ads ≤$30/day
- Credit system locked: $29.99/50cr · $60/150cr · $129/400cr
- Convex stays (not switching)
- BYOK shelved for ProdSnap; confirmed for Quilt Stack (Replicate-first)
- No build-in-public on Twitter/X
- ProdSnap primary UX is template-first
- Outrank.so dual-use: ProdSnap SEO tool + Quilt Stack competitive research, 60-day cap
- Magritte competitive intel: 30k curated ads, $39–$229/mo, AI Templates "coming soon" → ProdSnap's open lane. Estimated MRR ~$30–70k (1 year old, free-origin)
