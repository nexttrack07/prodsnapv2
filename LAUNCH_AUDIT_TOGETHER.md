# Launch Audit — Tasks That Need Your Input First

**Audited:** 2026-06-07 · **App:** ProdSnap · **Branch:** `launch-ready`
Each item needs a **product/copy/design decision from you**, then I do the coding. I've framed each as a specific question so you can answer fast. Companion files: `LAUNCH_AUDIT_CLAUDE.md` (I do alone), `LAUNCH_AUDIT_YOU.md` (only you can do).

---

## BLOCKER (activation)

### T-1 — No demo / "Try with sample" product → cold users must upload before seeing anything work
- **Evidence:** `src/routes/home.tsx:370-415` empty hero only offers "Create your first product" → `/products/new`. No sample/demo path anywhere.
- **Why it matters:** A cold-DM visitor lands on an empty dashboard and must find a product URL/photo, fill a 7-field form, and wait for analysis + generation before seeing a single result — far past the "1 minute or bounce" window. This is the #1 activation killer.
- **Decision I need:** Supply (or approve) a **sample product** — one product image + name + niche/brand copy (e.g. a Harry's-style razor or a skincare bottle). Should it be pre-analyzed so the user can hit Generate instantly, or analyze on demand?
- **Then I:** add a "Try with a sample product" button to the empty hero, a seed mutation in `convex/products.ts`, and route into its studio. *(Asset is a YOU item; wiring is mine.)*

---

## HIGH

### T-3 — A user who starts onboarding but doesn't subscribe is trapped on `/onboarding` forever
- **Evidence:** First step auto-creates a `pending` profile (`StepRole.tsx:93` → `onboardingProfiles.ts:54-69`); `OnboardingGuard.tsx:38-45` then force-redirects them to `/onboarding` from `/` and everywhere outside the allow-list, on every future visit. Only escape is Sign out.
- **Why it matters:** A non-technical store owner evaluating the product who bails at the plan step can never get back to the marketing site or browse — feels like a hostage situation.
- **Decision I need:** Let pending users browse `/` and `/templates` freely, OR add a visible "Explore first / I'll do this later" exit on the wizard? (Or both.)
- **Then I:** relax the force-redirect at `OnboardingGuard.tsx:39-42` and/or add the exit affordance.

### T-4 — Two inconsistent post-sign-up destinations cause a visible redirect flash
- **Evidence:** `router.tsx:71-73` + `sign-up.tsx:14` force **`/home`** after sign-up; but landing CTAs point to **`/onboarding`** (`index.tsx:244,1581,1726`). A `/sign-up` user lands on `/home`, then OnboardingGuard bounces them to `/onboarding` (flash).
- **Decision I need:** If onboarding is mandatory, set sign-UP redirect → `/onboarding` (keep sign-IN → `/home`)? Or make onboarding optional?
- **Then I:** set `signUpForceRedirectUrl`/`<SignUp forceRedirectUrl>` accordingly.

### T-5 — Privacy policy sub-processor list is incomplete (GDPR exposure)
- **Evidence:** `src/routes/privacy.tsx:67-80` lists only Clerk, Convex, Cloudflare R2, fal.ai. Actually in use but missing: **Firecrawl** (URL import), **Resend** (email — processes addresses), **Sentry** (`sendDefaultPii: true` + session replay), **DataFast** (analytics, identifies users), **Stripe** (via Clerk Billing).
- **Decision I need:** Confirm the full sub-processor list (and whether you keep `sendDefaultPii: true` in Sentry).
- **Then I:** add the missing entries to `privacy.tsx`.

### T-6 — Social share image (OG) is just the logo, and missing on most pages
- **Evidence:** Landing passes `image: '/prodsnap_logo.png'` (11KB logo, not 1200×630); root `__root.tsx:75-79` passes no image → privacy/terms/pricing/sign-in previews are bare.
- **Decision I need:** A proper **1200×630 OG card** (this is a YOU asset — see `LAUNCH_AUDIT_YOU.md`). Approve the concept/copy for it.
- **Then I:** wire `image: '/og-prodsnap.png'` into the root `seo()` so all routes inherit it.

---

## POLISH

### T-7 — Marketing header has no "Start free trial" CTA, only a low-contrast "Sign In"
- **Evidence:** `src/components/layout/MarketingLayout.tsx:66-72`. On `/pricing`, `/privacy`, `/terms` the only action is "Sign In" — a brand-new user won't click that.
- **Decision:** Add a primary "Start free trial" (→ `/onboarding`) to the header + mobile drawer? **Then I add it.**

### T-8 — Brand voice is inconsistent between the new landing and the app chrome
- **Evidence:** `__root.tsx:76-78` default SEO + `MarketingLayout.tsx:118` drawer tagline still say the old "Pro-quality product photos in a snap / pick Facebook-ad templates"; landing now positions as a "performance creative co-pilot for media buyers" (`index.tsx:21-23`).
- **Decision:** Give me the canonical one-line positioning. **Then I align** the tab title, social description, and drawer tagline.

### T-9 — Confirm the legal entity name
- **Evidence:** `terms.tsx:37` + `privacy.tsx:31` say **"Nexttrack, Inc. (operating as ProdSnap)"**; your saved memory references **"NextTrack LLC."** Inc. vs LLC is a real legal distinction.
- **Decision:** Tell me the exact registered entity + type. **Then I** fix both files (one-word change). *(Governing law is already set to Texas — resolved.)*

### T-10 — Admin routes only guard client-side (defense-in-depth, optional)
- **Evidence:** `src/routes/admin.tsx` redirects non-admins via `useEffect`, not `beforeLoad` — the admin UI briefly renders before redirect. **Not a security hole** (every admin Convex function is server-guarded), purely cosmetic.
- **Decision:** Want a `beforeLoad` guard for polish? **Then I add it.**

### T-11 — Cookie consent banner
- **Evidence:** None present; Sentry replay + DataFast + Clerk all set cookies.
- **Decision:** US-only at launch (skip it) or accept EU traffic (I add a Mantine consent strip)? *(Also noted in `LAUNCH_AUDIT_YOU.md`.)*
