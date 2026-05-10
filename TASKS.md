# Tasks

Living tracker. Mark `[x]` when done; leave context behind so future-you can pick it up cold.

**Status legend:** `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked

Group by surface area. Within each section: ordered roughly by priority (top = most important).

---

## Mobile responsiveness (top priority — cross-cutting)

- [ ] **Make the entire app mobile-friendly** — current state is desktop-only. Most sections use inline `gridTemplateColumns` like `'1fr 2fr'`, `'1fr 1fr 1fr'`, `'repeat(4, 1fr)'` with no `@media` queries. Phones get cramped or broken layouts. Audit needed across:
  - Landing page (`src/routes/index.tsx`) — every section: Hero, Loop, Split, Onramps, VOC, Surgical, FeatureGrid, Pricing, FAQ, FinalCTA, Footer
  - Wizard (`src/routes/studio.$productId.tsx`) — variation drawer, generation gallery, template picker
  - Admin templates page (`src/routes/admin.templates.tsx`) — already disabled mobile per audit, but consider enabling
  - Templates browse page (`src/routes/templates.tsx`)
  - Library, products, home, checkout, onboarding routes
  - Approach: either `useMediaQuery('(max-width: 768px)')` per component + conditional grid columns, OR a CSS media-query layer in `src/styles/app.css`. Mantine's `useMediaQuery` is already imported in the sidebar — extend the pattern.

---

## Landing page (`src/routes/index.tsx`)

### Performance / polish

- [ ] **Hero source resolution** — `harrys-background-removed.png` is 338×600. The source card now renders ~410px square (1fr 2fr split), so the image scales UP and looks blurry on retina. Re-export the cut-out at 800×800 minimum.
- [ ] **Section 6 narrative break** — Section 6 (`SurgicalSection`) uses Cole Haan sneakers while the rest of the page uses Harry's hydrating night lotion. If you want a single product through-line, regenerate Section 6 examples with Harry's color/text variants. Otherwise leave it as a "another customer's example."
- [ ] **Footer link list grows as public pages ship** — current footer shows only Contact / Privacy / Terms (the 3 functional ones). Stripped Product / Resources / Company / Legal columns to avoid pretending placeholder labels were links. Append new entries inline as Changelog / Docs / About / Customers / Press kit / Security / DPA pages ship.

---

## Wizard / template grid (`src/routes/studio.$productId.tsx`)

- [ ] **Verify "scroll past 24" bug is gone** — replaced masonic with CSS-columns + hardened IntersectionObserver. Spot-check by selecting Templates, scrolling past the first page, confirming the next 24 render and pre-fetch fires before reaching bottom.
- [ ] **Other masonic instance at `~line 2220`** — there's another `<Masonry>` in the file outside the wizard's templates segment. If users hit similar virtualization bugs there, swap it the same way.

---

## Pricing rework (handled in launch checklist)

The 3-tier landing pricing (solo / studio / agency at $39/$79/$199) doesn't match the 2-tier code (basic / pro). Fix is bundled with the Clerk dev→prod + Convex dev→prod migration in `.omc/runbooks/launch-checklist.md` section 1. Don't duplicate here.

---

## Admin / templates (`src/routes/admin.templates.tsx` + backend)

Already-shipped audit findings: see `.omc/audit-canonical.md`. Remaining open items from the canonical list:

- [ ] **L4 — schema typed unions for tag fields** — `convex/schema.ts:193-203` uses `v.optional(v.string())` for productCategory / primaryColor / etc. Convert to `v.union(...PRODUCT_CATEGORIES.map(c => v.literal(c)))` for DB-level enum enforcement. Blocked on confirming no existing rows have stale values that would fail the schema migration.
- [ ] **L5 — `lastTransitionAt` for stuck detection** — schema field + UI surface "Stuck for Ns" past a threshold. ~1 hr; deferred from the audit.
- [ ] **N3 — `getExistingHashes` index optimization** — currently a full table collect; not painful at 100-template scale, but will matter past ~1k. Move to indexed scan when it bites.
- [ ] **N8 — Bulk delete progress notification** — `admin.templates.tsx:665-683` deletes sequentially with no progress UI. Add running counter notification.
- [ ] **N9 — Retag-progress effect handles deleted-row mid-retag** — edge case, low priority.

---

## Convex backend / billing

- [ ] **Migrate plain `Error` throws to `billingError(code, ...)` consistently** — already done for billing layer (commit `1238278`). Walk other Convex functions and convert remaining string-matched throws to structured errors as you touch them.
- [ ] **Resurrect-transient-failures cron (deferred from billing audit)** — proposed in the user's "outbox pattern" thread. Not active. Revisit if fal.ai outages start producing many `failed` rows.

---

## Documentation

- [ ] **README is stale** — root `README.md` still describes the Trellaux demo. Replace with: one-paragraph product description, env-var checklist (Clerk, Convex, R2, Firecrawl, Replicate/OpenAI/Fal), `pnpm dev` / `pnpm test` / `pnpm test:e2e` / `pnpm check:billing-fence` reference, link to ROADMAP.md.
- [ ] **`docs/setup.md` for new contributors** — env-var requirements, Clerk + Convex + R2 setup steps, like the convex-saas template's docs/README.md.
- [ ] **Email layer (Resend + React Email)** — flagged in convex-saas gap analysis. Generation-complete / credits-low / trial-ending / subscription-updated transactional emails. Wire when ready.
- [ ] **Account deletion path** — also from convex-saas gap analysis. Walk user-scoped tables + R2 delete on Clerk delete-on-request webhook. GDPR liability once you have churned paying users.

---

## Done

Items resolved this thread (kept for record):

- [x] **Fake logo strip** (Section 1 Hero) — removed entirely along with "trusted by media buyers" copy and the [tbd] caption. (this thread)
- [x] **"See it on a sample brand" CTA** (Section 1 Hero) — removed the dead button. (this thread)
- [x] **Fake "v3.4.0 · all systems normal" footer indicator** — removed. (this thread)
- [x] **Hero subtitle "6 distinct concepts" → "12 distinct variants"** — aligned with FinalCTA's "twelve variants per batch" and the actual product output. (this thread)
- [x] **Loop section step 02 "→ 6 concepts" → "→ 12 variants"** — same alignment. (this thread)
- [x] **FAQ Q4 brand kit answer** — softened from "each product gets its own brand kit" + "10 kits" to "each brand keeps its own kit" with the Studio/Agency tier limits inline. (this thread)
- [x] **Multi-URL onboarding claim** — confirmed accurate by user, no action needed.
- [x] **gpt-image-2 model name** — confirmed accurate by user (info was stale; OpenAI did release gpt-image-2).
- [x] **LIBRARY route claim** — confirmed `src/routes/library.tsx` exists. No action.
- [x] **OUTPUT multi-format export claim** — confirmed accurate by user, no action needed.
- [x] **Hero PNG weights** — user accepted current sizes (~10.9 MB total). No action.

---

## How to use this file

- Add new tasks under the right section. If unsure, drop into a `## Misc` section at the bottom.
- Each task should have **enough context to action without re-reading this whole conversation** — file paths, line numbers, what success looks like.
- When you finish a task, change `[ ]` → `[x]` and move it to the `## Done` section at the bottom (so we have a record).
- For multi-step tasks, nest sub-bullets.
