import { defineSchema, defineTable } from 'convex/server'
import { type Infer, v } from 'convex/values'
import {
  adPlacement,
  adTestAngle,
  adTestSource,
  adTestStatus,
  copySetRequest,
  copySuggestion,
  recommendedAdTestConcept,
} from './lib/adTestValidators'

const aspectRatio = v.union(
  v.literal('1:1'),
  v.literal('4:5'),
  v.literal('9:16'),
  v.literal('16:9'),
)

const templateStatus = v.union(
  v.literal('pending'),
  v.literal('ingesting'),
  v.literal('published'),
  v.literal('failed'),
)

// Legacy run status (deprecated - use productStatus instead)
const runStatus = v.union(
  v.literal('analyzing'),
  v.literal('ready'),
  v.literal('generating'),
  v.literal('complete'),
  v.literal('failed'),
)

// Product status - simpler than run status (no generation states)
const productStatus = v.union(
  v.literal('analyzing'),
  v.literal('ready'),
  v.literal('failed'),
)

// Marketing angle produced by the analysis AI for a product.
// Each angle is a positioning/hook pair the user can act on.
const marketingAngle = v.object({
  title: v.string(),               // short label, e.g. "Late-night skincare ritual"
  description: v.string(),         // 1-2 sentence positioning explanation
  hook: v.string(),                // a sample headline/opening line
  suggestedAdStyle: v.string(),    // e.g. "lifestyle UGC", "before/after demo"
  // Playbook angle type — classifies the psychological lever being used.
  angleType: v.optional(v.union(
    v.literal('comparison'),          // Interest Loop
    v.literal('curiosity-narrative'), // Personal Narrative
    v.literal('social-proof'),
    v.literal('problem-callout'),
  )),
  // Structured filter tags — when an angle is "explored", these become the
  // pre-applied filters on the template picker. Optional because legacy rows
  // and analyses pre-dating this field won't have them.
  tags: v.optional(v.object({
    productCategory: v.optional(v.string()),
    imageStyle: v.optional(v.string()),
    setting: v.optional(v.string()),
    primaryColor: v.optional(v.string()),
  })),
})

// URL import job lifecycle.
const urlImportStatus = v.union(
  v.literal('pending'),
  v.literal('scraping'),
  v.literal('extracting'),
  v.literal('uploading'),
  v.literal('done'),
  v.literal('failed'),
)

const genStatus = v.union(
  v.literal('queued'),
  v.literal('running'),
  v.literal('uploading'),
  v.literal('complete'),
  v.literal('failed'),
)

// Product image types (original uploads and enhancements)
const productImageType = v.union(
  v.literal('original'),
  v.literal('background-removed'),
  // Future: 'cropped', 'color-corrected', 'upscaled', etc.
)

const productImageStatus = v.union(
  v.literal('processing'),
  v.literal('ready'),
  v.literal('failed'),
)

const schema = defineSchema({
  // ─── Products (user's uploaded product images) ───────────────────────────
  products: defineTable({
    name: v.string(), // editable, defaults to filename
    status: productStatus,
    // Owner (Clerk user ID from JWT subject)
    userId: v.optional(v.string()), // optional for migration of existing data
    // Optional brand association
    brandKitId: v.optional(v.id('brandKits')),
    // Primary image for generation (references productImages table)
    primaryImageId: v.optional(v.id('productImages')),
    // Analysis results (populated after 'analyzing' → 'ready')
    category: v.optional(v.string()),
    productDescription: v.optional(v.string()),
    targetAudience: v.optional(v.string()),
    // Marketing analysis (extended; produced by the same AI call as above)
    valueProposition: v.optional(v.string()),
    marketingAngles: v.optional(v.array(marketingAngle)),
    // Metadata
    // Voice of customer: authentic review snippets / phrases per product
    customerLanguage: v.optional(v.array(v.string())),
    // User-provided rich metadata (optional; used by analysis + angle generation)
    price: v.optional(v.number()),
    currency: v.optional(v.string()), // ISO 4217, e.g. 'USD'
    tags: v.optional(v.array(v.string())),
    aiNotes: v.optional(v.string()), // Free-form notes for the AI: "this product is..."
    error: v.optional(v.string()),
    archivedAt: v.optional(v.number()), // soft delete timestamp
    // Marks the single product cloned by the "Try with a sample" demo on-ramp.
    isSampleSource: v.optional(v.boolean()),
    // ─── Legacy fields (kept for migration, will be removed) ─────────────
    imageUrl: v.optional(v.string()), // @deprecated - use productImages table
    imageStorageId: v.optional(v.string()), // @deprecated
    embedding: v.optional(v.array(v.float64())), // @deprecated - not used
    backgroundRemovedUrl: v.optional(v.string()), // @deprecated - use productImages
    backgroundRemovalStatus: v.optional(v.union(
      v.literal('idle'),
      v.literal('processing'),
      v.literal('complete'),
      v.literal('failed'),
    )), // @deprecated
  })
    .index('by_status', ['status'])
    .index('by_archived', ['archivedAt'])
    .index('by_userId', ['userId'])
    .index('by_userId_archived', ['userId', 'archivedAt'])
    .index('by_sample_source', ['isSampleSource']),

  // ─── Product Images (original uploads + enhancements) ───────────────────
  productImages: defineTable({
    productId: v.id('products'),
    userId: v.string(),
    imageUrl: v.string(),
    thumbnailUrl: v.optional(v.string()), // for faster grid loading
    type: productImageType,
    // Links enhancement to its source image (null for originals)
    parentImageId: v.optional(v.id('productImages')),
    status: productImageStatus,
    error: v.optional(v.string()),
  })
    .index('by_product', ['productId'])
    .index('by_parent', ['parentImageId'])
    .index('by_product_type', ['productId', 'type']),

  // ─── Ad Templates (library of templates for generation) ──────────────────
  adTemplates: defineTable({
    imageUrl: v.string(),
    thumbnailUrl: v.string(),
    // R2 keys for cleanup on delete. Optional — legacy rows uploaded before
    // we tracked keys leak their R2 objects until an offline sweep runs.
    imageStorageKey: v.optional(v.string()),
    thumbnailStorageKey: v.optional(v.string()),
    aspectRatio,
    width: v.number(),
    height: v.number(),
    status: templateStatus,
    // Content hash for duplicate detection (SHA-256 of file bytes)
    contentHash: v.optional(v.string()),
    // ─── Structured Tags (new system) ─────────────────────────────────────
    // Each field stores exactly ONE value from its enum
    productCategory: v.optional(v.string()),  // beauty, skincare, supplements, etc.
    primaryColor: v.optional(v.string()),     // neutral, warm, cool, pink, etc.
    imageStyle: v.optional(v.string()),       // product-hero, lifestyle, flat-lay, etc.
    setting: v.optional(v.string()),          // studio, home, bathroom, outdoor, etc.
    composition: v.optional(v.string()),      // centered, rule-of-thirds, scattered, etc.
    textAmount: v.optional(v.string()),       // no-text, minimal-text, text-heavy, etc.
    subcategory: v.optional(v.string()),      // free-form specific product type
    // Playbook angle type — classifies the psychological lever this template fits best.
    angleType: v.optional(v.string()),
    // ─── Legacy fields (kept for backward compatibility) ──────────────────
    category: v.optional(v.string()),         // @deprecated use productCategory
    sceneTypes: v.optional(v.array(v.string())),
    moods: v.optional(v.array(v.string())),
    sceneDescription: v.optional(v.string()),
    embedding: v.optional(v.array(v.float64())), // @deprecated - not used, kept for existing data
    aiTagsRaw: v.optional(v.any()),
    ingestError: v.optional(v.string()),
    // ─── Custom (user-uploaded) templates ─────────────────────────────────
    // Curated library rows leave ownerUserId undefined. When set, the row is a
    // user's own uploaded template. `visibility` gates who else can see/use it
    // and moves through an admin-in-the-middle approval flow:
    //   'private' (default) = owner only.
    //   'pending'           = owner has requested it be made public; it is
    //                         awaiting admin review. Behaves like 'private' to
    //                         everyone except the owner — NOT shown in the
    //                         discover browse, NOT generatable by other users.
    //   'public'            = admin-approved; shows in the discover browse and
    //                         is generatable by any user.
    // A user may only move private<->pending (request/withdraw) or down to
    // private; only an admin may promote 'pending' -> 'public'. `name` is the
    // user-facing label for custom rows (curated rows are unnamed).
    ownerUserId: v.optional(v.string()),
    visibility: v.optional(
      v.union(v.literal('private'), v.literal('pending'), v.literal('public')),
    ),
    name: v.optional(v.string()),
  })
    .index('by_status', ['status'])
    .index('by_aspect_status', ['aspectRatio', 'status'])
    .index('by_content_hash', ['contentHash'])  // For duplicate detection
    // Structured tag indexes for filtering
    .index('by_product_category', ['productCategory', 'status'])
    .index('by_primary_color', ['primaryColor', 'status'])
    .index('by_image_style', ['imageStyle', 'status'])
    .index('by_setting', ['setting', 'status'])
    // Owner-scoped listing for "My Templates"; visibility for public discovery.
    .index('by_owner', ['ownerUserId'])
    .index('by_visibility_status', ['visibility', 'status']),

  // ─── DEPRECATED: Legacy studio runs (use products + generations instead) ──
  // Kept temporarily for migration; will be removed once existing flows updated
  studioRuns: defineTable({
    productImageUrl: v.string(),
    status: runStatus,
    // Owner (Clerk user ID). Optional for pre-auth legacy rows.
    userId: v.optional(v.string()),
    category: v.optional(v.string()),
    productDescription: v.optional(v.string()),
    targetAudience: v.optional(v.string()),
    embedding: v.optional(v.array(v.float64())), // @deprecated - not used, kept for existing data
    aspectRatio: v.optional(aspectRatio),
    mode: v.optional(v.union(v.literal('exact'), v.literal('remix'))),
    colorAdapt: v.optional(v.boolean()),
    variationsPerTemplate: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index('by_status', ['status'])
    .index('by_userId', ['userId']),

  // ─── Billing: synced plan per user ────────────────────────────────────────
  // Source of truth for the enforcement layer. Populated by the
  // `billing/syncPlan:syncUserPlan` Convex action, which calls Clerk's
  // Backend API. Client triggers this action on app mount and after
  // checkout completes. Future (v2): Clerk webhook also writes this row
  // on subscription lifecycle events for real-time accuracy.
  userPlans: defineTable({
    userId: v.string(),                 // matches identity.tokenIdentifier
    plan: v.string(),                   // "basic" | "pro" | "" (no active subscription)
    syncedAt: v.number(),               // Unix ms
    // Forward-compat: raw subscription snapshot for debugging/audit
    clerkUserId: v.optional(v.string()),
    // Subscription-anniversary credit period anchors (from Clerk)
    periodStart: v.optional(v.number()),    // Unix ms, from Clerk currentPeriodStartDate
    periodEnd: v.optional(v.number()),      // Unix ms, from Clerk currentPeriodEndDate
    billingStatus: v.optional(v.string()),  // Clerk subscription status (active, past_due, etc.)
    // Set when the user schedules a cancellation; cleared when reactivated.
    // Used to render "cancellation scheduled" UI without re-querying Clerk.
    cancelScheduledAt: v.optional(v.number()),
    // Idempotency stamps for transactional emails. Stamped once per
    // period so retried webhooks / daily cron sweeps don't re-email.
    notifiedTrialEndingForPeriodStart: v.optional(v.number()),
    notifiedPaymentFailedForPeriodStart: v.optional(v.number()),
  })
    .index('by_userId', ['userId'])
    .index('by_clerkUserId', ['clerkUserId']),

  // ─── Billing audit + credit ledger ───────────────────────────────────────
  // Append-only. Rows with context: 'usage' also serve as the monthly-credit
  // ledger — summing `units` since startOfMonthUtc() gives the user's quota
  // consumption for the current period.
  billingEvents: defineTable({
    userId: v.string(),
    mutationName: v.string(),
    capability: v.optional(v.string()),
    allowed: v.boolean(),
    claimedPlan: v.optional(v.string()),
    timestamp: v.number(),
    // Forward-compat (populated when metered billing / webhooks land):
    units: v.optional(v.number()),
    metadata: v.optional(v.union(
      // malformed-clerk-response: subscriptionItems was not an array
      v.object({ receivedType: v.string(), preservedPlan: v.string() }),
      // unknown-plan-slug: Clerk returned a slug not in PLAN_CONFIG
      v.object({ receivedSlug: v.string(), preservedPlan: v.string() }),
      // clerk-api-error: Clerk API threw a network/5xx error
      v.object({ error: v.string(), preservedPlan: v.string() }),
      // credit-charge: mc deducted for an AI operation
      v.object({
        kind: v.literal('credit'),
        modelKey: v.string(),
        creditsMc: v.number(),
        planUsedDeltaMc: v.number(),
        topupDeltaMc: v.number(),
        note: v.optional(v.string()),
      }),
      // credit-grant: mc granted at period renewal
      v.object({
        kind: v.literal('credit-grant'),
        planSlug: v.string(),
        allowanceMc: v.number(),
        previousPlanSlug: v.optional(v.string()),
      }),
    )),
    context: v.optional(
      v.union(
        v.literal('enforcement'),
        v.literal('checkout'),
        v.literal('webhook'),
        v.literal('usage'),
        v.literal('clerk-api-error'),
        v.literal('unknown-plan-slug'),
        v.literal('malformed-clerk-response'),
        v.literal('rate-limited'),
        v.literal('period-fallback'),       // periodStart missing → calendar-month used
        v.literal('stale-period-fallback'), // periodEnd < now and Layer 3 scheduler fired
        v.literal('credit-charge'),         // mc deducted for an AI operation
        v.literal('credit-grant'),          // mc granted at period renewal
      ),
    ),
  })
    .index('by_userId', ['userId'])
    .index('by_timestamp', ['timestamp'])
    .index('by_capability', ['capability']),

  promptConfigs: defineTable({
    key: v.string(),
    // Core instructions — always applied as part of the composer LLM's
    // system message.  Defines what the composer is for.
    coreInstructions: v.optional(v.string()),
    // Mode + feature addenda — short additions appended to the core for
    // specific modes / flags.  Field names kept for back-compat; their
    // meaning is now "addendum" not "full prompt".
    exactPrompt: v.string(),
    remixPrompt: v.string(),
    colorAdaptSuffix: v.string(),
    updatedAt: v.number(),
  }).index('by_key', ['key']),

  // ─── Generations (output images from template × product) ──────────────────
  templateGenerations: defineTable({
    // Product-centric model
    productId: v.optional(v.id('products')),
    // Specific product image used for this generation
    productImageId: v.optional(v.id('productImages')),
    // Owner (Clerk user ID from JWT subject)
    userId: v.optional(v.string()), // optional for migration of existing data
    // Legacy run reference (deprecated, optional for migration)
    runId: v.optional(v.id('studioRuns')),
    // Optional: present for template-driven generations; absent when the
    // generation seeds from a marketing angle (mode === 'angle').
    templateId: v.optional(v.id('adTemplates')),
    // Snapshot of inputs at generation time
    productImageUrl: v.string(), // kept for quick access + legacy
    templateImageUrl: v.optional(v.string()),
    templateSnapshot: v.optional(v.object({
      name: v.optional(v.string()),
      aspectRatio: v.optional(aspectRatio),
    })),
    // Snapshot of the seeding marketing angle (only set when mode === 'angle').
    angleSeed: v.optional(v.object({
      title: v.string(),
      description: v.string(),
      hook: v.string(),
      suggestedAdStyle: v.string(),
    })),
    // Generation settings
    aspectRatio: v.optional(aspectRatio), // moved from run to generation
    mode: v.union(
      v.literal('exact'),
      v.literal('remix'),
      v.literal('variation'),
      v.literal('angle'),
      v.literal('prompt'),
    ),
    colorAdapt: v.boolean(),
    variationIndex: v.number(),
    // Whether the user opted to apply their brand kit to this generation.
    // applyBrand → colors / font / tagline / current offer (visual identity).
    // applyVoice → brand voice + authentic customer phrases (copy tone).
    // Both default to true at the call sites; optional here so legacy rows
    // (written before the toggles existed) are treated as "on".
    applyBrand: v.optional(v.boolean()),
    applyVoice: v.optional(v.boolean()),
    // For variation mode - reference to source generation
    variationSource: v.optional(v.object({
      sourceGenerationId: v.id('templateGenerations'),
      sourceImageUrl: v.string(),
      changeText: v.boolean(),
      changeIcons: v.boolean(),
      changeColors: v.boolean(),
    })),
    // Execution state
    status: genStatus,
    currentStep: v.optional(v.string()),
    progress: v.optional(v.number()),
    // Per-job prompt composed by the composer LLM just before we call
    // nano-banana. Stored for debugging / future "view prompt" UI.
    dynamicPrompt: v.optional(v.string()),
    outputUrl: v.optional(v.string()),
    adCopy: v.optional(v.object({
      headlines: v.array(v.string()),
      primaryTexts: v.array(v.string()),
      ctas: v.array(v.string()),
      generatedAt: v.number(),
    })),
    error: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
    model: v.optional(v.union(v.literal('nano-banana-2'), v.literal('gpt-image-2'))),
    isWinner: v.optional(v.boolean()),
    // Idempotency guard for credit charging. Set true in the same mutation
    // that deducts credits, AFTER the output is durably uploaded. Blocks
    // double-charge when the workflow retries the generation action.
    creditCharged: v.optional(v.boolean()),
    // ─── Ad Test linkage (optional; absent on legacy/loose generations) ─────
    // When set, this generated row is one ad unit of an Ad Test. The UI groups
    // rows by adTestId → angleKey → placement to review/export a test set.
    adTestId: v.optional(v.id('adTests')),
    placement: v.optional(adPlacement),
    adUnitIndex: v.optional(v.number()),
    angleKey: v.optional(v.string()),
    // Optional pairing of a test-level Copy Bank suggestion with this creative.
    selectedCopySetId: v.optional(v.id('adTestCopySets')),
    selectedHeadlineIndex: v.optional(v.number()),
    selectedPrimaryTextIndex: v.optional(v.number()),
    selectedDescriptionIndex: v.optional(v.number()),
  })
    .index('by_product', ['productId'])
    .index('by_productImage', ['productImageId'])
    .index('by_userId', ['userId'])
    // Lets the library paginate completed ads directly, so a page is never
    // diluted by queued/failed rows filtered out after the pagination slice.
    .index('by_userId_status', ['userId', 'status'])
    .index('by_run', ['runId']) // legacy, keep for migration
    .index('by_template', ['templateId'])
    // Ad Test grouping/review/export indexes.
    .index('by_adTestId', ['adTestId'])
    .index('by_adTestId_status', ['adTestId', 'status'])
    .index('by_adTestId_placement', ['adTestId', 'placement'])
    .index('by_adTestId_winner', ['adTestId', 'isWinner']),

  // ─── Ad Tests (named set of complete ad units for one performance question) ─
  // The core object the UX is organized around. Generated creatives live in
  // templateGenerations and are queried by adTestId; this row stores only the
  // plan + summary counters, never an unbounded list of generationIds.
  adTests: defineTable({
    userId: v.string(),
    productId: v.id('products'),
    name: v.string(),
    status: adTestStatus,
    source: adTestSource,

    // Test definition. These arrays are the plan, not the generated output list,
    // so they stay intentionally small.
    angles: v.array(adTestAngle),
    prompts: v.optional(v.array(v.string())),
    placements: v.array(adPlacement),
    aspectRatios: v.array(aspectRatio),
    defaultCopyRequest: v.optional(copySetRequest),

    // Optional source context (winner iteration / cloned test).
    sourceGenerationId: v.optional(v.id('templateGenerations')),
    sourceAdTestId: v.optional(v.id('adTests')),

    // Summary counters over image-bearing child rows (creatives, not copy).
    // Billing preflight must use plannedImageCount.
    plannedImageCount: v.number(),
    completedImageCount: v.number(),
    failedImageCount: v.number(),
    winnerCount: v.number(),

    // Lifecycle state is timestamp-derived, not part of `status`. An exported
    // test can reopen and generate more rows (status → generating) while
    // exportedAt remains set.
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
    // Weekly lifecycle cron: scan only NOT-yet-nudged tests by export time.
    // Putting lastLifecycleEmailSentAt first means once a test is nudged it
    // leaves the `eq(undefined)` partition entirely, so the sweep never re-walks
    // already-handled rows and always reaches fresh candidates.
    .index('by_lifecycle', ['lastLifecycleEmailSentAt', 'exportedAt']),

  // ─── Ad Test recommendations (persisted "what to test next" concepts) ──────
  // Generated during product analysis / winner iteration and stored so Home
  // can read them cheaply. Queries must NOT call LLM actions to produce these.
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
    .index('by_productId_consumedAt', ['productId', 'consumedAt']),

  // ─── Ad Test performance notes (child table; CPA/CTR/ROAS, free-form) ──────
  // Stored as child rows rather than an unbounded array on adTests.
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
    .index('by_userId', ['userId']),

  // ─── Ad Test copy sets (test-level Copy Bank; user-triggered) ─────────────
  // Copy is generated at the Ad Test level, not per image. Each requested field
  // mix is stored as its own child row. CTA is a platform button enum
  // recommendation (recommendedCtaButton), not free-form generated prose.
  adTestCopySets: defineTable({
    userId: v.string(),
    adTestId: v.id('adTests'),
    productId: v.id('products'),
    angleKey: v.optional(v.string()),
    request: copySetRequest,
    headlines: v.array(copySuggestion),
    primaryTexts: v.array(copySuggestion),
    descriptions: v.array(copySuggestion),
    // Meta call_to_action_type value, e.g. SHOP_NOW, LEARN_MORE, SIGN_UP.
    recommendedCtaButton: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_adTestId', ['adTestId'])
    .index('by_productId', ['productId'])
    .index('by_userId', ['userId']),

  // ─── Brand kits (N per user, optionally tagged to products) ─────────────
  brandKits: defineTable({
    userId: v.string(),
    name: v.optional(v.string()),           // display name (required in UI on create)
    isPrimary: v.optional(v.boolean()),     // at most one primary per user
    logoUrl: v.optional(v.string()),
    logoStorageKey: v.optional(v.string()), // R2 object key for management/deletion
    // Hex color strings (#rrggbb); first entry is primary by convention.
    colors: v.optional(v.array(v.string())),
    primaryFont: v.optional(v.string()),
    voice: v.optional(v.string()),          // free-form notes about brand voice
    tagline: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),     // source URL if auto-imported
    // Playbook fields — used to seed copy generation
    currentOffer: v.optional(v.string()),              // e.g. "15% off your first order"
    customerLanguage: v.optional(v.array(v.string())), // authentic review snippets
    updatedAt: v.number(),
  }).index('by_userId', ['userId']),

  // ─── URL import jobs (Shopify / website → product + brand kit) ──────────
  // A staging table that tracks the lifecycle of an automated product import.
  // The job scrapes the URL via Firecrawl, asks the AI to extract product
  // fields + brand kit fields + image URLs, uploads images to R2, then creates
  // the corresponding `products` row and updates the user's `brandKits` row.
  urlImports: defineTable({
    userId: v.string(),
    sourceUrl: v.string(),
    status: urlImportStatus,
    currentStep: v.optional(v.string()),     // human-readable progress label
    // 'product-and-brand' (default) creates a product + upserts brand kit.
    // 'brand-only' (used by onboarding) skips product creation.
    mode: v.optional(v.union(
      v.literal('product-and-brand'),
      v.literal('brand-only'),
    )),
    // Kept for potential future repurposing; no longer set by the import pipeline.
    // The import flow now stores distilled fields directly on the row and lets
    // the frontend create the product only when the user clicks Save.
    productId: v.optional(v.id('products')),
    brandKitUpdated: v.optional(v.boolean()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    finishedAt: v.optional(v.number()),
    // Distilled scrape output — populated by runUrlImport before status='done'.
    // Read by the /products/new form to autofill; the actual product row is
    // only created when the user clicks Save.
    distilledName: v.optional(v.string()),
    distilledDescription: v.optional(v.string()),
    distilledCategory: v.optional(v.string()),
    distilledTags: v.optional(v.array(v.string())),
    distilledAiNotes: v.optional(v.string()),
    distilledPrice: v.optional(v.number()),
    distilledCurrency: v.optional(v.string()),
    distilledReviewSnippets: v.optional(v.array(v.string())),
    uploadedImageUrls: v.optional(v.array(v.string())), // R2 URLs after upload
    // R2 storage keys for everything we uploaded under this import. Used by
    // discardUrlImport to clean up R2 objects when the user cancels without
    // saving. Includes both product images and the optional brand logo.
    uploadedImageKeys: v.optional(v.array(v.string())),
  })
    .index('by_userId', ['userId'])
    .index('by_status', ['status'])
    .index('by_userId_sourceUrl', ['userId', 'sourceUrl']),

  // ─── Webhook event deduplication log ────────────────────────────────────
  webhookEvents: defineTable({
    eventId: v.string(),        // Svix svix-id header, unique per Clerk event
    type: v.string(),           // e.g. 'subscription.updated'
    receivedAt: v.number(),
    handled: v.boolean(),
    rawBody: v.optional(v.string()),
    handlerError: v.optional(v.string()),
  })
    .index('by_eventId', ['eventId'])
    .index('by_receivedAt', ['receivedAt']),

  // ─── Durable retry queue for failed webhook handlers ─────────────────────
  // Populated by handleBillingEvent when its inner Clerk-API call throws.
  // The retryFailedWebhooks cron drains this table with exponential backoff,
  // idempotent against the existing webhookEvents dedup row.
  webhookRetryQueue: defineTable({
    eventId: v.string(),       // Svix event id (the dedup key)
    eventType: v.string(),     // for triage
    payload: v.string(),       // JSON-stringified original event payload
    attempts: v.number(),      // 0..MAX
    nextAttemptAt: v.number(), // ms epoch
    lastError: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index('by_nextAttemptAt', ['nextAttemptAt'])
    .index('by_eventId', ['eventId']),

  // ─── Credit balances (one per user, tracks allowance + top-up) ──────────
  // Stores milliCredits (mc): 1 credit = 1000 mc. planAllowanceMc is the
  // monthly budget granted by the plan; topupBalanceMc is purchased on top.
  creditBalances: defineTable({
    userId: v.string(),
    planAllowanceMc: v.number(),    // mc granted by current plan for this period
    planUsedMc: v.number(),         // mc consumed against planAllowanceMc
    topupBalanceMc: v.number(),     // mc purchased via top-up; carries over
    periodStart: v.number(),        // Unix ms — start of current billing period
    periodEnd: v.number(),          // Unix ms — end of current billing period
    version: v.number(),            // optimistic-concurrency token
    lastGrantedPeriodStart: v.optional(v.number()), // last period we granted allowance for
    lastGrantedPlanSlug: v.optional(v.string()),     // plan slug at last grant time
    updatedAt: v.number(),
  }).index('by_userId', ['userId']),

  // ─── Credit pricing (per-model cost table) ────────────────────────────────
  // Stores the milliCredit cost per image generation or enhancement call.
  // Seeded by convex/lib/billing/seedPricing:seedPricing internalMutation.
  creditPricing: defineTable({
    modelKey: v.string(),       // e.g. 'nano-banana-2', 'bria-rmbg'
    creditsMc: v.number(),      // cost in milliCredits per call
    active: v.boolean(),        // false = soft-disabled (no new charges)
    updatedAt: v.number(),
  }).index('by_modelKey', ['modelKey']),

  // ─── Admin audit log ─────────────────────────────────────────────────────
  adminAuditEvents: defineTable({
    adminUserId: v.string(),
    action: v.string(),
    targetUserId: v.optional(v.string()),
    targetId: v.optional(v.string()),
    details: v.optional(v.any()),
    at: v.number(),
  })
    .index('by_admin_at', ['adminUserId', 'at'])
    .index('by_at', ['at']),

  // ─── Onboarding profiles (one per user, captures role + wizard progress) ──
  onboardingProfiles: defineTable({
    userId: v.string(),
    role: v.optional(v.union(
      v.literal('ecom-store-owner'),
      v.literal('saas-founder'),
      v.literal('agency-freelancer'),
      v.literal('content-creator'),
      v.literal('local-service'),
      v.literal('nonprofit'),
      v.literal('something-else'),
    )),
    // 1=role, 2=business, 3=plan, 4=complete
    currentStep: v.number(),
    completedAt: v.optional(v.number()),
    updatedAt: v.number(),
    // ─── Starter grant tracking ───────────────────────────────────────────
    // Set atomically when the one-time no-card starter test is activated.
    // Guards against repeated grants even if creditBalances is manually reset.
    hasReceivedStarterGrant: v.optional(v.boolean()),
    starterGrantAt: v.optional(v.number()),
  }).index('by_userId', ['userId']),

  // ─── Product Inspirations (saved reference ads / swipe file) ────────────
  productInspirations: defineTable({
    productId: v.id('products'),
    userId: v.string(),
    kind: v.union(v.literal('template'), v.literal('external')),
    templateId: v.optional(v.id('adTemplates')),      // present when kind = 'template'
    imageUrl: v.optional(v.string()),                  // present when kind = 'external'
    imageStorageKey: v.optional(v.string()),           // R2 key for external uploads
    sourceUrl: v.optional(v.string()),                 // original URL when kind = 'external'
    note: v.optional(v.string()),                      // user note on why this is saved
    createdAt: v.number(),
  })
    .index('by_product', ['productId'])
    .index('by_userId', ['userId'])
    .index('by_userId_template', ['userId', 'templateId']),

  adminDebugRuns: defineTable({
    adminUserId: v.string(),
    sourceGenerationId: v.id('templateGenerations'),

    // User config
    changeText: v.boolean(),
    changeIcons: v.boolean(),
    changeColors: v.boolean(),

    // Stage 1: composer inputs
    composerImageUrls: v.array(v.string()),
    composerImageLabels: v.array(v.string()),

    // Stage 1: composer outputs
    composerSystemPrompt: v.optional(v.string()),
    composerUserPrompt: v.optional(v.string()),
    composerRawResponse: v.optional(v.string()),
    composerPrompt: v.optional(v.string()),
    composerStartedAt: v.optional(v.number()),
    composerDurationMs: v.optional(v.number()),
    composerError: v.optional(v.string()),

    // Stage 1.5: optional edit
    editedPrompt: v.optional(v.string()),

    // Stage 2: generator inputs
    generatorImageUrls: v.optional(v.array(v.string())),
    generatorImageLabels: v.optional(v.array(v.string())),
    generatorPromptUsed: v.optional(v.string()),
    generatorParams: v.optional(v.any()),
    model: v.optional(v.union(v.literal('nano-banana-2'), v.literal('gpt-image-2'))),

    // Stage 2: generator outputs
    generatorRawResponse: v.optional(v.any()),
    generatorOutputUrl: v.optional(v.string()),
    generatorStartedAt: v.optional(v.number()),
    generatorDurationMs: v.optional(v.number()),
    generatorError: v.optional(v.string()),

    status: v.union(
      v.literal('draft'),
      v.literal('composing'),
      v.literal('composed'),
      v.literal('generating'),
      v.literal('complete'),
      v.literal('failed'),
    ),
    createdAt: v.number(),
  })
    .index('by_admin', ['adminUserId', 'createdAt']),

  // ─── Design Lab outputs (persistent design library) ──────────────────────
  designOutputs: defineTable({
    adminUserId: v.string(),
    imageUrl: v.string(),
    storageKey: v.string(),
    prompt: v.string(),
    promptTitle: v.string(),
    conceptTitle: v.string(),
    referenceImageUrls: v.array(v.string()),
    batchName: v.optional(v.string()),
    nicheDescription: v.optional(v.string()),
    bgRemovedUrl: v.optional(v.string()),
    upscaledUrl: v.optional(v.string()),
    createdAt: v.number(),
  }).index('by_adminUserId', ['adminUserId', 'createdAt']),

  // ─── Design Lab: Idea Library ────────────────────────────────────────────────
  ideas: defineTable({
    adminUserId: v.string(),
    title: v.string(),
    typography: v.string(),          // text copy (empty string if graphic-only)
    imageDescription: v.string(),    // visual concept
    style: v.string(),               // art style
    colorPalette: v.string(),        // colors
    mood: v.string(),                // emotional tone
    generationPrompt: v.string(),    // full prompt for image generation
    status: v.union(
      v.literal('pending'),
      v.literal('queued'),
      v.literal('generating'),
      v.literal('failed'),
    ),
    errorMessage: v.optional(v.string()),
    sourceInstruction: v.optional(v.string()),  // the user's original instruction
    createdAt: v.number(),
  }).index('by_adminUserId', ['adminUserId', 'createdAt']),

  // ─── Blog posts (SEO) ────────────────────────────────────────────────────
  // Normalized, source-agnostic blog content rendered on-domain at /blog. Today
  // it's fed by Outrank via webhook (source: 'outrank'); the normalized shape is
  // the escape hatch — swapping to a headless CMS later means re-pointing the
  // route loaders, not reshaping this table. Images are re-hosted to R2 on
  // ingest so the content survives cancelling the upstream source.
  blogPosts: defineTable({
    source: v.string(),                       // 'outrank' (future: 'sanity', 'manual', …)
    externalId: v.optional(v.string()),       // upstream id (Outrank article id)
    slug: v.string(),                         // URL permalink (match key for updates)
    title: v.string(),
    metaDescription: v.optional(v.string()),
    contentMarkdown: v.string(),              // source of truth; image URLs rewritten to R2
    heroImageUrl: v.optional(v.string()),     // R2 URL after re-host (original until processed)
    tags: v.optional(v.array(v.string())),
    status: v.union(v.literal('published'), v.literal('hidden')),
    // Image re-hosting state. Until done, URLs still point at the upstream CDN.
    imagesRehosted: v.boolean(),
    imageKeys: v.optional(v.array(v.string())), // R2 keys we own, for cleanup
    publishedAt: v.number(),                  // upstream created_at (ms) — sort key
    receivedAt: v.number(),                   // when our webhook ingested it
    updatedAt: v.number(),
  })
    .index('by_slug', ['slug'])
    .index('by_externalId', ['externalId'])
    .index('by_status_publishedAt', ['status', 'publishedAt']),
})
export default schema

// ─── Studio types ─────────────────────────────────────────────────────────
export type Product = Infer<typeof schema.tables.products.validator>
export type ProductImage = Infer<typeof schema.tables.productImages.validator>
export type AdTemplate = Infer<typeof schema.tables.adTemplates.validator>
/** @deprecated Use Product instead */
export type StudioRun = Infer<typeof schema.tables.studioRuns.validator>
export type TemplateGeneration = Infer<
  typeof schema.tables.templateGenerations.validator
>
export type BrandKit = Infer<typeof schema.tables.brandKits.validator>
export type UrlImport = Infer<typeof schema.tables.urlImports.validator>
export type MarketingAngle = Infer<typeof marketingAngle>

// ─── Ad Test types ──────────────────────────────────────────────────────────
export type AdTest = Infer<typeof schema.tables.adTests.validator>
export type AdTestRecommendation = Infer<
  typeof schema.tables.adTestRecommendations.validator
>
export type AdTestPerformanceNote = Infer<
  typeof schema.tables.adTestPerformanceNotes.validator
>
export type AdTestCopySet = Infer<typeof schema.tables.adTestCopySets.validator>
export type AdTestStatus = Infer<typeof adTestStatus>
export type AdTestSource = Infer<typeof adTestSource>
export type AdPlacement = Infer<typeof adPlacement>
export type AdTestAngle = Infer<typeof adTestAngle>
export type CopySuggestion = Infer<typeof copySuggestion>
export type CopySetRequest = Infer<typeof copySetRequest>
export type RecommendedAdTestConcept = Infer<typeof recommendedAdTestConcept>
