# Spec 005 — Generation Error UX (fal.ai 429/503 + Consistent Out-of-Credits Mapping)

**Status:** not started
**Severity:** HIGH
**Suggested branch:** `fix/generation-error-ux`
**Source:** `LAUNCH_AUDIT_CLAUDE.md` → C-5, C-8
**Blockers / dependencies:**
- **Light coordination with Spec 006** — 006 also touches billing UX but in different files (`AccountBillingPage`, `PlanCard`). This spec owns `mapBillingError.ts` and `studio.$productId.tsx` generation handlers. Safe in parallel.
- No external blockers.

---

## Problem

Two related rough edges at the generation aha-moment:

1. **fal.ai overload errors look scary (C-5).** During a traffic spike or fal outage the user sees a raw "Image model rejected the request…" instead of a friendly "AI is busy, try again."
2. **Out-of-credits errors are inconsistently mapped (C-8).** Primary generate and gallery bg-removal correctly open the Out-of-Credits modal, but several other studio handlers dump raw `err.message` into a red toast.

## Evidence

- `convex/ai.ts:686-749` — throws plain `Error('Image model rejected the request…')` / `'Model did not return an image URL'`, no 429/503 branch
- `src/routes/studio.$productId.tsx:2840-2843` — failed-card renders mapped error
- `src/lib/billing/mapBillingError.ts` — `mapGenerationError` lives here
- Correct OOC pattern: `studio.$productId.tsx:1584,3369`
- Raw-error handlers to fix: `handleSetPrimary` (`:1596-1607`), legacy ImageDetail actions, source-image upload (`:591-597`)

## Scope of work

**Part A — fal.ai overload handling:**
- In `convex/ai.ts`, detect fal error status `429`/`503`/overloaded and throw a typed, retryable error (distinct code).
- Add a friendly branch in `mapGenerationError` (`src/lib/billing/mapBillingError.ts`) → "AI is busy right now — please try again in a moment."

**Part B — consistent OOC mapping:**
- Route every credit-touching catch block in `studio.$productId.tsx` (set-primary, ImageDetail actions, source-image upload, any other generate/bg-remove call) through `mapGenerationError`/`mapBillingError` + open `OutOfCreditsModal`, matching the existing pattern at `:1584`.

## Acceptance criteria

- [ ] A simulated fal 429/503 surfaces as the friendly "AI is busy" message + Retry, not raw model text.
- [ ] Every studio handler that can throw `CREDITS_EXHAUSTED` opens the Out-of-Credits modal (no raw red toasts for credit errors).
- [ ] Non-credit, non-overload errors still show their mapped message.
- [ ] `tsc` clean, tests pass, build green.
