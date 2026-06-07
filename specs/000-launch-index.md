# Launch Specs — Index & Parallelization Map

**Created:** 2026-06-07 · Derived from `LAUNCH_AUDIT_CLAUDE.md` (the Claude-autonomous items).
Each spec below is one unit of work = one branch = one PR. Update the **Status** line in each spec file as work progresses.

Status values: `not started` · `in progress` · `completed`

| Spec | Title | Severity | Status | Suggested branch | Safe to start now? |
|---|---|---|---|---|---|
| [002](002-auth-route-gate.md) | Auth gate on app routes | BLOCKER | not started | `fix/auth-route-gate` | ✅ yes |
| [003](003-remove-trellaux-boards.md) | Remove Trellaux/boards cruft | BLOCKER | not started | `chore/remove-trellaux-boards` | ✅ yes |
| [004](004-stuck-generation-watchdog.md) | Stuck-generation watchdog cron | BLOCKER | not started | `fix/stuck-generation-watchdog` | ⚠️ coordinate with 003 (both edit `convex/crons.ts`) |
| [005](005-generation-error-ux.md) | Generation error UX (fal 429/503 + OOC mapping) | HIGH | not started | `fix/generation-error-ux` | ✅ yes |
| [006](006-billing-self-service-resync.md) | Billing resync + stale cancel banner | HIGH | not started | `fix/billing-self-service-resync` | ✅ yes |
| [007](007-seo-observability-config.md) | SEO + observability config | HIGH | not started | `chore/seo-observability-config` | ✅ yes (one sub-item needs a deploy preview to verify) |
| [008](008-launch-cleanup-polish.md) | Launch cleanup & polish batch | POLISH | not started | `chore/launch-cleanup-polish` | ⚠️ coordinate with 003 (both delete starter assets) |

## Parallelization notes (what collides with what)

- **003 ↔ 004:** both modify `convex/crons.ts`. Merge **003 first**, then rebase 004 — or do them in the same branch. Otherwise expect a small conflict on the crons list.
- **003 ↔ 008:** both delete leftover public assets (`tanstack.png`, `github-mark-white.png`). 003 owns the boards-related deletes; 008 owns the generic asset deletes. Kept separate, but if both touch the same `rm`, the second branch's delete is a no-op conflict — trivial to resolve. To be safe, **008 leaves asset deletion to whichever lands first.**
- **005 ↔ 006:** 005 touches `studio.$productId.tsx` + `mapBillingError.ts`; 006 touches `AccountBillingPage.tsx` + `PlanCard.tsx`. Minimal overlap (`mapBillingError.ts` only edited by 005). Safe in parallel.
- **002** is isolated (routing/guard) — safe with everything.

## Recommended order for launch eve

1. **003** (pure deletion, zero risk) — merge immediately.
2. **002** (auth gate — highest blast radius, review carefully) in parallel.
3. **004** after 003 lands (crons.ts coordination).
4. **005, 006, 007** in parallel any time.
5. **008** last (or after 003) — low-risk polish.

## Not in these specs
- `TOGETHER` items (need your decision) → `LAUNCH_AUDIT_TOGETHER.md`
- `YOU` items (prod config/secrets/DNS) → `LAUNCH_AUDIT_YOU.md`
- None of the specs below are blocked by a `YOU`/`TOGETHER` item except where explicitly noted (007's CSP verification benefits from a deploy preview).
