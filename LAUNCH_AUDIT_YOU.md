# Launch Audit — Tasks Only You Can Do

**Audited:** 2026-06-07 · **App:** ProdSnap · **Branch:** `launch-ready`
These require an external dashboard, an API secret, DNS, a payment test, or a design asset — things I have no access to. Companion files: `LAUNCH_AUDIT_CLAUDE.md` (I do alone), `LAUNCH_AUDIT_TOGETHER.md` (decide, then I code).

Most use the Convex CLI: `npx convex env set --prod KEY value`.

---

## BLOCKERS (do before any real user signs up)

### Y-1 — Verify Clerk Billing plans are published correctly  ⚠️ highest-risk item
- **Why:** The onboarding plan step (`StepPlan.tsx`) renders Clerk's `<PricingTable>`. If plans aren't published with the right slugs/trial, the final conversion step shows blank or wrong-priced plans — or **charges users immediately despite the "7-day free trial" promise** (chargeback + trust disaster on day one).
- **Do in Clerk prod dashboard:**
  - Plans published with slugs exactly `lite`, `pro`, `max` (not solo/studio/agency).
  - Prices: Lite $29.99, Pro ~$60, Max $129.
  - `trial_period_days = 7` on each paid plan.

### Y-2 — Set `RESEND_API_KEY` in prod Convex
- **Why:** Email code (`convex/lib/email/index.ts:8,35`) fails **soft** — if the key is unset, trial-ending and payment-failed emails silently no-op. You won't know they're missing.
- **Do:** `npx convex env set --prod RESEND_API_KEY re_...`

### Y-3 — Subscribe the `user.deleted` webhook event in Clerk
- **Why:** The deletion handler is shipped (`convex/billing/userDeletion.ts` — walks all user tables + R2), but it only fires if Clerk sends the event. Without it, a churned EU customer's data lingers → GDPR violation.
- **Do:** In the Clerk prod webhook config, add `user.deleted` (alongside `subscription.*`, `subscriptionItem.*`, `user.updated`).

---

## HIGH (before the marketing/DM push)

### Y-4 — End-to-end paid-flow smoke test on a prod-config deploy  ⚠️ single highest-leverage check
- **Why:** Slugs + trial + webhook + R2 + email can each pass review while the *combination* breaks. Only a live run catches it.
- **Do:** With real Clerk prod keys + a Stripe test card, walk: sign-up → trial starts → upgrade → downgrade → cancel → resume → card change → confirm each `userPlans` row updates and the Clerk webhook round-trips. Confirm the trial-ending Resend email actually lands (and isn't in spam).

### Y-5 — Confirm cancel-during-trial charges $0
- **Why:** `cancelMySubscription` calls Clerk with `endNow:false` (`syncPlan.ts:392`); trial-cancel behavior depends on Clerk. Code path looks right; needs live proof.
- **Do:** Start a trial, cancel before day 7, confirm no charge lands.

### Y-6 — Email sender DNS for `prodsnap.io` (SPF / DKIM / DMARC)
- **Why:** Resend sends from `info@prodsnap.io`. Without verified DNS, trial/payment emails land in spam or bounce.
- **Do:** Verify the domain in the Resend dashboard and add the SPF + DKIM + DMARC records it gives you.

### Y-7 — Branded Clerk email sender
- **Do:** Clerk Dashboard → Customization → Emails → set branded sender + domain so users don't see Clerk's default sender.

### Y-8 — Set `BILLING_ENABLED=true` explicitly in prod
- **Why:** Default is fail-closed (enforced unless explicitly `false`), but set it so intent is documented and can't be flipped accidentally.
- **Do:** `npx convex env set --prod BILLING_ENABLED true`

### Y-9 — Clerk prod: whitelist the production domain + pick OAuth providers
- **Do:** Clerk Dashboard → Domains → whitelist the prod hostname (else `<ClerkProvider>` throws). Clerk → User & Authentication → Social Connections → enable Google/etc. if you want OAuth buttons.

### Y-10 — Confirm the prod template library is seeded with published templates
- **Why:** Template-first is the primary UX. The home "Start from a proven format" shelf only renders if there are `status:'published'` templates (`home.tsx:111`). An empty library makes the dashboard look bare and removes the main on-ramp.
- **Do:** Verify published templates exist in prod (use the admin templates page / bulk import).

---

## POLISH (fine shortly after launch)

### Y-11 — Supply a 1200×630 OG social card → `public/og-prodsnap.png`
- Once you give me the asset, I wire it (see `LAUNCH_AUDIT_TOGETHER.md` T-6).

### Y-12 — Uptime monitoring
- A `/healthz` endpoint already exists. Point UptimeRobot / Better Uptime at it + the SPA root.

### Y-13 — Confirm hostname consistency (apex vs `app.` subdomain)
- `robots.txt`, email links, and privacy all hardcode `https://prodsnap.io` (apex). If the app actually lives on `app.prodsnap.io`, the sitemap/robots/canonical point at the wrong origin. Confirm the final host so I can align them.

### Y-14 — (Optional) Subscribe `invoice.payment_failed` in Clerk
- Payment-failure email already rides on `subscription.past_due`, so users are notified. This only adds invoice-level audit granularity. Add the event if you want it; I'll handle the branch.

### Y-15 — Network-level rate limiting (Cloudflare / Netlify Edge)
- Post-launch ops decision; add if signup-form abuse becomes a real signal.

### Y-16 — Visually verify the Clerk profile modal branding in prod
- Open `openUserProfile()` in a prod-style env; confirm it matches your brand and doesn't show a "Powered by Clerk" footer (depends on plan).

---

## Already done (verified in code — you do NOT need to redo these)
Clerk prod keys/webhook/admin IDs · Convex prod deployment · R2/fal/Firecrawl creds · Sentry installed · DataFast analytics installed · transactional email wired (trial-ending + payment-failed) · security headers (CSP/HSTS/Permissions-Policy) · webmanifest · robots.txt · governing law (Texas) · `/healthz` · durable webhook retry queue · GDPR deletion handler.
