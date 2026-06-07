# Spec 006 — Billing Self-Service: Eager Resync + Stale Cancel Banner

**Status:** not started
**Severity:** HIGH
**Suggested branch:** `fix/billing-self-service-resync`
**Source:** `LAUNCH_AUDIT_CLAUDE.md` → C-6, C-7
**Blockers / dependencies:**
- **Light coordination with Spec 005** — different files; safe in parallel.
- No external blockers. (Live verification of the flows is a separate `YOU` item, Y-4/Y-5, but the code work here is unblocked.)

---

## Problem

Two related defects after a user changes their subscription through Clerk's hosted UI:

1. **Plan change doesn't eagerly resync (C-7, was audit C9).** After upgrade/downgrade/resume via `openUserProfile()`, the app shows the old plan/credits until a webhook, focus event, or 30s debounce fires — confusing right after paying.
2. **Stale "Cancellation scheduled" banner (C-6).** After a user resumes, `cancelScheduledAt` is never cleared, so the orange "scheduled to end on X" banner persists indefinitely.

## Evidence

- `src/components/billing/PlanCard.tsx:84-104` — `openUserProfile()` with no close callback
- `src/components/billing/AccountBillingPage.tsx:160` — resume path only calls `openUserProfile()`
- `src/components/billing/AccountBillingPage.tsx:147` — banner condition `cancelScheduledAt && (...)`
- `convex/billing/syncPlan.ts:427-444` — `markCancelScheduled` already accepts `null` to clear

## Scope of work

1. Pass a close handler to `openUserProfile({ ... })` in `PlanCard` and the resume path in `AccountBillingPage` that fires `syncUserPlan()` on return (and/or polls for ~5s) so plan + credits refresh immediately. Webhook remains the backstop.
2. On resume, after the modal closes and Clerk reports the subscription item active again, clear `cancelScheduledAt` (call `markCancelScheduled` with `null`) so the banner disappears.

## Acceptance criteria

- [ ] After changing plan in the Clerk modal, the app reflects the new plan/credits within a few seconds without a manual refresh.
- [ ] After resuming a scheduled-cancel subscription, the "Cancellation scheduled" banner clears on return.
- [ ] No regression to the existing webhook-driven sync (it still works if the eager path is missed).
- [ ] `tsc` clean, tests pass, build green.

## Out of scope
- The live paid-flow smoke test and cancel-during-trial verification (`YOU` items Y-4, Y-5).
