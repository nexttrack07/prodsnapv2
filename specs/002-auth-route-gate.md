# Spec 002 — Auth Gate on App Routes

**Status:** completed
**Severity:** BLOCKER
**Suggested branch:** `fix/auth-route-gate`
**Source:** `LAUNCH_AUDIT_CLAUDE.md` → C-1
**Blockers / dependencies:** None. Safe to start immediately and run in parallel with all other specs.

---

## Problem

Unauthenticated visitors can hit `/home`, `/studio`, `/library`, `/products`, and `/account` and see the full app shell (sidebar, breadcrumbs, "Let's make your first ad" hero) as if logged in. Convex queries return empty/null for anonymous users instead of throwing, and the `OnboardingGuard`/`BillingSync` only mount inside `<Authenticated>` — so nothing redirects an anon user away. Clicking "Create your first product" then throws "Not authenticated" as a red error toast. Looks broken.

## Evidence

- `src/routes/home.tsx:44-52` — no `beforeLoad`/auth gate
- `convex/products.ts:419-420,474-482` — queries return empty/null for anon
- `src/routes/__root.tsx:120-123` — guards mount only inside `<Authenticated>`
- `src/routes/__root.tsx:143-153` — `APP_ROUTE_PREFIXES` already enumerated here

## Scope of work

Add a single centralized auth gate that redirects unauthenticated users to `/sign-in` for all app (non-marketing, non-public) routes. Reuse the existing `APP_ROUTE_PREFIXES` list. Implement via `beforeLoad` redirect or an `<Unauthenticated><Navigate to="/sign-in"/></Unauthenticated>` wrapper at the layout level — whichever fits TanStack Start's auth-state availability cleanly (Clerk auth state must be resolved before redirecting to avoid bouncing mid-load).

Keep marketing/public routes (`/`, `/pricing`, `/privacy`, `/terms`, `/sign-in`, `/sign-up`, `/onboarding`) accessible to anon users.

## Acceptance criteria

- [ ] Logging out then navigating to `/home` (or any app route) redirects to `/sign-in`, not a broken shell.
- [ ] No flash of the authenticated app shell before redirect (gate resolves before render where possible).
- [ ] Authenticated users are unaffected; deep links into `/studio/$id` still work when signed in.
- [ ] Public/marketing routes remain reachable while signed out.
- [ ] `tsc` clean, build green.

## Out of scope
- The onboarding "pending user trapped" behavior (that's a `TOGETHER` decision, T-3).
- Post-sign-up redirect destination (T-4).
