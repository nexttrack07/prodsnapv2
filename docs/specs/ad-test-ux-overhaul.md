# Prodsnap Engineering Spec: UX Overhaul

This specification details the implementation plan for the Prodsnap UX overhaul. It reframes the application around the media buyer's actual unit of work: the **Ad Test**.

An **Ad Test** is a named set of complete ad units created to answer a performance question. A complete ad unit can include the creative, primary text, headline, optional description, a platform CTA button selection, and placement/aspect ratio. A **test set** is the generated/exported group of those complete ad units.

The ideal product flow becomes:

`product URL -> product/brand analysis -> create Ad Test -> generate test set -> export complete ad units -> mark winners -> create next Ad Test from winners`

This spec maps that direction onto the current `prodsnapv2` codebase and identifies the backend, frontend, billing, and export changes needed to support it.

---

## Data Model Contract

This section is the source of truth for the schema changes. The implementation should follow this model unless an engineer discovers a concrete blocker in the existing codebase.

### New Validators in `convex/schema.ts`

Add these validators near the existing `aspectRatio`, `marketingAngle`, and `genStatus` validators.

```ts
const adTestStatus = v.union(
  v.literal('draft'),
  v.literal('generating'),
  v.literal('ready'),
  v.literal('partially_failed'),
  v.literal('failed'),
)

const adTestSource = v.union(
  v.literal('starter'),
  v.literal('recommendation'),
  v.literal('winner_iteration'),
  v.literal('custom'),
)

const adPlacement = v.union(
  v.literal('feed_square'),   // 1:1
  v.literal('feed_vertical'), // 4:5
  v.literal('story_reel'),    // 9:16
  v.literal('landscape'),     // 16:9
)

const adTestAngle = v.object({
  key: v.string(),
  title: v.string(),
  description: v.optional(v.string()),
  hook: v.optional(v.string()),
  suggestedAdStyle: v.optional(v.string()),
  productAngleIndex: v.optional(v.number()),
  sourceGenerationId: v.optional(v.id('templateGenerations')),
})

const copySuggestion = v.object({
  text: v.string(),
  angleKey: v.optional(v.string()),
  hook: v.optional(v.string()),
  variantIndex: v.number(),
})

const copySetRequest = v.object({
  includeHeadlines: v.boolean(),
  headlineCount: v.number(),
  includePrimaryTexts: v.boolean(),
  primaryTextCount: v.number(),
  includeDescriptions: v.boolean(),
  descriptionCount: v.number(),
})

const recommendedAdTestConcept = v.object({
  key: v.string(),
  title: v.string(),
  description: v.string(),
  source: v.union(
    v.literal('product_analysis'),
    v.literal('winner_iteration'),
    v.literal('starter'),
  ),
  angles: v.array(adTestAngle),
  prompts: v.optional(v.array(v.string())),
  placements: v.array(adPlacement),
  copyHooks: v.optional(v.array(v.string())),
  priority: v.number(),
  createdAt: v.number(),
})
```

Placement-to-aspect mapping:

| Placement | Aspect Ratio |
| :--- | :--- |
| `feed_square` | `1:1` |
| `feed_vertical` | `4:5` |
| `story_reel` | `9:16` |
| `landscape` | `16:9` |

### New Table: `adTests`

Add this table to `defineSchema`.

```ts
adTests: defineTable({
  userId: v.string(),
  productId: v.id('products'),
  name: v.string(),
  status: adTestStatus,
  source: adTestSource,

  // Test definition. Keep these arrays intentionally small; they are the plan,
  // not the generated output list.
  angles: v.array(adTestAngle),
  prompts: v.optional(v.array(v.string())),
  placements: v.array(adPlacement),
  aspectRatios: v.array(aspectRatio),
  defaultCopyRequest: v.optional(copySetRequest),

  // Optional source context.
  sourceGenerationId: v.optional(v.id('templateGenerations')),
  sourceAdTestId: v.optional(v.id('adTests')),

  // Summary counters. Generated rows live in templateGenerations and are
  // queried by adTestId; do not store generationIds here as an unbounded array.
  // Image-bearing unit counters. These count generated creatives/images, not
  // copy suggestions. Billing preflight must use plannedImageCount.
  plannedImageCount: v.number(),
  completedImageCount: v.number(),
  failedImageCount: v.number(),
  winnerCount: v.number(),

  // Lifecycle state is timestamp-derived, not part of `status`.
  exportedAt: v.optional(v.number()),
  archivedAt: v.optional(v.number()),
  lastLifecycleEmailSentAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index('by_userId', ['userId'])
  .index('by_productId', ['productId'])
  .index('by_userId_status', ['userId', 'status'])
  .index('by_productId_status', ['productId', 'status'])
  .index('by_userId_archivedAt', ['userId', 'archivedAt'])
  .index('by_productId_archivedAt', ['productId', 'archivedAt'])
  .index('by_productId_createdAt', ['productId', 'createdAt'])
```

`status` must describe only generation readiness. Do not set `status` to `exported` or `archived`; those states are derived from `exportedAt` and `archivedAt`. For example, an exported test can later be reopened and generate more rows, in which case `status` may become `generating` while `exportedAt` remains set.

### New Table: `adTestRecommendations`

Recommended test concepts should be generated during product analysis or winner iteration and persisted. Home queries should read persisted recommendations cheaply; they must not call LLM actions from a query.

```ts
adTestRecommendations: defineTable({
  userId: v.string(),
  productId: v.id('products'),
  concept: recommendedAdTestConcept,
  consumedAt: v.optional(v.number()),
  dismissedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index('by_productId', ['productId'])
  .index('by_userId', ['userId'])
  .index('by_productId_consumedAt', ['productId', 'consumedAt'])
```

### New Table: `adTestPerformanceNotes`

Store notes in a child table rather than as an unbounded array on `adTests`.

```ts
adTestPerformanceNotes: defineTable({
  userId: v.string(),
  adTestId: v.id('adTests'),
  generationId: v.optional(v.id('templateGenerations')),
  platform: v.optional(v.union(
    v.literal('meta'),
    v.literal('tiktok'),
    v.literal('google'),
    v.literal('other'),
  )),
  metricName: v.optional(v.string()),
  metricValue: v.optional(v.string()),
  note: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index('by_adTestId', ['adTestId'])
  .index('by_generationId', ['generationId'])
  .index('by_userId', ['userId'])
```

### New Table: `adTestCopySets`

Copy is generated at the Ad Test level, not automatically per image. Store each generated copy bank as a child row so users can request different field mixes and counts over time.

```ts
adTestCopySets: defineTable({
  userId: v.string(),
  adTestId: v.id('adTests'),
  productId: v.id('products'),
  angleKey: v.optional(v.string()), // optional: generate copy for one angle only
  request: copySetRequest,
  headlines: v.array(copySuggestion),
  primaryTexts: v.array(copySuggestion),
  descriptions: v.array(copySuggestion),
  // CTA is not free-form ad copy on Meta. Store a platform button
  // recommendation separately using Meta's call_to_action_type values
  // such as SHOP_NOW, LEARN_MORE, SIGN_UP, DOWNLOAD.
  recommendedCtaButton: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index('by_adTestId', ['adTestId'])
  .index('by_productId', ['productId'])
  .index('by_userId', ['userId'])
```

Validate copy request counts in mutations. Recommended bounds: `0-20` for each field count, with at least one included field and at least one requested suggestion. This lets a media buyer request, for example, 10 headlines, 2 primary texts, and 0 descriptions.

### Changes to `templateGenerations`

Extend the existing `templateGenerations` table. Keep all existing fields for compatibility.

```ts
adTestId: v.optional(v.id('adTests')),
placement: v.optional(adPlacement),
adUnitIndex: v.optional(v.number()),
angleKey: v.optional(v.string()),
selectedCopySetId: v.optional(v.id('adTestCopySets')),
selectedHeadlineIndex: v.optional(v.number()),
selectedPrimaryTextIndex: v.optional(v.number()),
selectedDescriptionIndex: v.optional(v.number()),
```

Add indexes:

```ts
.index('by_adTestId', ['adTestId'])
.index('by_adTestId_status', ['adTestId', 'status'])
.index('by_adTestId_placement', ['adTestId', 'placement'])
.index('by_adTestId_winner', ['adTestId', 'isWinner'])
```

The existing `adCopy` object can remain during migration for legacy image-level copy. New Ad Test code should read/write `adTestCopySets`. A later cleanup can remove or deprecate `adCopy` after the UI and exports no longer depend on it.

### Changes to `onboardingProfiles`

Add starter-grant idempotency fields. The free starter allowance is a one-time activation grant, not a recurring monthly allowance.

```ts
hasReceivedStarterGrant: v.optional(v.boolean()),
starterGrantAt: v.optional(v.number()),
buyerType: v.optional(v.union(
  v.literal('in_house'),
  v.literal('agency_or_freelancer'),
))
```

The current role enum already includes `agency-freelancer`, which is useful for the future agency/in-house fork. The role/buyer-type question should not block first value; collect it after the starter test or remove it until the product visibly uses it.

### Optional Future Table: `brands`

Do not add a separate `brands` table in this overhaul unless the product explicitly chooses to support agency/multi-brand workspaces now. The current `brandKits` + `products.brandKitId` model is sufficient for a single-brand or lightweight multi-brand v1. If agency support becomes a P0, introduce `brands` before building more hierarchy-dependent UI.

### Migration Requirements

1. Existing `templateGenerations` rows should remain valid with `adTestId` undefined.
2. Existing UI pages must continue to show legacy generations that do not belong to an Ad Test.
3. The new Ad Test UI should focus on rows with `adTestId`.
4. No historical backfill is required for v1, but an optional migration can create one synthetic Ad Test per product for recent completed generations if needed for library continuity.
5. Because Convex schema changes are strict, all new fields on existing tables must be optional except fields on the new `adTests` table.

---

## Backend API Contract

Create a new `convex/adTests.ts` module. All public functions must derive `userId` from `ctx.auth.getUserIdentity().tokenIdentifier`; do not accept user IDs from clients. All functions must include validators.

### Queries

```ts
listForProduct({
  productId: v.id('products'),
  includeArchived: v.optional(v.boolean()),
})
```

Returns the user's Ad Tests for a product, ordered newest first. Include summary counters and enough data for Home/Studio cards. Must verify product ownership.

```ts
getById({
  adTestId: v.id('adTests'),
})
```

Returns the Ad Test plus its generated `templateGenerations` rows ordered by `adUnitIndex` or creation time. Must verify ownership through `adTests.userId`.

```ts
getLatestForHome({})
```

Returns the focus product, latest active Ad Test, recent ready tests, recent winners, and recommended next actions. This can either live in `adTests.ts` or replace/extend `products.getFocusProduct`, but Home should have one query that gives it all required data.

```ts
getExportManifest({
  adTestId: v.id('adTests'),
})
```

Returns export metadata for paid users: test name, product name, generation rows, output URLs, selected test-level copy sets, placement, aspect ratio, and CSV-ready fields. This query should not itself download assets.

### Mutations

```ts
createDraft({
  productId: v.id('products'),
  name: v.string(),
  source: adTestSource,
  angles: v.array(adTestAngle),
  prompts: v.optional(v.array(v.string())),
  placements: v.array(adPlacement),
  defaultCopyRequest: v.optional(copySetRequest),
  sourceGenerationId: v.optional(v.id('templateGenerations')),
  sourceAdTestId: v.optional(v.id('adTests')),
})
```

Creates an `adTests` row with `status: 'draft'`. Must verify product ownership and source generation/test ownership when provided.

```ts
startGeneration({
  adTestId: v.id('adTests'),
  model: v.optional(v.union(v.literal('nano-banana-2'), v.literal('gpt-image-2'))),
  productImageId: v.optional(v.id('productImages')),
})
```

Creates the planned `templateGenerations` rows for the test and starts the appropriate workflows. Must preflight credits for the full planned image count before inserting rows. The image count is `angles x placements x imageVariationsPerAngle`; do not multiply by copy variants. Must set `status: 'generating'` on the Ad Test. Generated rows must include `adTestId`, `placement`, `adUnitIndex`, `angleKey`, `aspectRatio`, and the generation-level `angleSeed` derived from the test-level `adTestAngle`.

The optional `model` arg is backend routing only. The Ad Test creator should not expose a user-facing model picker unless the product explicitly reintroduces model choice.

```ts
generateCopySet({
  adTestId: v.id('adTests'),
  angleKey: v.optional(v.string()),
  request: copySetRequest,
})
```

User-triggered copy generation for an Ad Test. This must not run automatically after every image generation. It creates an `adTestCopySets` row containing the requested number of headlines, primary texts, and descriptions. It may also store a recommended CTA button as `recommendedCtaButton`, but CTA is a platform button enum recommendation, not free-form generated copy. Copy generation is unmetered for image-credit billing.

```ts
createAndStartRecommended({
  productId: v.id('products'),
  recommendationKey: v.string(),
  placements: v.optional(v.array(adPlacement)),
})
```

Convenience mutation for Home cards. Loads the persisted `adTestRecommendations` row by `recommendationKey`, creates a draft from its stored concept, marks the recommendation consumed, and starts generation if the card is explicitly labeled as immediate generation. If the UI uses a confirmation screen, call `createDraft` first and `startGeneration` second.

```ts
markExported({
  adTestId: v.id('adTests'),
})
```

Sets `exportedAt`. Do not change `status`; exported is lifecycle metadata derived from the timestamp. Must be called only after a successful export initiation.

```ts
savePerformanceNote({
  adTestId: v.id('adTests'),
  generationId: v.optional(v.id('templateGenerations')),
  platform: v.optional(v.union(v.literal('meta'), v.literal('tiktok'), v.literal('google'), v.literal('other'))),
  metricName: v.optional(v.string()),
  metricValue: v.optional(v.string()),
  note: v.optional(v.string()),
})
```

Inserts an `adTestPerformanceNotes` row. Must verify the Ad Test belongs to the authenticated user and the generation belongs to the test when `generationId` is supplied.

```ts
archive({
  adTestId: v.id('adTests'),
})
```

Soft archives a test by setting `archivedAt`. Do not change `status` and do not delete generated rows.

### Internal Mutations

```ts
updateCountersForGeneration({
  adTestId: v.id('adTests'),
})
```

Recomputes `completedImageCount`, `failedImageCount`, and `winnerCount` from child `templateGenerations`. Call this after generation completion/failure and winner toggles.

```ts
setStatusFromChildren({
  adTestId: v.id('adTests'),
})
```

Sets Ad Test status based on child rows:

- all queued/running/uploading -> `generating`
- all complete -> `ready`
- mix of complete and failed with at least one complete -> `partially_failed`
- all failed -> `failed`

### Existing Function Changes

Update these existing public mutations to accept optional Ad Test context:

```ts
products.generateFromProduct({
  ...
  adTestId: v.optional(v.id('adTests')),
  placement: v.optional(adPlacement),
  angleKey: v.optional(v.string()),
})

angleGenerations.submitAngleGeneration({
  ...
  adTestId: v.optional(v.id('adTests')),
  placement: v.optional(adPlacement),
  angleKey: v.optional(v.string()),
})

promptGenerations.submitPromptGeneration({
  ...
  adTestId: v.optional(v.id('adTests')),
  placement: v.optional(adPlacement),
  angleKey: v.optional(v.string()),
})

products.generateVariations({
  ...
  adTestId: v.optional(v.id('adTests')),
  placement: v.optional(adPlacement),
  angleKey: v.optional(v.string()),
})
```

When `adTestId` is provided, each function must verify the Ad Test belongs to the authenticated user and product. Existing callers without `adTestId` must keep working.

---

## Frontend UX Contract

The overhaul should introduce the Ad Test concept without making the app feel more complex. Use **Ad Test** for the formal object and **test set** for the generated/exported group.

### Required User Flows

1. **New visitor activation**
   - User lands on `/`.
   - User enters a product URL.
   - User signs up/signs in.
   - App resumes the product URL import.
   - Product/brand analysis runs.
   - App creates a starter Ad Test recommendation.
   - User generates a small starter test set without entering a card.
   - User can preview images and copy.
   - User must upgrade to export/download.
   - Role/buyer-type collection happens after the starter test, or is omitted until it directly personalizes the product.

2. **Returning weekly media buyer**
   - User lands on `/home`.
   - If recent winners exist, top card says "Create next Ad Test from winner".
   - If no winners exist, top cards recommend new Ad Tests from product angles.
   - User opens an Ad Test, reviews the generated test set, exports, and marks winners.

3. **Power-user/custom path**
   - User can still enter Studio for template, angle, prompt, and variation generation.
   - New generation from these paths can optionally belong to an Ad Test.
   - Existing loose-generation workflows must not break for legacy users.

### Required Screens and Components

| Surface | Required Changes |
| :--- | :--- |
| `/` landing page | Replace the generic landing action with a product URL input. Persist the URL across auth. Remove card-required trial language. |
| `/onboarding` | Remove plan selection from the initial path. Do not block activation on role/business questions. The primary activation path is product URL -> signup -> import -> starter Ad Test. |
| `/home` | Replace passive hero priority with `NextTestsSection`. Show recommended Ad Tests and winner iteration. |
| `/studio/$productId` | Add Ad Test mode. It should open by `adTestId` and show grouped generated ad units. |
| Ad detail panel | Show selected copy fields only when the user has paired a test-level copy suggestion with that creative. Include winner note/nudge. |
| Export UI | Add primary "Export test set" action at Ad Test level. Individual image download remains secondary. |
| Pricing/upgrade modal | Explain that upgrading unlocks export/full test workflow, not just "more credits". |

### Ad Test Review Layout

The review screen should group rows in a way that matches media-buyer thinking:

1. Test header: name, product, status, placements, generated count, winner count.
2. Primary action: `Export test set` for paid users, `Upgrade to export` for free users.
3. Grid grouped by angle/concept.
4. Inside each group, show placements/aspect ratios.
5. Include a test-level Copy Bank panel where users can request headlines, primary texts, descriptions, and a CTA button recommendation.
6. Each ad unit card should expose: preview, selected copy pairing if any, copy-pairing controls, winner toggle, and "create next test from this".

### Naming and File Rules

Use stable names everywhere:

- UI object: **Ad Test**
- Generated/exported group: **test set**
- Primary button: **Create Ad Test**
- Home card: **Run this week's test**
- Winner action: **Create next Ad Test**
- Export action: **Export test set**

Export filenames should be deterministic:

`{product_slug}_{test_slug}_{angle_slug}_{placement}_{index}.{ext}`

Example:

`hydration-mix_benefit-angles_workout-hydration_feed-vertical_01.png`

---

## Billing and Entitlement Contract

The UX depends on a clear distinction between **previewing value** and **using/exporting value**.

### Free User

`free_user` should be able to:

- create one product,
- run the starter product/brand analysis,
- generate a bounded starter Ad Test,
- preview generated images and copy,
- mark winners and explore the UI.

`free_user` should not be able to:

- export a test set,
- download individual generated images,
- run unbounded/full-size test sets,
- access paid-only capabilities not required for activation.

### Paid User

Paid users can export, download, generate larger test sets, and use the plan's normal credit allowance.

### Enforcement

Paywall enforcement must happen in a shared export/download path, not only in `AdDetailPanel`. Relevant callsites include:

- `src/components/ads/AdDetailPanel.tsx`
- `src/routes/studio.$productId.tsx`
- any new Ad Test export utility
- any server/client download proxy helper

The UI should avoid making a free user wait through a zip-building/export flow before learning they need to upgrade. Check entitlement before export work begins.

Free users can still see preview images on-screen, which means screenshots are possible. This is an accepted tradeoff. The paid value is proper export: original assets, deterministic filenames, and the copy manifest a media buyer needs to launch cleanly.

### Credit Granting

The free starter allowance is a **one-time grant**, not a recurring free-plan allowance. Keep recurring `free_user.imageCredits` low/zero and grant starter credits exactly once when activation reaches the starter test path. Use `onboardingProfiles.hasReceivedStarterGrant` / `starterGrantAt` for idempotency. The default grant should cover the fixed starter test shape: one concept x three placements = three image generations = 30 display credits for `nano-banana-2`.

Billing preflight for an Ad Test must use image count:

`plannedImageCount = angles.length x placements.length x imageVariationsPerAngle`

Do not multiply credit preflight by requested copy counts; copy generation is unmetered for image-credit billing purposes.

---

## Export Contract

Test-set export is a core feature, not a utility detail.

### Export Package Contents

Each Ad Test export must produce one server-built zip containing:

1. All selected generated image files.
2. `manifest.csv` with one row per complete ad unit.
3. Optional `manifest.json` for future integrations/debugging.

Required CSV columns:

```csv
test_name,product_name,angle,placement,aspect_ratio,filename,primary_text,headline,description,cta_button,generation_id
```

### Export Behavior

- Export only complete rows with `outputUrl`.
- Failed/queued rows should be excluded from the image files and listed in `manifest.json` if useful.
- Include `copy_bank.csv` with all generated test-level copy suggestions. If the user pairs specific copy suggestions with creatives, also populate those fields in `manifest.csv`. CTA should export as `cta_button` using platform button values such as `SHOP_NOW` or `LEARN_MORE`.
- After successful export initiation, call `adTests.markExported`.
- Build the zip server-side using a Convex HTTP action or equivalent server/edge export function. Do not rely on browser-side fetching of R2 URLs; that can fail on CORS and memory limits. The client should request an export and receive a single downloadable URL or response.

---

## Workstream 0: Ad Test Data Model & Core Workflow

The primary goal of this workstream is to introduce the core object that the rest of the UX depends on. Today, the application largely treats generations as individual assets. The overhaul should make the user's main object an **Ad Test**, with generated images and copy grouped under that test.

**Acceptance Criteria**

Users must be able to create a named Ad Test for a product. An Ad Test must store the product, selected angles or prompts, target placements/aspect ratios, status, and summary counters. Generated rows in `templateGenerations` must be associated with an Ad Test through `adTestId` so the UI can group, review, export, and iterate them as a single test set. Performance notes must be stored in `adTestPerformanceNotes`. Existing generation workflows may continue to write to `templateGenerations`, but new UX surfaces should organize those rows by Ad Test rather than presenting them as loose generations.

**Implementation Plan**

| Component | Action Required |
| :--- | :--- |
| `convex/schema.ts` | Implement the Data Model Contract above. |
| `convex/adTests.ts` | Create public mutations/queries for creating an Ad Test, listing tests for a product, fetching a test with its generated ad units, marking test-level status, saving winner/performance notes, and exporting metadata. |
| `convex/products.ts`, `convex/studio.ts`, `convex/angleGenerations.ts`, `convex/promptGenerations.ts` | Update generation submission paths to optionally accept an `adTestId`. When the new UX creates a test, every generated `templateGenerations` row should be linked to that test. |
| `src/routes/studio.$productId.tsx` | Introduce an Ad Test review mode that groups generated ad units by test, angle, placement, and copy variant. Keep lower-level generation controls available as customization/power-user controls. |
| `src/routes/home.tsx` | Home actions should start or resume Ad Tests, not just deep-link into Studio. Use language like "Create Ad Test", "Run this week's test", and "Create next test from winner". |

---

## Workstream 1: No-Card Starter Test & Soft Paywall

The primary goal of this workstream is to eliminate the hard onboarding paywall while keeping generation costs bounded. New users should experience the product's core value before entering a credit card, but the free experience should be a limited **starter Ad Test**, not an open-ended free plan.

**Acceptance Criteria**

Users must be able to complete activation and land on the starter Ad Test flow without seeing the Clerk `<PricingTable>`. New users are automatically assigned the `free_user` plan and receive a one-time starter grant. These credits must allow a real first experience, including product analysis, one recommended concept, multi-placement image generation, and the ability to create a Copy Bank. When a user lacks sufficient credits, the `OutOfCreditsModal` must be displayed. When a `free_user` attempts to export/download a generated ad or test set, a soft paywall must intercept the action and prompt them to upgrade.

The starter test shape is fixed for v1: **one concept x three placements** (`feed_square`, `feed_vertical`, `story_reel`) = **three image generations**. At 10 display credits per `nano-banana-2` image, this costs **30 display credits**. Copy suggestions are unmetered and must not be included in credit preflight. A starter allowance of **30 display credits** is sufficient for the default starter test; use **50 display credits** only if the product wants retry/error margin. Internally, one display credit is converted to 1000 milliCredits, so 30 display credits = 30,000 mc.

Abuse prevention is part of this workstream, not a later product decision. Prefer Google OAuth for the no-card starter path, block disposable-email domains, rate-limit starter grants, and add a light IP/device heuristic so one person cannot cheaply create unlimited throwaway accounts for free starter tests.

**Implementation Plan**

| Component | Action Required |
| :--- | :--- |
| `convex/lib/billing/planConfig.ts` | Keep recurring `free_user.imageCredits` low/zero if using a one-time starter grant. Do not model the starter grant as a recurring monthly allowance unless that is an explicit business decision. Set `productLimit` to `1` and `brandKitLimit` to at least `1`. Add only the capabilities needed for the starter test: likely `CAPABILITIES.GENERATE_VARIATIONS` and `CAPABILITIES.BATCH_GENERATION`. Avoid enabling unrelated paid capabilities unless required for activation. |
| `convex/onboardingProfiles.ts` | Add `hasReceivedStarterGrant` and `starterGrantAt`. In `completeOnboarding`, remove the validation check that throws `'No active paid subscription found'`. Onboarding completion should no longer require a paid plan. Review `finalizeOnboardingAfterCheckout` separately; it can remain as a paid-plan sync path but should no longer be the only route to completion. |
| `convex/lib/billing/credits.ts` or a new billing mutation | Implement an idempotent one-time starter grant. If `hasReceivedStarterGrant` is true, do not grant again. Ensure `grantPlanCredits` / `applyCreditsFromPlan` cannot reset or refill the free starter balance on token refresh or free-plan sync. |
| Auth/signup layer | Prefer Google OAuth for the free starter path, block disposable-email domains, and add rate limits/heuristics keyed by account, IP, and device where available. |
| `src/components/onboarding/StepPlan.tsx` | Remove the dedicated plan selection step from initial onboarding. The file can be deleted only after all imports, route references, and tests are updated. |
| `src/routes/onboarding.tsx` | Do not block first value on role/business questions. The fastest path is product URL -> signup -> import -> starter Ad Test. Move role/buyer-type collection after the starter test, or remove it until it is used for personalization. |
| `src/routes/index.tsx` | Replace the generic landing action with a product URL input. Persist the submitted URL through signup and use it after authentication to begin product import. |
| `src/routes/pricing.tsx` | Update pricing copy to reflect the no-card starter test. Avoid language that implies unlimited free generation. |
| `src/utils/downloadImage.ts`, download proxy/action layer, and all download callsites | Enforce the free-user export paywall centrally, not only inside `AdDetailPanel`. Downloads exist in both `AdDetailPanel` and Studio; a client-only guard in one component is insufficient. |

---

## Workstream 2: Home Recommendation Surface -> Start Next Ad Test

The objective here is to transform `/home` from a passive dashboard into a test launcher. The top of Home should answer the media buyer's weekly question: "What should I test next?"

**Acceptance Criteria**

The `/home` dashboard must prominently display four to six persisted recommended Ad Test ideas tailored to the user's focus product. These recommendations should combine marketing angles, prompt suggestions, placement recommendations, and copy-hook directions. Clicking a recommendation should create or preview an Ad Test, not merely navigate to Studio with query parameters.

For returning users, the primary home action should prioritize the loop: last winners -> next Ad Test. Example: "`Product Name` had 2 winners. Create next test from winner."

**Implementation Plan**

| Component | Action Required |
| :--- | :--- |
| Product analysis workflow | After product analysis creates `marketingAngles`, generate 4-6 `adTestRecommendations` rows for that product. These are persisted concepts, not query-time LLM calls. Include one starter recommendation shaped as one concept x three placements. |
| `convex/products.ts` or `convex/adTests.ts` | Extend `getFocusProduct` or create `adTests.getLatestForHome` to return persisted recommendations from `adTestRecommendations`, recent winners, and active/recent Ad Tests. Queries must read stored data only. |
| `convex/adTests.ts` | Add a mutation such as `createRecommendedAdTest` that accepts a persisted recommendation key, marks the recommendation consumed, creates the `adTests` row, maps test-level angles into generation-level `angleSeed`, and creates linked generation rows. |
| `src/routes/home.tsx` | Build a `RecommendationsShelf` or `NextTestsSection`. Cards should use Ad Test language: "Test 3 benefit angles", "Test new UGC-style hooks", "Create next test from winner". |
| `src/routes/home.tsx` | Wire recommendation clicks to create or open an Ad Test. Prefer a review/confirm state before spending credits unless the action is clearly labeled as an immediate generation. |
| `src/routes/studio.$productId.tsx` | Add route/search support for opening a specific `adTestId`, so Home can send users into the right test review/generation context. |

---

## Workstream 3: Test-Level Suggested Copy Bank

This workstream adds copy as a first-class part of shipping an Ad Test without silently generating or attaching final copy to every image. Copy is generated at the Ad Test level as a configurable **Copy Bank**. The user chooses whether they want headlines, primary texts, descriptions, or any combination of those fields, and chooses how many suggestions to generate for each field.

In this spec, **copy** means:

- **Headline**: short hook/title used by the ad platform.
- **Primary text**: main body text for the ad.
- **Description**: optional supporting text, depending on placement/platform.

CTA is separate. On Meta, CTA is a platform button selection (`call_to_action_type`) rather than free-form copy, so the system may recommend a CTA button like `SHOP_NOW` or `LEARN_MORE`, but it should not treat CTA as generated prose.

**Acceptance Criteria**

Copy generation must be user-triggered from the Ad Test review screen. The user must be able to choose which fields to generate and how many suggestions to generate for each field. For example, the user can request 10 headlines, 2 primary texts, and 0 descriptions. The result is stored in `adTestCopySets`, visible in a Copy Bank panel, editable/copyable by the user, and included in export.

Users must be able to optionally pair a specific headline, primary text, and/or description with a creative before export. Pairing is optional because media buyers may want to test copy independently from creatives.

Suggested flow:

1. User creates/generates an Ad Test.
2. User reviews the generated creatives grouped by angle/placement.
3. UI presents an action: `Add copy variants`.
4. User chooses fields and counts:
   - headlines: on/off + count
   - primary text: on/off + count
   - descriptions: on/off + count
5. App generates a test-level Copy Bank.
6. User edits, copies, or pairs suggestions with creatives.
7. Export includes images, `manifest.csv`, and `copy_bank.csv`.

**Implementation Plan**

| Component | Action Required |
| :--- | :--- |
| `convex/schema.ts` | Add `adTestCopySets` and the copy validators from the Data Model Contract. Keep existing `adCopy` only for legacy compatibility. |
| `convex/ai.ts` | Add or refactor a copy-generation action to return separate arrays of `headlines`, `primaryTexts`, and `descriptions`, respecting the requested counts. It may also return `recommendedCtaButton` as a Meta-compatible CTA button enum string. |
| `convex/adTests.ts` | Add `generateCopySet({ adTestId, angleKey?, request })`. Validate requested counts, verify ownership, call the AI action, and insert an `adTestCopySets` row. |
| `convex/studio.ts` / legacy `adCopy` path | Do not automatically call copy generation after every image generation for Ad Tests. Legacy per-image copy can remain for old surfaces until migrated, but the new Ad Test flow uses `adTestCopySets`. |
| `src/routes/studio.$productId.tsx` | Add a Copy Bank panel in Ad Test review mode. It should let users choose fields/counts, generate suggestions, edit/copy suggestions, and optionally pair selected suggestions with creatives. |
| `src/components/ads/AdDetailPanel.tsx` | Show selected copy pairings if present. Do not imply missing copy is an error; the user may intentionally skip copy. |

---

## Workstream 4: Test Set Export & Soft Paywall

The goal of export is to make the last mile easy for a media buyer. A useful export is not just a single image download; it is a platform-ready test set.

**Acceptance Criteria**

Paid users must be able to export an entire Ad Test as a single package. The package must include image files with consistent platform-ready filenames and a CSV or spreadsheet mapping each file to its ad copy fields. Free users should be able to preview generated ads and copy but must upgrade before exporting.

Recommended CSV columns:

`test_name, product_name, angle, placement, aspect_ratio, filename, primary_text, headline, description, cta_button, generation_id`

**Implementation Plan**

| Component | Action Required |
| :--- | :--- |
| `src/utils/downloadImage.ts` | Keep single-image download support, but do not overload it as the main test export mechanism. |
| `convex/http.ts` or dedicated export action | Add a server-side Ad Test export endpoint/action that verifies entitlement, fetches image assets, builds the zip, includes `manifest.csv` and `copy_bank.csv`, stores or streams the zip, and returns a single downloadable result. |
| `src/utils/downloads.ts` or new `src/utils/exportAdTest.ts` | Add a thin client helper that calls the server-side export endpoint/action. Do not build the main zip in the browser. |
| `src/routes/studio.$productId.tsx` | Add "Export test set" as the primary action on an Ad Test. Include selected placements/formats if multi-placement generation is enabled. |
| `src/components/ads/AdDetailPanel.tsx` | Keep individual ad export as a secondary action, using the same billing/paywall logic as test-level export. |
| Billing/download authorization layer | Enforce free-user export restrictions centrally. Do not rely only on UI guards, because there are multiple download entry points. |

---

## Workstream 5: Winner Loop & Performance Notes

The goal is to close the habit loop. A winner should not just be a starred image; it should become the seed for the next Ad Test.

**Acceptance Criteria**

When a user marks an ad as a winner, the app must offer high-intent next actions: create the next Ad Test from this winner, generate variations, test a new angle, or record why it won. Users must be able to attach lightweight performance notes such as CPA, CTR, ROAS, platform, or free-form observations. These notes should be visible in the Ad Test history and available as context for future recommendations.

**Implementation Plan**

| Component | Action Required |
| :--- | :--- |
| `convex/templateGenerations.ts` | Extend `toggleWinner` behavior only if needed. Prefer separate mutations for saving performance notes so winner toggling remains simple and reliable. |
| `convex/adTests.ts` | Add mutations for adding/removing winners on an Ad Test and saving performance notes. |
| `src/components/ads/AdDetailPanel.tsx` | Update `handleToggleWinner` to show a `WinnerNudge` when marking an ad as winner. The nudge should include "Create next Ad Test", "Generate variations", "Try a new angle", and "Add performance note". |
| `src/components/ads/WinnerNudge.tsx` | Build this new component. Avoid making it only a transient toast; use an inline prompt, modal, or persistent panel so the user can actually act on it. |
| `src/routes/home.tsx` | For returning users, prioritize "Create next Ad Test from winner" when recent winners exist. |

---

## Workstream 6: Multi-Placement Test Sets

The media buyer's actual output is not one aspect ratio. The app should support placement fan-out so one concept can become a feed, story, and reels-ready set.

**Acceptance Criteria**

Users creating an Ad Test must be able to choose placement presets such as Feed, Reels/Stories, or All placements. The system should generate the requested aspect ratios and associate each output with a placement. Export filenames and CSV rows must include placement/aspect ratio.

**Implementation Plan**

| Component | Action Required |
| :--- | :--- |
| `convex/schema.ts` | Add placement metadata to `adTests` and generated rows. At minimum store `aspectRatio`; ideally also store `placement` such as `feed_square`, `feed_vertical`, or `story_reel`. |
| Generation submission mutations | Fan out generation rows across selected placements. Reuse existing aspect ratio handling, but group the rows under a single Ad Test. |
| `src/routes/studio.$productId.tsx` | Add placement preset controls to the Ad Test creator. Use sensible defaults for the starter test so beginners do not need to choose. |
| Export utility | Include placement in file naming and CSV manifest. |

---

## Workstream 7: Cleanup & Removals

This workstream removes legacy code and messaging that contradict the new flow. Cleanup should happen after the new Ad Test path is working, not before.

**Acceptance Criteria**

All messaging indicating that a credit card is required for the initial trial must be removed from landing and pricing pages. The landing page hero must support product URL capture. Legacy generation/run code should only be removed after active dependencies and legacy data have been audited.

**Implementation Plan**

| Component | Action Required |
| :--- | :--- |
| `src/routes/index.tsx` | Remove "CARD REQUIRED" messaging and card-required FAQ language. Add product URL input and handoff through signup. |
| `src/routes/pricing.tsx` | Update plan messaging to explain the starter Ad Test and paid export/full-test unlock. |
| `convex/studio.ts` | Do not immediately delete `createRun`, `runAnalysis`, `getRun`, `getGenerations`, `matchTemplates`, `submitRun`, or `maybeCompleteRun`. First verify no frontend routes, workflows, or legacy rows depend on `studioRuns`. `generateFromTemplateWorkflow` still references `maybeCompleteRun` for legacy `runId`s, so this cleanup must be sequenced carefully. |
| `convex/products.ts`, `convex/productImages.ts` | Audit background removal before deleting functions. There are product-level and image-level background removal paths; removing only one set can leave inconsistent behavior. |

---

## Workstream 8: Weekly Return Trigger

The goal of this workstream is to close the weekly habit loop when the media buyer is outside the app. Home recommendations and WinnerNudge only work after the user returns; this workstream creates the external return trigger.

**Acceptance Criteria**

Users who exported or generated an Ad Test should receive a lifecycle nudge roughly one week later prompting them to log winners and create the next Ad Test. The nudge should link directly to the relevant Ad Test or winner-entry flow. The system must avoid duplicate reminders for the same test within the same lifecycle window.

Example lifecycle message:

"Your `Hydration Benefits` test has had a week to run. Log the winner and create next week's Ad Test."

**Implementation Plan**

| Component | Action Required |
| :--- | :--- |
| `convex/adTests.ts` | Add a query/internal query to find ready tests older than the configured lifecycle window, especially tests with `exportedAt` set, where `lastLifecycleEmailSentAt` is missing or stale. |
| `convex/crons.ts` or scheduler equivalent | Add a scheduled job that checks for Ad Tests needing lifecycle reminders. |
| Email/lifecycle messaging provider | Send a lifecycle email or product notification with a deep link to `/studio/$productId?adTestId=...`. If no email provider exists yet, create an implementation stub and keep this workstream marked as a known retention gap until provider setup is done. |
| `convex/adTests.ts` | After sending, set `lastLifecycleEmailSentAt` so reminders are idempotent. |
| `src/routes/studio.$productId.tsx` | Support deep links that open the Ad Test and highlight winner logging / "Create next Ad Test". |

---

## Open Product Decisions

These decisions should be settled before implementation starts:

1. **In-house vs agency hierarchy:** If agencies/freelancers are core users, the long-term hierarchy should be `Brand -> Product -> Ad Test`, not only `Product -> Ad Test`.
2. **Export gate nuance:** The current recommendation is to block all free downloads/exports. If the product wants a more permissive gate, decide whether free users are blocked from bulk exports only, high-resolution/no-watermark exports, or all asset downloads.
3. **Lifecycle channel:** Decide whether Workstream 8 ships as email first, in-app notification first, or both. Email is the most important channel for bringing weekly users back.
4. **Terminology:** Use **Ad Test** as the formal object. Use **test set** for the generated/exported group. Avoid "campaign" because it conflicts with ad-platform campaign structure.

---

## End-to-End Acceptance Checklist

An engineer should consider the overhaul complete only when these checks pass.

### Activation

- A signed-out user can enter a product URL on `/`.
- After signup/signin, the app resumes the submitted URL without making the user paste it again.
- The user can finish onboarding without choosing a paid plan.
- Role/buyer-type collection does not block the first starter test.
- The product and brand import flow creates the expected product/brand data.
- The free user can generate the fixed starter Ad Test: one concept x three placements.
- The free user sees generated images and complete copy.
- The free user is blocked from export/download and sees an upgrade modal.
- Disposable-email/domain blocking and starter-grant rate limits are active for the no-card path.

### Ad Test Data

- Creating an Ad Test inserts an `adTests` row with correct `userId`, `productId`, `status`, `source`, angles, placements, and counters.
- Generated rows include `adTestId`, placement, angle key, aspect ratio, and ad unit index.
- Generated rows created from Ad Test angles include generation-level `angleSeed`.
- Legacy generated rows without `adTestId` still render in existing library/studio surfaces.
- Ad Test counters update after complete, failed, and winner-toggle events.
- `status` reflects generation state only; exported and archived are derived from timestamps.
- Authorization prevents a user from reading or mutating another user's Ad Tests or generated rows.

### Copy

- Ad Test copy generation is user-triggered from the Copy Bank panel, not automatic after image generation.
- Copy Bank can generate user-selected fields: headlines, primary texts, and/or descriptions, with independent counts for each.
- CTA is stored/exported separately as `cta_button`, a platform button recommendation rather than free-form copy.
- `adTestCopySets` persists test-level copy banks; legacy `adCopy` is only compatibility storage.
- UI supports editing/copying suggestions and optionally pairing suggestions with creatives.
- Copy generation failure does not mark image generation or the Ad Test as failed.
- Users can regenerate a Copy Bank with different field/count selections.

### Home

- Home shows Ad Test recommendations above the fold for users with a ready focus product.
- Home reads persisted `adTestRecommendations`; it does not generate recommendations in a query.
- Home prioritizes "Create next Ad Test from winner" when recent winners exist.
- Recommendation cards either create a draft Ad Test or clearly start generation.
- Home still has a sane empty state when no product exists.

### Studio / Review

- Opening `/studio/$productId?adTestId=...` displays the Ad Test review state.
- Ad units are grouped by angle/concept and placement.
- Winner toggles work from the Ad Test review and detail panel.
- Users can create a next Ad Test from a winner.
- Users can add performance notes to a winner or test.

### Export

- Paid users can export a complete Ad Test as a zip.
- Zip contains image files and `manifest.csv`.
- Manifest rows map each image to copy fields and placement.
- Zip is built server-side, not in the browser.
- Free users cannot export via any UI entry point.
- Export filenames are deterministic and platform-friendly.

### Billing / Credits

- Starter credits are granted once and protected by `hasReceivedStarterGrant`.
- Credit preflight happens before starting generation for a full Ad Test.
- Credit preflight uses image count only and does not multiply by requested copy counts.
- Failed copy generation does not consume image credits.
- Out-of-credit users see the existing `OutOfCreditsModal`.
- Paid plan upgrades restore/export entitlement without requiring the user to redo the generated work.

### Weekly Return

- A scheduled lifecycle job identifies Ad Tests that need weekly follow-up.
- Users receive a reminder to log winners and create the next Ad Test.
- `lastLifecycleEmailSentAt` prevents duplicate reminders.
- Reminder links deep-link into the relevant Ad Test.

### Regression

- Existing template generation still works without an Ad Test.
- Existing angle generation still works without an Ad Test.
- Existing prompt generation still works without an Ad Test.
- Existing variation generation still works without an Ad Test.
- Library and ad detail panel still support legacy generated ads.
- No deprecated `studioRuns` cleanup is merged until dependency audit is complete.

---

## Recommended Build Sequence

1. Add the Ad Test schema and link generated rows to `adTestId`.
2. Remove the hard onboarding paywall and support a bounded starter Ad Test.
3. Build test-level, user-triggered Copy Bank generation.
4. Build Ad Test review and test-set export.
5. Add Home "Start Next Ad Test" recommendations.
6. Add winner iteration and performance notes.
7. Add multi-placement fan-out.
8. Add the weekly return trigger.
9. Clean up legacy run/background-removal paths after dependency audit.
