# Spec 003 — Remove Trellaux / Boards Starter Cruft

**Status:** not started
**Severity:** BLOCKER
**Suggested branch:** `chore/remove-trellaux-boards`
**Source:** `LAUNCH_AUDIT_CLAUDE.md` → C-2
**Blockers / dependencies:**
- **Coordination with Spec 004** — both edit `convex/crons.ts`. Land this one first, or rebase 004 after. (This spec removes the `clear messages table` cron line; 004 adds a new cron.)
- **Coordination with Spec 008** — both may delete leftover public assets. This spec only deletes boards-related files; generic asset deletion (`tanstack.png`, `github-mark-white.png`) is owned by 008. No overlap if that boundary is respected.
- No external blockers. Pure deletion. Safe to start immediately.

---

## Problem

The TanStack "Trellaux" starter's kanban "boards" feature is still live and reachable in prod. `/boards/$boardId` renders a demo board, `convex/board.ts` exposes a **public unauthenticated** `getBoards`/`getBoard` query plus create/update/delete mutations on a single shared board (the code comment says "no per-row ownership check… demo/shared resource"). A `clear messages table` cron wipes & reseeds the boards table every 20 minutes in prod.

## Evidence

- `src/routes/boards.$boardId.tsx` (+ registered in `src/routeTree.gen.ts`)
- `src/components/Board.tsx` (+ Column/NewColumn/Card/NewCard/EditableText/CancelButton/SaveButton/IconLink)
- `convex/board.ts:82-201` — public unauth query + unscoped mutations
- `convex/schema.ts` — `boards`, `columns`, `items` tables
- `convex/crons.ts:6` — `crons.cron('clear messages table', '0,20,40 * * * *', internal.board.clear)`
- `src/queries.ts` — `boardQueries` / `useUpdateBoardMutation` exports
- `package.json` — `dev:db: "convex dev --run board:seed"` (dev-only, remove the `:seed` invocation)

## Scope of work

Delete the entire boards feature and its scheduled job:
1. Remove `src/routes/boards.$boardId.tsx` and `src/components/Board.tsx` (+ all sub-components only used by it).
2. Remove `convex/board.ts`.
3. Remove the `boards`, `columns`, `items` tables from `convex/schema.ts`.
4. Remove the `clear messages table` cron from `convex/crons.ts`.
5. Remove board exports from `src/queries.ts`.
6. Update `package.json` `dev:db` to drop the `board:seed` run (replace with plain `convex dev` or an appropriate no-op).
7. Regenerate the route tree (`src/routeTree.gen.ts`) and Convex bindings.

Verify nothing else imports any of the above before deleting (audit confirmed they're unreferenced, but re-grep to be safe).

## Acceptance criteria

- [ ] `/boards/anything` no longer resolves (route gone).
- [ ] `convex/board.ts` and the three schema tables are gone; `npx convex codegen` succeeds.
- [ ] No `internal.board.*` references remain (crons, queries, components).
- [ ] `grep -ri "board" src/ convex/` returns only unrelated matches (e.g. "dashboard", "keyboard").
- [ ] `dev:db` script runs without the seed.
- [ ] `tsc` clean, 72/72 tests pass, build green.

## Note on schema deletion
Removing tables from `convex/schema.ts` is safe in Convex even if rows exist (the data is simply orphaned/dropped on push for tables no longer in the schema). Since boards is demo data, no migration is needed.
