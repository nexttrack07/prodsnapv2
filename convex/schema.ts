import { defineSchema, defineTable } from 'convex/server'
import { type Infer, v } from 'convex/values'

export const CLIP_EMBEDDING_DIMS = 768

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

const genStatus = v.union(
  v.literal('queued'),
  v.literal('running'),
  v.literal('uploading'),
  v.literal('complete'),
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
    imageUrl: v.string(), // R2 URL of uploaded product image
    imageStorageId: v.optional(v.string()), // Convex storage ID if applicable
    status: productStatus,
    // Analysis results (populated after 'analyzing' → 'ready')
    category: v.optional(v.string()),
    productDescription: v.optional(v.string()),
    targetAudience: v.optional(v.string()),
    embedding: v.optional(v.array(v.float64())), // CLIP embedding for template matching
    // Metadata
    error: v.optional(v.string()),
    archivedAt: v.optional(v.number()), // soft delete timestamp
  })
    .index('by_status', ['status'])
    .index('by_archived', ['archivedAt'])
    .vectorIndex('by_embedding', {
      vectorField: 'embedding',
      dimensions: CLIP_EMBEDDING_DIMS,
      filterFields: ['status'],
    }),

  // ─── Ad Templates (library of templates for generation) ──────────────────
  adTemplates: defineTable({
    imageUrl: v.string(),
    thumbnailUrl: v.string(),
    aspectRatio,
    width: v.number(),
    height: v.number(),
    status: templateStatus,
    category: v.optional(v.string()),
    subcategory: v.optional(v.string()),
    sceneTypes: v.optional(v.array(v.string())),
    moods: v.optional(v.array(v.string())),
    sceneDescription: v.optional(v.string()),
    embedding: v.optional(v.array(v.float64())),
    aiTagsRaw: v.optional(v.any()),
    ingestError: v.optional(v.string()),
  })
    .index('by_status', ['status'])
    .index('by_aspect_status', ['aspectRatio', 'status'])
    .vectorIndex('by_embedding', {
      vectorField: 'embedding',
      dimensions: CLIP_EMBEDDING_DIMS,
      filterFields: ['status', 'aspectRatio'],
    }),

  // ─── DEPRECATED: Legacy studio runs (use products + generations instead) ──
  // Kept temporarily for migration; will be removed once existing flows updated
  studioRuns: defineTable({
    productImageUrl: v.string(),
    status: runStatus,
    category: v.optional(v.string()),
    productDescription: v.optional(v.string()),
    targetAudience: v.optional(v.string()),
    embedding: v.optional(v.array(v.float64())),
    aspectRatio: v.optional(aspectRatio),
    mode: v.optional(v.union(v.literal('exact'), v.literal('remix'))),
    colorAdapt: v.optional(v.boolean()),
    variationsPerTemplate: v.optional(v.number()),
    error: v.optional(v.string()),
  }).index('by_status', ['status']),

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
    // Product-centric model (new)
    productId: v.optional(v.id('products')),
    // Legacy run reference (deprecated, optional for migration)
    runId: v.optional(v.id('studioRuns')),
    templateId: v.id('adTemplates'),
    // Snapshot of inputs at generation time
    productImageUrl: v.string(),
    templateImageUrl: v.string(),
    templateSnapshot: v.optional(v.object({
      name: v.optional(v.string()),
      aspectRatio: v.optional(aspectRatio),
    })),
    // Generation settings
    aspectRatio: v.optional(aspectRatio), // moved from run to generation
    mode: v.union(v.literal('exact'), v.literal('remix')),
    colorAdapt: v.boolean(),
    variationIndex: v.number(),
    // Execution state
    status: genStatus,
    currentStep: v.optional(v.string()),
    progress: v.optional(v.number()),
    // Per-job prompt composed by the composer LLM just before we call
    // nano-banana. Stored for debugging / future "view prompt" UI.
    dynamicPrompt: v.optional(v.string()),
    outputUrl: v.optional(v.string()),
    error: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
  })
    .index('by_product', ['productId'])
    .index('by_run', ['runId']) // legacy, keep for migration
    .index('by_template', ['templateId']),
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
export type AdTemplate = Infer<typeof schema.tables.adTemplates.validator>
/** @deprecated Use Product instead */
export type StudioRun = Infer<typeof schema.tables.studioRuns.validator>
export type TemplateGeneration = Infer<
  typeof schema.tables.templateGenerations.validator
>
