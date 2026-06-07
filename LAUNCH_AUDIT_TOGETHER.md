# Launch Audit — Tasks That Need Your Input First

**Audited:** 2026-06-07 · **App:** ProdSnap
Each remaining item needs a **product/copy/design decision from you**, then I do the coding. Companion files: `LAUNCH_AUDIT_CLAUDE.md` (I do alone), `LAUNCH_AUDIT_YOU.md` (only you can do).

---

## ✅ Completed
- **T-1** — "Try with a sample" demo on-ramp (PR #21; needs one-time `setSampleSourceProduct` after deploy)
- **T-2** — credit display: intentionally skipped (fine as-is)
- **T-4** — sign-up now redirects to `/onboarding` (not `/home` → no redirect flash)
- **T-5** — privacy sub-processor list completed (Stripe/Firecrawl/Resend/Sentry/DataFast)
- **T-6** — OG share image wired (absolute URLs, all routes)
- **T-7** — "Start free trial" CTA added to marketing header + mobile drawer
- **T-8** — default SEO + drawer tagline aligned to the landing's media-buyer positioning

---

## Still open — need your call

### T-3 — A user who starts onboarding but doesn't subscribe is trapped on `/onboarding`
- **Evidence:** first step auto-creates a `pending` profile; `OnboardingGuard.tsx:38-45` force-redirects them to `/onboarding` from `/` and everywhere outside the allow-list, on every future visit. Only escape is Sign out.
- **Why I didn't just do it:** conversion-critical funnel behavior — changing it unilaterally could hurt trial signups.
- **Decision I need:** let pending users browse `/` and `/templates` freely, OR add a visible "Explore first / I'll do this later" exit on the wizard? (Or both.)

### T-9 — Confirm the legal entity name
- **Evidence:** `terms.tsx:37` + `privacy.tsx:31` say **"Nexttrack, Inc. (operating as ProdSnap)"**; saved memory references **"NextTrack LLC."** Inc. vs LLC is a real legal distinction.
- **Decision I need:** the exact registered entity + type. Then I fix both files (one-word change). *(Governing law already set to Texas.)*

### T-10 — Admin routes only guard client-side (optional, defense-in-depth)
- **Evidence:** `admin.tsx` redirects non-admins via `useEffect`, not `beforeLoad` — admin UI briefly renders before redirect. **Not a security hole** (every admin Convex fn is server-guarded), purely cosmetic.
- **Why I didn't just do it:** a `beforeLoad` guard reading Clerk role under SSR is finicky; not worth the risk for a cosmetic gain unless you want it.
- **Decision I need:** want it, or leave as-is?

### T-11 — Cookie consent banner
- **Evidence:** none present; Sentry replay + DataFast + Clerk all set cookies.
- **Decision I need:** US-only at launch (skip it) or accept EU traffic (I add a Mantine consent strip)? *(Also in `LAUNCH_AUDIT_YOU.md`.)*
