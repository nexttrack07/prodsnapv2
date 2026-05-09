# ProdSnap Launch Checklist

Run through this before flipping DNS to prod, posting on Product Hunt, or announcing on BetaList.

## 1. Clerk production setup + 3-tier pricing rework

The landing page advertises 3 tiers (solo / studio / agency) but the codebase
ships with 2 (basic / pro). Path A is to update the product to match the
landing — bundled with this prod migration so the new tiers ARE the prod
launch.

### Code changes (do BEFORE creating Clerk plans)
- [ ] Update `convex/lib/billing/planConfig.ts`: replace `basic` / `pro`
      entries with `solo` (productLimit 2, monthlyCredits 200), `studio`
      (productLimit 8, monthlyCredits 1000, plus surgical-iteration +
      cross-product-library capabilities), `agency` (productLimit
      Infinity, monthlyCredits 5000, plus priority-support capability)
- [ ] Define new capabilities in `convex/lib/billing/capabilities.ts` if
      needed: `SURGICAL_ITERATION`, `CROSS_PRODUCT_LIBRARY`,
      `PRIORITY_SUPPORT` — only those that the server actually gates on
- [ ] Audit any `requireCapability(...)` call sites for ones that need to
      be added/removed against the new tier matrix
- [ ] Run vitest on `convex/lib/billing/__tests__/billing.test.ts` — adjust
      expected slugs if any test references `basic` / `pro`

### Clerk dashboard (prod)
- [ ] Create prod Clerk application (if not already)
- [ ] Enable Clerk Billing in prod
- [ ] Create plan `solo` with price $39/mo and capabilities matching planConfig.ts
- [ ] Create plan `studio` with price $79/mo (mark as "popular" in Clerk if supported)
- [ ] Create plan `agency` with price $199/mo
- [ ] Verify plan slugs in prod dashboard EXACTLY match convex/lib/billing/planConfig.ts (case-sensitive)
- [ ] Configure email verification ON for new signups
- [ ] Set brand logo + primary color in Clerk appearance settings

### After deploy
- [ ] If any users still exist on the old `basic` / `pro` slugs in dev or a
      pre-launch prod environment, decide migration: refund-and-resubscribe,
      or one-time `userPlans` patch script. Document which.

## 2. Convex prod env vars
Use `npx convex env set --prod <NAME> <VALUE>`:
- [ ] CLERK_SECRET_KEY        (sk_live_... from Clerk prod dashboard)
- [ ] CLERK_JWT_ISSUER_DOMAIN (https://<your-prod-clerk-frontend-api>)
- [ ] CLERK_WEBHOOK_SECRET    (whsec_... from the prod webhook endpoint)
- [ ] CLERK_ADMIN_USER_IDS    (comma-separated prod Clerk user IDs — YOUR user id in prod)
- [ ] BILLING_ENABLED=true
- [ ] FAL_KEY                 (fal.ai API key for image gen / vision)
- [ ] R2_ENDPOINT             (Cloudflare R2 account endpoint)
- [ ] R2_ACCESS_KEY_ID
- [ ] R2_SECRET_ACCESS_KEY
- [ ] R2_BUCKET_NAME          (separate bucket for prod if possible)
- [ ] R2_PUBLIC_URL           (public-facing R2 bucket URL)

## 3. Prod webhook endpoint
- [ ] In Clerk prod dashboard → Webhooks → Add Endpoint
- [ ] URL: https://<prod-convex-slug>.convex.site/webhooks/clerk
  (find prod slug via `npx convex env list --prod` or the Convex dashboard)
- [ ] Subscribe events: subscription.created, subscription.updated, subscription.active, subscriptionItem.past_due, subscriptionItem.canceled, user.updated
- [ ] Copy the signing secret → set CLERK_WEBHOOK_SECRET above
- [ ] Click "Send Example" for subscription.created → verify 200 OK + new row in webhookEvents table
- [ ] If it fails, check the error body (Uncaught errors land here)

## 4. Clerk admin role
- [ ] Set publicMetadata.role = "admin" on your prod Clerk user via Clerk dashboard → Users → YOUR user → Metadata
- [ ] Add your prod Clerk userId to CLERK_ADMIN_USER_IDS (for query/mutation-level admin checks)

## 5. DNS / domain
- [ ] Point prod domain (prodsnap.io or similar) at Netlify
- [ ] Verify SSL is provisioned
- [ ] Update CORS-like env vars if any client makes fetch to an absolute host

## 6. End-to-end smoke test on prod
- [ ] Sign up a fresh test account (your personal Gmail or similar)
- [ ] Click Pricing → pick Basic → complete Clerk checkout with a test card
- [ ] Land on /studio after PostCheckoutInterstitial
- [ ] Verify userPlans row has periodStart/periodEnd/billingStatus populated
- [ ] Upload a product image
- [ ] Generate one variation
- [ ] Verify credit count decremented in CreditsIndicator
- [ ] Go to /account/billing → Cancel subscription (end of period)
- [ ] Verify webhook fired (webhookEvents row + userPlans.billingStatus updated)
- [ ] Kill the account via Clerk UserProfile → verify data disappears from your view

## 7. Legal & trust markers
- [ ] /privacy route renders
- [ ] /terms route renders
- [ ] Footer visible on every page with legal + support links

## 8. Operational ready
- [ ] BILLING_TRUST_CACHE left unset (only flip true during a confirmed Clerk outage)
- [ ] Convex deployment is on a plan that supports the expected traffic (check Convex dashboard billing)
- [ ] R2 bucket has CORS configured for the prod domain (if direct client uploads)
- [ ] A support email inbox is monitored

## 9. Launch-day
- [ ] Double-check BILLING_ENABLED=true on prod
- [ ] Post to BetaList / Product Hunt with a clear "Report issues to support@prodsnap.io" CTA
- [ ] Watch Convex function logs for the first hour (errors, safety-block rate, webhook delivery)
- [ ] Monitor billingEvents table for enforcement denials and period-fallback events

## Rollback
- If something's on fire: `npx convex env set --prod BILLING_ENABLED false` disables all billing enforcement. Auth still required; generations still work but aren't gated.
- If Clerk is down: `npx convex env set --prod BILLING_TRUST_CACHE true` lets existing subscribers keep working for 4h.
