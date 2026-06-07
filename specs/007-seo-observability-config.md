# Spec 007 — SEO + Observability Config

**Status:** completed
**Severity:** HIGH
**Suggested branch:** `chore/seo-observability-config`
**Source:** `LAUNCH_AUDIT_CLAUDE.md` → C-4, C-9, C-10
**Blockers / dependencies:**
- **Partial verification dependency (not a hard blocker):** the CSP fix (C-10) is best *verified* on a Netlify deploy preview to confirm DataFast/Sentry origins load. The code change can be made now defensively; final confirmation needs a preview deploy (a `YOU`-adjacent step, but non-blocking).
- No file overlap with other specs. Safe in parallel.

---

## Problem

Three independent launch-readiness config gaps in SEO + observability.

## Items

### C-4 — Sentry `tracePropagationTargets` is the wizard placeholder
- **Evidence:** `src/instrument.ts:14` → `['localhost', /^https:\/\/yourserver\.io\/api/]`; also `tracesSampleRate: 1.0`.
- **Fix:** Replace targets with `['localhost', /^https:\/\/(www\.)?prodsnap\.io/, /\.convex\.cloud/]`; lower `tracesSampleRate` to ~0.2 for launch.

### C-9 — `robots.txt` references a `sitemap.xml` that 404s
- **Evidence:** `public/robots.txt:12` → `https://prodsnap.io/sitemap.xml`; no sitemap exists.
- **Fix:** Hand-build `public/sitemap.xml` for the public routes (`/`, `/pricing`, `/privacy`, `/terms`). Confirm the host matches the final prod domain (apex vs `app.` — see `YOU` Y-13).

### C-10 — CSP may block DataFast / Sentry in prod
- **Evidence:** `netlify.toml:16-18` CSP omits DataFast + Sentry domains from `connect-src`/`script-src`.
- **Fix:** Add Sentry (`*.ingest.sentry.io` and the SDK CDN if used) and DataFast (its CDN + ingest host) to the CSP `connect-src`/`script-src`. Verify on a deploy preview that analytics + error reporting actually fire.

## Acceptance criteria

- [ ] Sentry traces attach to real prodsnap.io / Convex requests (no `yourserver.io`); sample rate lowered.
- [ ] `public/sitemap.xml` exists, valid XML, lists the public routes, host matches prod domain; `robots.txt` no longer points at a 404.
- [ ] CSP includes DataFast + Sentry origins; on a preview deploy, the browser console shows no CSP violations for analytics/error reporting.
- [ ] `tsc` clean, build green.

## Note
If the final prod hostname (apex `prodsnap.io` vs `app.prodsnap.io`) is still undecided (`YOU` Y-13), the sitemap host can be finalized last — but the rest of this spec can ship now.
