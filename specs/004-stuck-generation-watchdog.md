# Spec 004 — Stuck-Generation Watchdog Cron

**Status:** completed
**Severity:** BLOCKER
**Suggested branch:** `fix/stuck-generation-watchdog`
**Source:** `LAUNCH_AUDIT_CLAUDE.md` → C-3
**Blockers / dependencies:**
- **Coordination with Spec 003** — both edit `convex/crons.ts`. Prefer landing 003 first, then rebase this; or do both in one branch. The conflict is trivial (adjacent lines in the cron list) but real.
- No external blockers.

---

## Problem

Generations can hang forever with no server-side reconciliation. Stuck-state handling is purely client-side (a timeout that only runs while the tab is open). The Convex workflow's *inner* try/catch marks rows `failed`, but a workflow that never starts or is dropped by the workpool leaves the row `queued`/`running` permanently. A user who clicks Generate, hits a stall, and reloads sees a card that spins forever — no error, no retry.

## Evidence

- `convex/crons.ts` — no watchdog job exists
- `src/routes/studio.$productId.tsx:153` `GENERATION_TIMEOUT_MS`, `:2590` `isTimedOut` — client-only
- `convex/studio.ts:370-416` — only inner workflow failures mark rows `failed`; `markGenerationRunning` and scheduling failures sit outside the catch

## Scope of work

Add an internal mutation + cron (~every 2 minutes) that:
1. Scans `templateGenerations` (and the angle/prompt generation tables if they share the same hang risk) for rows with `status in ('queued','running')` whose `startedAt`/`_creationTime` is older than a threshold (~6 minutes).
2. Marks them `failed` with a user-friendly, retryable error message (e.g. "Generation timed out — please try again").

No refund logic needed: charging already happens *after* the durable upload, so a stuck row was never billed.

Confirm the failed state renders the existing failed-card UI with a Retry affordance in studio.

## Acceptance criteria

- [ ] New internal mutation marks stale `queued`/`running` generations as `failed` with a retryable message.
- [ ] New cron registered in `convex/crons.ts` running every ~2 min.
- [ ] Threshold is a named constant, comfortably above the real generation time (fal calls can take a while) to avoid killing in-flight work — verify against `GENERATION_TIMEOUT_MS`.
- [ ] A manually-stuck row (set to `running` with an old timestamp) flips to `failed` on the next cron tick and shows Retry in the UI.
- [ ] `tsc` clean, tests pass, build green.

## Open question to resolve during implementation
- Confirm whether `angleGenerations` and `promptGenerations` have the same orphan risk or already self-heal; include them in the sweep only if they can also be left stuck.
