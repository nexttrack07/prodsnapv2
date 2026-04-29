import { defineSchema, defineTable } from 'convex/server'
import { type Infer, v } from 'convex/values'

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
  // ─── Demo (Trellaux) tables — to be removed later ─────────────────────────
  boards: defineTable({
    id: v.string(),
    name: v.string(),
    color: v.string(),
  }).index('id', ['id']),

  columns: defineTable({
    id: v.string(),
    boardId: v.string(),
    name: v.string(),
    order: v.number(),
  })
    .index('id', ['id'])
    .index('board', ['boardId']),

  items: defineTable({
    id: v.string(),
    title: v.string(),
    content: v.optional(v.string()),
    order: v.number(),
    columnId: v.string(),
    boardId: v.string(),
  })
    .index('id', ['id'])
    .index('column', ['columnId'])
    .index('board', ['boardId']),

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
    error: v.optional(v.string()),
    archivedAt: v.optional(v.number()), // soft delete timestamp
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
    .index('by_userId_archived', ['userId', 'archivedAt']),

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
  })
    .index('by_status', ['status'])
    .index('by_aspect_status', ['aspectRatio', 'status'])
    .index('by_content_hash', ['contentHash'])  // For duplicate detection
    // Structured tag indexes for filtering
    .index('by_product_category', ['productCategory', 'status'])
    .index('by_primary_color', ['primaryColor', 'status'])
    .index('by_image_style', ['imageStyle', 'status'])
    .index('by_setting', ['setting', 'status']),

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
  }).index('by_userId', ['userId']),

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
  })
    .index('by_product', ['productId'])
    .index('by_productImage', ['productImageId'])
    .index('by_userId', ['userId'])
    .index('by_run', ['runId']) // legacy, keep for migration
    .index('by_template', ['templateId']),
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
    productId: v.optional(v.id('products')), // populated when product is created
    brandKitUpdated: v.optional(v.boolean()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    finishedAt: v.optional(v.number()),
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
})
export default schema

// ─── Trellaux validator helpers (used by existing board.ts) ────────────────
const board = schema.tables.boards.validator
const column = schema.tables.columns.validator
const item = schema.tables.items.validator

export const updateBoardSchema = v.object({
  id: board.fields.id,
  name: v.optional(board.fields.name),
  color: v.optional(v.string()),
})

export const updateColumnSchema = v.object({
  id: column.fields.id,
  boardId: column.fields.boardId,
  name: v.optional(column.fields.name),
  order: v.optional(column.fields.order),
})

export const deleteItemSchema = v.object({
  id: item.fields.id,
  boardId: item.fields.boardId,
})
const { order, id, ...rest } = column.fields
export const newColumnsSchema = v.object(rest)
export const deleteColumnSchema = v.object({
  boardId: column.fields.boardId,
  id: column.fields.id,
})

export type Board = Infer<typeof board>
export type Column = Infer<typeof column>
export type Item = Infer<typeof item>

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
