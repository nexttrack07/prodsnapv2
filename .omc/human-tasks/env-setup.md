# Environment Variables — Clerk Billing

Two kill switches cover the UI and enforcement layers independently. They are intentionally NOT the same variable — the UI one is build-time (Vite), the server one is runtime (Convex).

## Matrix

| Variable | Scope | Where set | Type | Default |
|---|---|---|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | Client | `.env.local` (dev) and Netlify dashboard (prod) | build-time | required |
| `VITE_BILLING_ENABLED` | Client UI | `.env.local` (dev) and Netlify dashboard (prod) | build-time (Vite string-replace) | `false` |
| `CLERK_SECRET_KEY` | Server | Convex dashboard → Settings → Environment Variables | runtime | required |
| `CLERK_JWT_ISSUER_DOMAIN` | Server | Convex dashboard → Settings → Environment Variables | runtime | required |
| `BILLING_ENABLED` | Server enforcement | Convex dashboard → Settings → Environment Variables | runtime (no rebuild needed) | `false` |

## Semantics

- `VITE_BILLING_ENABLED` — when `'true'`, the app renders `/pricing`, `/checkout`, `/account/billing` routes and the nav link; when anything else, those routes render a "Billing temporarily unavailable" interstitial and the nav links are hidden. Flipping this requires a Netlify rebuild.
- `BILLING_ENABLED` — when `'true'`, `requireCapability()`, `requireProductLimit()`, and `requireCredit()` enforce gates; when anything else, they short-circuit to allow (fail-open kill switch). Flipping this in the Convex dashboard is instant — no rebuild, no redeploy.

## Setup

### Development

```bash
# .env.local (create if missing)
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_BILLING_ENABLED=true
```

```
# Convex dashboard (dev deployment)
CLERK_SECRET_KEY=sk_test_...
CLERK_JWT_ISSUER_DOMAIN=https://your-app.clerk.accounts.dev
BILLING_ENABLED=true
```

### Production

```
# Netlify → Site configuration → Environment variables
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
VITE_BILLING_ENABLED=true
```

```
# Convex dashboard (prod deployment)
CLERK_SECRET_KEY=sk_live_...
CLERK_JWT_ISSUER_DOMAIN=https://your-app.clerk.accounts.com
BILLING_ENABLED=true    # Flip to 'false' for instant rollback
```

## Rollback

Fastest path: flip `BILLING_ENABLED=false` in the Convex production dashboard. All feature gates pass immediately. No rebuild. Users keep their Clerk subscriptions (Clerk is unaffected — only our enforcement is off).

Full UI hide: additionally set `VITE_BILLING_ENABLED=false` in Netlify and redeploy. All billing surfaces disappear. Takes ~2 min for build.

## Version pinning

`@clerk/react` is pinned to exact `6.4.2` (no `^` or `~`). Upgrading:
1. Bump both `@clerk/react` and any transitive `@clerk/clerk-react` together via `pnpm add @clerk/react@x.y.z`.
2. Run full E2E billing regression on the custom /pricing, /checkout, /account/billing flows.
3. Merge as a dedicated PR — never mix a Clerk bump with other changes.
