# Step 6 — Rollout Checklist

**Time estimate:** 2–4 hours of active work over a 2-week window (pre-announcement email, phased deploys, monitoring).

## Prerequisites
- All code stories (US-002 through US-016) merged to master
- `tests/billing-gates.test.ts` passing in CI
- Step 0 spike documented as PASSED
- Step 2 dashboard configured in BOTH dev and production Clerk instances

## Chosen rollout strategy

**Option X (default, customer-friendly):** comp every current user a free 30-day Basic subscription before flipping enforcement. Change to Option Y only if the user base is tiny (≤10 users) or internal-only.

---

## Phase 1 — Development (already covered during implementation)

Tests pass, Clerk dev gateway works, Stripe test cards exercise success + decline paths. Should already be green before reaching this phase.

## Phase 2 — Staging

1. Deploy `feat/clerk-billing` merge commit to a Netlify preview branch.
2. Ensure the preview env has:
   - `VITE_BILLING_ENABLED=true`
   - Convex staging deployment has `BILLING_ENABLED=true` set
3. Use a real Stripe account in **test mode** for the staging Clerk instance.
4. Run through all E2E paths:
   - Happy path subscribe (Basic + Pro, monthly + annual)
   - Card decline (`4000000000000002`)
   - Checkout interstitial → JWT refresh → redirect
   - Credit quota exhaustion on Basic (generate 101 times)
   - Retry counts against quota
   - Subscription expiry / past_due handling
5. Verify `billingEvents` table populates correctly (Convex dashboard).
6. Verify `/account/billing` shows current plan and allows cancellation.

**Gate:** Do NOT proceed to production until staging E2E is clean.

## Phase 3 — Production cutover (Option X)

### Two weeks before cutover
- Send an email to all existing users announcing pricing, feature changes, and the complimentary Basic grant. Include FAQ.
- Target date for cutover: `YYYY-MM-DD`.

### The day before cutover
- Send a reminder email (24 hours out).
- Pre-warm: make sure Convex production deployment has `BILLING_ENABLED` env var defined but set to `false`. UI env var `VITE_BILLING_ENABLED` is set to `true` (already deployed), but enforcement is off.

### Cutover day

Do this in order — each step is reversible until the last.

1. **Grant complimentary Basic subscriptions** to every current user via Clerk admin API. Two options:
   - Via Clerk Dashboard UI (one-by-one — viable for small user base)
   - Programmatically via Clerk Backend API (`POST /v1/users/{id}/billing/subscriptions`) — required for >50 users. Use a 30-day coupon or mark as complimentary in Clerk's pricing dashboard.
2. **Verify** subscriptions attached: sample 10 users, check their `pla` claim via an admin-only Convex query or Clerk Dashboard.
3. **Flip the server-side kill switch**: set `BILLING_ENABLED=true` in Convex production dashboard. Enforcement now live.
4. **Deploy any final UI tweaks** that require a rebuild (if needed). Netlify auto-deploys from master.
5. **Send launch announcement email** ("ProdSnap pricing is live — your free Basic month has started").
6. **Monitor continuously for 24 hours** against the thresholds below.

### Monitoring thresholds (first 24-48 hours)

| Metric | Threshold | Action |
|---|---|---|
| Convex error rate on billing-gated mutations | >2% over 1h | Investigate; consider rollback |
| Stripe payment failure rate | >15% | Rollback |
| % of comped users who actively used Basic | <40% in 48h | Normal (ramp-up) — don't rollback; adjust comms |
| % conversion to paid by day 30 (Option X) | — | Retention metric; feeds pricing decisions |
| Support tickets: "can't access after paying" | >5/day | Rollback |
| Support tickets: "out of credits" (new signal) | >10/day in first 30 days | Accelerate credit top-up follow-up |

### Rollback (two levels)

**Instant (server-side):** Set `BILLING_ENABLED=false` in Convex dashboard. No rebuild needed. All feature gates pass. Users keep their Clerk subscriptions.

**Full (server + UI):** Also set `VITE_BILLING_ENABLED=false` in Netlify and redeploy. All billing UI surfaces disappear.

---

## Phase 3 — Alternative (Option Y, hard cutover)

Choose only if user base is tiny or internal.

1. Send 7-day advance email ("subscriptions required starting DATE").
2. On cutover day, flip both `BILLING_ENABLED=true` (Convex) and verify `VITE_BILLING_ENABLED=true` (Netlify).
3. Users without an active subscription hit `/pricing` redirect on next protected action.
4. Monitor with the same thresholds.

---

## Acceptance criteria

- [ ] Pre-announcement email sent ≥7 days before cutover (Option X: 14 days)
- [ ] Option chosen and documented (X or Y)
- [ ] Option X: all existing users have a complimentary Basic subscription BEFORE `BILLING_ENABLED` flips
- [ ] `BILLING_ENABLED=true` set in Convex production dashboard
- [ ] Monitoring dashboards open and active for 24-48 hours post-cutover
- [ ] Rollback procedure tested on staging before production cutover
- [ ] Launch announcement email sent
- [ ] Day-30 retention report captured for pricing review
