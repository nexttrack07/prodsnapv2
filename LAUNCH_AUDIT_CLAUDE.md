# Launch Audit — Tasks Claude Can Do Autonomously

**Audited:** 2026-06-07 · **App:** ProdSnap · **Branch:** `launch-ready`
These are pure code/file changes with no external accounts, secrets, or decisions required. I can do every item here on my own. Severity: **BLOCKER** (first users hit it) → **HIGH** (fix before marketing push) → **POLISH** (post-launch ok).

Companion files: `LAUNCH_AUDIT_TOGETHER.md` (needs a decision from you first), `LAUNCH_AUDIT_YOU.md` (only you can do — prod config/secrets/dashboards).

Build status at audit time: ✅ `tsc` clean · ✅ 72/72 vitest · ✅ `pnpm build` green · ✅ billing fence clean · ✅ admin Convex fns all server-guarded.

---

## BLOCKERS

### C-1 — Unauthenticated visitors can sit on `/home` (and every app route) and see a broken app shell
- **Evidence:** `src/routes/home.tsx:44-52` (no `beforeLoad` auth gate); `convex/products.ts:419-420,474-482` (queries return empty/null for anon instead of throwing); `src/routes/__root.tsx:120-123` (`OnboardingGuard`/`BillingSync` mount only inside `<Authenticated>`, so nothing redirects anon users). No `<Unauthenticated>` redirect exists on any app route.
- **User impact:** Anyone with a `/home`, `/studio`, `/library`, `/products`, or `/account` URL (or who logs out and back-navigates) sees the sidebar + "Let's make your first ad" hero as if logged in. Clicking "Create your first product" throws "Not authenticated" as a red error toast. Looks broken.
- **Fix:** Add a centralized route-level auth gate for the `APP_ROUTE_PREFIXES` already listed at `__root.tsx:143-153` — redirect anon → `/sign-in` (via `beforeLoad` or an `<Unauthenticated><Navigate/></Unauthenticated>` wrapper).

### C-2 — Delete the leftover Trellaux "boards" starter feature (writable shared state, no auth)
- **Evidence:** `src/routes/boards.$boardId.tsx` (registered in `src/routeTree.gen.ts`); `src/components/Board.tsx` (+ Column/Card/NewColumn/etc.); `convex/board.ts:82-201` exposes a **public unauthenticated** `getBoards`/`getBoard` query and create/update/delete mutations on a single shared board (comment literally says "no per-row ownership check… demo/shared resource"); schema tables `boards`/`columns`/`items`; `src/queries.ts` board exports. Verified referenced nowhere else in the app.
- **User impact:** `/boards/anything` renders a kanban board with starter "trolling you…" copy; any signed-in user can read/write the shared demo board via the Convex API.
- **Fix:** Delete the route, components, `convex/board.ts`, the three schema tables, `src/queries.ts` board exports, and regenerate the route tree. (See also C-3 — the cron goes with it.)

### C-3 — Generations can hang forever; add a stuck-generation watchdog cron
- **Evidence:** `convex/crons.ts` has no watchdog. Stuck handling is client-only (`src/routes/studio.$productId.tsx:153` `GENERATION_TIMEOUT_MS`, `:2590` `isTimedOut`). In `convex/studio.ts:370-416` only the workflow's *inner* failures mark rows `failed`; a workflow that never starts or is dropped by the workpool leaves the row `queued`/`running` permanently.
- **User impact:** User clicks Generate, the workflow stalls, they reload — the card spins forever with no error, no retry. Looks broken at the aha moment.
- **Fix:** Add a cron (~every 2 min) scanning `templateGenerations` (and angle/prompt generations) where `status in (queued,running)` and older than ~6 min → mark `failed` with a retryable message. No refund needed (charging already happens post-upload).

---

## HIGH

### C-4 — Sentry `tracePropagationTargets` is still the wizard placeholder `yourserver.io`
- **Evidence:** `src/instrument.ts:14` → `['localhost', /^https:\/\/yourserver\.io\/api/]`. Also `tracesSampleRate: 1.0` (100% — quota burn at scale).
- **Fix:** Replace with `['localhost', /^https:\/\/(www\.)?prodsnap\.io/, /\.convex\.cloud/]` and lower `tracesSampleRate` to ~0.2 for launch.

### C-5 — fal.ai 429/503/overload surfaces as a scary raw error
- **Evidence:** `convex/ai.ts:686-749` throws plain `Error('Image model rejected the request…')` with no 429/503 branch; flows into `mapGenerationError` → failed card at `studio.$productId.tsx:2840-2843`.
- **User impact:** During a traffic spike or fal outage (likely during a DM push) users see "rejected the request" instead of "AI is busy, try again."
- **Fix:** Detect fal status 429/503/overloaded in `convex/ai.ts`, throw a typed retryable error, add a friendly branch in `src/lib/billing/mapBillingError.ts`.

### C-6 — Stale "Cancellation scheduled" banner persists after a user resumes
- **Evidence:** `markCancelScheduled` (`convex/billing/syncPlan.ts:427-444`) supports clearing with `null`, but the resume path (`src/components/billing/AccountBillingPage.tsx:160`) only calls `openUserProfile()` — nothing ever clears `cancelScheduledAt`. Banner condition: `AccountBillingPage.tsx:147`.
- **User impact:** User resumes their subscription, returns, and still sees an orange "scheduled to end on X" banner forever. Erodes trust.
- **Fix:** After the Clerk modal closes on resume, call `syncUserPlan()` and clear `cancelScheduledAt` (call `markCancelScheduled` with `null`) when Clerk reports the item active again. Ties into C-7.

### C-7 — Plan change via Clerk hosted UI doesn't eagerly resync (was item C9)
- **Evidence:** `src/components/billing/PlanCard.tsx:84-104` and `AccountBillingPage.tsx:160` call `openUserProfile()` with no close callback; no `syncUserPlan()` fires on return.
- **User impact:** After upgrade/downgrade/resume the app shows the old plan/credits until a webhook/focus/30s debounce — confusing right after paying.
- **Fix:** Pass a close handler to `openUserProfile({...})` (or poll `syncUserPlan()` for ~5s) so plan + credits refresh immediately.

### C-8 — Out-of-credits errors aren't consistently mapped across studio handlers
- **Evidence:** The OOC modal path is correct for primary generate (`studio.$productId.tsx:1584,3369`) and gallery bg-removal (`:1579-1594`), but `handleSetPrimary` (`:1596-1607`), legacy ImageDetail actions, and source-image upload (`:591-597`) dump raw `err.message` to a red toast.
- **Fix:** Route all credit-touching catch blocks through `mapGenerationError`/`mapBillingError` + `OutOfCreditsModal`, matching the existing pattern.

### C-9 — `robots.txt` points at a `sitemap.xml` that 404s
- **Evidence:** `public/robots.txt:12` → `https://prodsnap.io/sitemap.xml`; no `public/sitemap.xml` and no sitemap route exist.
- **Fix:** Hand-build `public/sitemap.xml` for the public routes (`/`, `/pricing`, `/privacy`, `/terms`).

### C-10 — Verify CSP doesn't block DataFast / Sentry origins in prod
- **Evidence:** `netlify.toml:16-18` CSP allow-lists Clerk/Convex/R2/fal.ai/Stripe/Google Fonts but does **not** list DataFast or Sentry domains in `connect-src`/`script-src`. If those load from their own CDNs, CSP silently blocks analytics + error reporting on the live site.
- **Fix:** Verify the loaded origins on a deploy preview; add DataFast + Sentry (`*.ingest.sentry.io`, DataFast CDN) to the CSP.

---

## POLISH

### C-11 — Delete stale starter assets
- `public/tanstack.png` and `public/github-mark-white.png` — zero code references (verified). `rm` both.

### C-12 — Strip/gate leftover server `console.log`s (one leaks prompt content)
- **Evidence:** `convex/ai.ts:924,931,961,978` (`:931` logs a 120-char prompt preview), `convex/studio.ts:593,601`, `convex/billing/syncPlan.ts:645`, `convex/billing/userDeletion.ts:428,515`, `convex/urlImportsActions.ts:233,282,867`.
- **Fix:** Remove or gate behind `if (process.env.DEBUG_AI === 'true')`. Keep error-path logs.

### C-13 — Bound `templates.listPublished` unbounded `.collect()`
- **Evidence:** `convex/templates.ts:183` `.collect()` over all published templates on every `/home` + `/templates` load. Plan targets ~1,500 templates.
- **Fix:** `.take(N)` cap or use the paginated query for the home shelf.

### C-14 — Add `RESEND_API_KEY` to `.env.local.example`
- **Evidence:** Read at `convex/lib/email/index.ts:8,35` but documented nowhere; B4 ("all keys documented") is now stale. (Setting it in prod is a YOU item.)

### C-15 — Minor onboarding polish
- StepRole "Continue" uses a raw `"→"` string (`src/components/onboarding/StepRole.tsx:135`) — swap for `<IconArrowRight size={16}/>` to match other steps.
- StepBusiness can render all of a returning user's brand kits when URL normalization mismatches (`StepBusiness.tsx:359-377`) — show the generic "couldn't pull much" card instead. Harmless on fresh accounts.

### C-16 — Credit reset date can mislead before first Clerk period sync (optional)
- **Evidence:** `convex/billing/syncPlan.ts:497` falls back to "1st of next UTC month"; real reset is Clerk-period-anchored. Label at `AccountBillingPage.tsx:208` + CreditsPill can be off until the first webhook. Self-corrects.
- **Fix (optional):** Suppress the date until `periodEnd` is known.

---

## Verified GOOD (no action — don't worry about these)
- Download path server-fetches blob + red error toast (generation `studio.$productId.tsx:2648`, template `templates.tsx:583`).
- URL-import hang protection: 90s timeout + recovery (`products.new.tsx`).
- Out-of-credits modal is clean (balance, reset date, upgrade CTA); primary generate paths catch `CREDITS_EXHAUSTED`.
- Webhook reliability: Svix verify + idempotency + durable retry queue + drain cron.
- Identity-key drift reconciled; cancel→free hard-zeros allowance; GDPR deletion walks all tables + R2.
- Admin Convex functions all server-guarded (`requireAdmin`/`requireAdminIdentity`); design-lab/templates/prompts/playground spot-checked.
- Security headers (CSP/HSTS/Permissions-Policy) present; webmanifest populated; robots.txt shipped; twitter handle removed.
- Mobile responsiveness, loading skeletons, empty-state CTAs, and error toasts are consistent across the app.
- Support email is consistently `info@prodsnap.io` in shipped code.
