# Open Questions

## Clerk Billing Integration - 2026-04-21

- [ ] **JWT claim exposure in Convex UserIdentity** -- Do Clerk's custom `pla` and `fea` JWT claims appear in `ctx.auth.getUserIdentity()` by default, or does a Custom JWT Template need to be configured in the Clerk Dashboard? This is the blocking spike (Step 0). The entire server-side enforcement approach depends on this answer.

- [ ] **Exact plan pricing** -- The plan suggests $19/mo (Pro) and $49/mo (Business). These are placeholder prices. The user needs to confirm final pricing before configuring the Clerk Dashboard.

- [ ] **Feature granularity for generation limits** -- Should free users have any generation capability at all (e.g., 5 generations/month), or is generation entirely locked behind paid plans? Currently the plan assumes free users can do basic generation (exact mode, 1 variation) but not variations or batch generation.

- [ ] **Premium template tagging** -- Which existing templates in the `adTemplates` table should be marked as premium (available only with `advanced-templates` feature)? This requires either a new `isPremium` boolean field on `adTemplates` or a separate mechanism. The plan assumes UI-only gating for templates in v1 (all templates are queryable, but premium ones show a lock overlay for free users). Server-side template gating would require a schema change.

- [ ] **HD output dimensions** -- What resolution constitutes "HD output"? The plan mentions 2048px but the current generation pipeline dimensions are not explicitly gated. Need to confirm whether the image generation API supports resolution as a parameter and what the cost difference is.

- [ ] **Free tier generation rate limit** -- Should free users have a per-month generation cap (e.g., 10 generations/month)? This would require usage tracking (a counter in Convex, reset monthly), which is not in the current plan scope. If needed, it should be a separate follow-up task.

- [ ] **`@clerk/react` version compatibility** -- Current version is `^6.4.2`. Need to verify that this version includes `PricingTable` and `Show` with billing support (the `has({plan:...})` and `has({feature:...})` overloads). If not, an upgrade may be needed before pinning.

- [ ] **Annual pricing display** -- Clerk supports annual billing. Should ProdSnap offer annual pricing from day one, or launch with monthly only? Annual pricing requires configuring both monthly and annual prices per plan in the Clerk Dashboard.

- [ ] **`billingEvents` table TTL/cleanup policy** -- The append-only audit log will grow unbounded. Need to decide on a retention policy (e.g., 90 days, 1 year) and whether to implement TTL via scheduled Convex function or manual cleanup. Not blocking for launch but should be addressed within 3 months.

- [ ] **Scalar claim vs boolean limit features** -- Current design uses 3 boolean features (`max-products-3`, `max-products-25`, `unlimited-products`) to encode a scalar product limit. A scalar `publicMetadata` claim (e.g., `maxProducts: 25`) would eliminate dual-limit edge cases and precedence logic. Tradeoff: requires Clerk custom claims setup vs using built-in feature booleans. Document as ADR follow-up.

- [ ] **Board mutations auth gap ownership** -- `convex/board.ts` has 7 unguarded public mutations. Step 1 adds `requireAuth()` to them as a security prerequisite. Confirm this does not break any existing board functionality that may rely on unauthenticated access (e.g., public boards, shared links).
