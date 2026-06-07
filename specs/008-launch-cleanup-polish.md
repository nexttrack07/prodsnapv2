# Spec 008 — Launch Cleanup & Polish Batch

**Status:** completed
**Severity:** POLISH
**Suggested branch:** `chore/launch-cleanup-polish`
**Source:** `LAUNCH_AUDIT_CLAUDE.md` → C-11, C-12, C-13, C-14, C-15, C-16
**Blockers / dependencies:**
- **Coordination with Spec 003** — both can delete leftover public assets (`tanstack.png`, `github-mark-white.png`). To avoid a double-delete conflict, **003 does not touch generic assets; this spec owns them.** If 003 lands first and happens to remove them, this spec's asset step becomes a no-op — fine.
- No external blockers. Lowest-risk batch; good for a single quick PR.

---

## Problem

A grab-bag of low-risk polish + hygiene items. Bundled into one PR because each is tiny.

## Items

### C-11 — Delete stale starter assets
- `public/tanstack.png`, `public/github-mark-white.png` — zero code references. `rm` both.

### C-12 — Strip/gate leftover server `console.log`s (one leaks prompt content)
- `convex/ai.ts:924,931,961,978` (`:931` logs a 120-char prompt preview), `convex/studio.ts:593,601`, `convex/billing/syncPlan.ts:645`, `convex/billing/userDeletion.ts:428,515`, `convex/urlImportsActions.ts:233,282,867`.
- Remove or gate behind `if (process.env.DEBUG_AI === 'true')`. Leave error-path logs.

### C-13 — Bound `templates.listPublished` unbounded `.collect()`
- `convex/templates.ts:183` `.collect()` over all published templates on every `/home` + `/templates` load. Add a `.take(N)` cap (or use the paginated query for the home shelf).

### C-14 — Document `RESEND_API_KEY` in `.env.local.example`
- Read at `convex/lib/email/index.ts:8,35` but undocumented. Add to the server-side block. (Setting it in prod is a `YOU` item, Y-2.)

### C-15 — Minor onboarding polish
- `src/components/onboarding/StepRole.tsx:135` — raw `"→"` rightSection → `<IconArrowRight size={16}/>`.
- `StepBusiness.tsx:359-377` — when URL normalization mismatches, show the generic "couldn't pull much" card instead of dumping all of a returning user's brand kits.

### C-16 — Credit reset date can mislead before first Clerk period sync (optional)
- `convex/billing/syncPlan.ts:497` falls back to "1st of next UTC month"; label at `AccountBillingPage.tsx:208` + CreditsPill can be off until the first webhook. Suppress the date until `periodEnd` is known. (Lowest priority — drop if time-constrained.)

## Acceptance criteria

- [ ] Stale assets removed (or already gone via 003).
- [ ] No prompt-content `console.log` in server code paths; remaining debug logs gated.
- [ ] `listPublished` bounded.
- [ ] `RESEND_API_KEY` documented in `.env.local.example`.
- [ ] Onboarding arrow icon consistent; StepBusiness fallback corrected.
- [ ] (Optional) Reset-date label suppressed until known.
- [ ] `tsc` clean, 72/72 tests pass, build green.
