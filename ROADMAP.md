# ProdSnap Roadmap

Living doc. Product positioning, competitive context, prioritized roadmap, and decisions we've made along the way. Updated as we learn.

---

## One-line positioning

> **Upload a product. Pick a template. Get an ad that's genuinely yours — with the text, icons, and logos rewritten to match your product, not the template's.**

The differentiator: **dynamic per-job prompt composition.** For every (template × product) pair, a vision-aware LLM looks at both images and crafts a prompt that instructs the image model to do a *semantic swap* — not just replace the product, but rewrite visible copy, swap product-specific icons/graphics, and strip the template's branding. Neither Magritte (generic template adaptation) nor Cake (from-scratch generation) does this.

---

## Competitive landscape — what we learned

### Magritte.co
- **Model:** Curated library of 30,000+ high-performing ads + 600+ Canva templates. Adapt a template to your brand via Canva. Not generative AI in the strict sense.
- **Moat:** Curation quality (analyzes 10k ads/day to filter), plus a structured taxonomy of **Angles & Hooks** — named creative patterns that work across brands (e.g., "Sold Out → Back in Stock", "X Reasons", "Chart Comparison") with "why it works" explanations.
- **Retention hook:** Creator plan delivers **20 ready-to-launch ads tailored to your product every week** via AI + curation.
- **Pricing (yearly):** Free · Explorer $33/mo (3 seats) · Creator $53/mo (5 seats).
- **Sources:** [magritte.co](https://www.magritte.co), [pricing](https://www.magritte.co/pricing/).

### Cake.ad
- **Model:** Chat-first AI creative studio. User chats their idea → AI generates on-brand visuals.
- **Killer features:** Brand DNA import (colors/fonts/logos/tone auto-applied), **one-click asset grab from any website URL**, quality slider, 10k+ templates, Image→Video in beta.
- **Pricing (credits):** Free €0 (50 credits) · Plus €7/mo (200) · Flex €38/mo (up to 3500, slider).
- **Quality gated by tier** — free users get low/medium only, paid get high.
- **Sources:** [cake.ad](https://cake.ad).

### Looka.com (UX inspiration only, different vertical)
- **Model:** AI logo maker. Users pick style/color/symbol *preferences*, AI generates hundreds of logo variants.
- **Core philosophy we're borrowing:** **Recognition, not description.** Users can't say what they want, but they can point to what they like. Every step narrows the design space by letting users *pick* visual options, not *describe* them in prose.
- **What we're NOT borrowing:** "Continue as guest" / "Pay only when happy." Their logo generation is effectively free (SVG composition); our pipeline costs real money per run (~$0.02–0.10 in Replicate + OpenAI).
- **Sources:** [looka.com](https://looka.com), [pricing](https://looka.com/pricing).

---

## Where ProdSnap sits

|  | Magritte | Cake | ProdSnap |
|---|---|---|---|
| Input | Browse library + pick | Chat the idea | Product photo + pick template |
| Generation approach | Canva template adaptation | AI from scratch | AI semantic swap against template |
| Text rewrite | Manual in Canva | Generated from scratch | **Auto-rewritten via composer LLM** |
| Icon/logo handling | Manual | From scratch | **Auto-stripped/swapped** |
| Template library | 30k curated + 600 Canva | 10k+ | 6 (POC) → target 200+ |

The **composer LLM** is the ProdSnap moat. Everything else in this roadmap is building the product *around* that core capability.

---

## Current state (POC)

What works end-to-end today:
- Studio wizard: upload → analyze (vision + CLIP embedding in parallel) → pick template → generate
- Composer LLM composes a per-job prompt from both images + analysis context
- `google/nano-banana-2` for image generation
- Workpool for concurrency, Workflow for durable multi-step per-generation execution
- Admin page for template library management (masonry grid, upload, re-tag, delete)
- Admin page for **composer settings** — editable core instructions + exact/remix/color-adapt addenda
- AI-enhance button on each admin prompt field (GPT-4o-mini rewrites based on user instructions)
- R2 storage, seeded with ~6 sample templates

**Not yet built:** auth, credits, billing, admin auth gate, onboarding, landing page polish, scale (library / users / content).

---

## Core UX Model — Product-centric architecture

Before features, we need to nail the fundamental user flow. The current POC has no persistence — generations vanish after the session. This section defines how users organize and revisit their work.

### The organizing unit: Products

The **product** is the natural organizing unit. Users think "I have 5 SKUs, I need ads for each" — not "I have 3 projects." Uploading a product image creates a Product record; all generations using that product are grouped under it.

This matches the "recognition not description" principle: users don't name or describe upfront, they just upload and go.

### Data model

```
products
  _id
  userId
  name              -- editable, defaults to filename sans extension
  imageUrl          -- R2 URL of the uploaded product image
  imageStorageId    -- Convex storage ID
  analysis          -- { clipEmbedding, visionTags, dominantColors, productType, ... }
  status            -- 'analyzing' | 'ready' | 'failed'
  createdAt
  updatedAt
  archivedAt        -- soft delete

generations
  _id
  productId         -- foreign key to products
  userId
  templateId
  templateSnapshot  -- { name, imageUrl } at generation time (templates can change)
  status            -- 'pending' | 'generating' | 'completed' | 'failed'
  outputUrls        -- array of R2 URLs
  outputStorageIds  -- array of Convex storage IDs
  promptUsed        -- the composed prompt sent to image model
  settings          -- { style, variationCount, aspectRatio, ... }
  createdAt
```

Migration: existing `studioRuns` and `templateGenerations` fold into `products` and `generations`. POC data is test data — can drop or migrate.

### Studio entry flow

```
/studio
  ├── Empty state (no products): "Upload your first product" hero + upload zone
  ├── Has products: Grid of product cards
  │     └── Each card: thumbnail, name, generation count, last edited
  │     └── Click → opens product workspace
  └── "New Product" button → upload flow
```

### Upload creates the product

```
User drops/selects image
  → Product record created immediately (status: 'analyzing')
  → Name defaults to filename (e.g., "blue-sneaker.png" → "Blue Sneaker")
  → Analysis runs (CLIP + vision in parallel)
  → On success: status → 'ready', user proceeds to template picker
  → On failure: status → 'failed', show retry option
```

No separate "create product" step. Uploading IS creating.

### Product workspace

```
/studio/[productId]
  ┌─────────────────────────────────────────────────────────────┐
  │  Header: Product name (editable) | "Generate More" button   │
  ├─────────────┬───────────────────────────────────────────────┤
  │  Sidebar    │  Main area                                    │
  │  ─────────  │  ─────────────────────────────────────────    │
  │  Product    │  Generation gallery (masonry grid)            │
  │  thumbnail  │  - Each card: output image, template used,    │
  │             │    date, download button                      │
  │  Analysis   │  - Empty state: "No generations yet"          │
  │  summary    │  - Click card → full-size preview + actions   │
  │             │                                               │
  │  Brand kit  │                                               │
  │  preview    │                                               │
  └─────────────┴───────────────────────────────────────────────┘
```

"Generate More" opens the template picker modal/drawer → user picks template(s) → configures settings → generates → results appear in gallery.

### Wizard state persistence

| Exit point | What's saved | On return |
|------------|--------------|-----------|
| After upload, before template pick | Product exists (status: ready) | See product in grid, click to continue |
| Mid-template-pick | Product exists, no draft | Re-pick template (2 clicks) |
| After generation starts | Product + generation record | See generation status in product workspace |
| After generation completes | Product + completed generation | See results in gallery |

We do NOT persist template selection or settings as a "draft." The friction of re-selecting is lower than the complexity of draft management.

### Key flows

**New user:**
1. `/studio` → empty state with upload prompt
2. Uploads image → product created → lands in product workspace
3. Clicks "Generate More" → picks template → generates
4. Results saved, visible in gallery
5. Returns next day: `/studio` shows product card, click to see generations

**Returning user with existing product:**
1. `/studio` → sees product grid
2. Clicks product → sees past generations
3. "Generate More" → picks new template → results added to gallery

**User with multiple products:**
1. `/studio` → grid of all products
2. Search/filter by name
3. Each product is its own workspace

### URL structure

```
/studio                     -- product grid (my products)
/studio/new                 -- upload flow (optional, can also upload from grid)
/studio/[productId]         -- product workspace with generation gallery
/studio/[productId]/generate -- template picker + settings (could be modal instead)
```

### Brand kit scope

Account-level for now. One brand kit per user, applies to all products. Per-product brand overrides can come later if needed.

### Archive vs delete

Soft delete only. Products and generations get `archivedAt` timestamp. Can restore. Permanent delete only via explicit "empty trash" action (Phase 2+).

---

## Phase 1 — UI & feature refinement (current focus)

Refining what's there + adding user-visible features. Decided to do this before auth+billing because product-market fit is the blocker, not infrastructure.

### 1.1 Onboarding & landing
- **URL asset grab** — paste a Shopify or product URL, scrape product image + colors + logo, skip the file upload. (adopted from Cake)
- **Better landing page** — hero, "how it works" three-step, before/after examples, wait-list CTA. No social proof yet (don't have it).
- **Example generations on landing** — show real template × product → result trios. This is what converts.

### 1.2 Brand kit
- Per-account brand (POC: one per session; later: one per user):
  - Logo upload
  - Primary/secondary colors
  - Fonts (text input, not font picker — for LLM context)
  - Brand voice (short text)
- Pass these into the composer LLM's user message so every generation is on-brand.
- (adopted from Cake)

### 1.3 Studio wizard polish
- **Multi-format export** from a single generation. User picks template + product once → generates 1:1 + 4:5 + 9:16 in one submit. (Each still a separate workflow under the hood.)
- **Download-all zip** on the results screen.
- **"Copy prompt"** debug toggle in admin for troubleshooting composer output.

### 1.4 Template library depth
- **Scale to ~200 templates** via an automated ingest pipeline. Sources:
  - Meta Ad Library (scrape + filter for high-performing)
  - TikTok Creative Center
  - Curated Unsplash / stock sets
- Ingest runs through the existing workflow (CLIP embed + GPT-4o-mini tagging) — only new thing is the feeder and a review UI for bulk approval.
- **Extend tagging schema to include Angles & Hooks** (Magritte-style taxonomy). New enum field on `adTemplates`:
  ```
  hooks: ['social-proof', 'before-after', 'x-reasons', 'chart-comparison',
           'sold-out-back', 'founder-story', 'testimonial', 'problem-solution',
           'urgency', 'guarantee', 'how-it-works', 'unboxing', ...]
  ```
  The vision-tagging LLM picks 1-3 hooks per template. **This also becomes context for the composer** — it knows the ad's intent, not just its look.
- **"Why it works" blurb** per template (Magritte-style explanation). Also generated during ingest.

### 1.5 Gallery filters (once library ≥100)
- Filter by **scene type** (Studio / Lifestyle / Flat-lay / Before-after / Text-overlay / Testimonial / Split-screen)
- Filter by **hook** (Social Proof / Before-After / X Reasons / etc.)
- Filter by **category** (auto-inferred from product analysis, overridable)
- Sort by most-popular / newest / similarity
- **Shuffle already works.** Keep it.

### 1.6 Things we're explicitly NOT doing in Phase 1
- ❌ **Chat-based iteration** on results. Users can't describe what they want — that's the whole reason for template-first UX. Already built "Retry" for failed gens; that's enough refinement for now.
- ❌ **"Mood" picker** (Minimal/Luxe/Playful/etc) — works for logos, doesn't map to ad creatives. Scene-type and hook filters replace it.
- ❌ **Free generation / continue as guest.** AI costs real money per run. Signup + credits gate generation (coming in Phase 2).
- ❌ **Generate-many-pick-favorites upfront.** Forcing users to always pay for 4 when they want 1 is dishonest. Keep the variations count picker.

---

## Phase 2 — Auth, billing, multi-tenancy

Can't charge without this. Can't scale past personal use without this.

### 2.1 Auth
- **Clerk or Convex Auth.** Leaning Clerk — handles password/Google/GitHub cleanly, small app surface.
- Scope every existing table by `userId`.
- `studioRuns`, `templateGenerations`, `uploads` all get a `userId` field with index.
- Migration path for existing (anonymous) POC rows: leave them or delete — they're test data.

### 2.2 Admin role gate
- `users.role: 'user' | 'admin'` field.
- Middleware in admin routes checks role.
- `templates.createTemplate`, `deleteTemplate`, `retryTemplateIngest`, `prompts.updatePromptConfig`, etc. all check role server-side — don't rely on UI gating alone.

### 2.3 Credits + Stripe billing
- Credits model, borrowed from prodsnap-marketing.
- Tiers:
  ```
  Free:  10 credits/mo   — try-before-you-buy
  Plus:  100 credits/mo  — $9/mo
  Flex:  400 credits/mo  — $29/mo
  ```
  (Cake uses 50/200/3500 at €0/€7/€38 but their per-gen cost is lower. Our numbers assume ~$0.05 avg cost per generation; adjust after measuring real Replicate/OpenAI spend.)
- Each generation (per template × variation) = 1 credit, deducted at submit time (not at download — the Replicate call already happened).
- High-resolution / watermark-free downloads **not** gated separately for now. Keep it simple: credits = usage.
- `creditTransactions` table for audit trail.
- Monthly reset via Convex cron.

### 2.4 Rate limiting
- Per-user cap on concurrent in-flight generations (e.g., 10).
- Workpool already has global parallelism cap (5 for `imageGenPool`).
- Burst protection on submit endpoint (Convex doesn't have native rate limiting; use a simple in-DB sliding window).

---

## Phase 3 — Content & moat

Once we have users paying, depth becomes the lever.

### 3.1 Weekly ad drops (Magritte-style retention hook)
- Cron every Monday picks 20 tagged templates matched to each user's recent products.
- Generates 20 ads, emails / posts to in-app inbox.
- **Doesn't cost the user credits** for these — it's the retention subsidy.
- Scales the library's value from "one-time run" to "ongoing asset stream."

### 3.2 Performance metadata on templates
- Scrape or import CTR/spend data where available (Meta Ad Library exposes some).
- Surface "this ad got X% CTR in industry Y" as trust signal.
- Sort the gallery by performance.

### 3.3 Image → Video (Cake feature parity)
- Runway Gen-3 / Kling / Luma via Replicate. Same workflow pattern as current image gen: action calls model, uploads result, updates row.
- Gate behind Flex tier only (video is expensive).

### 3.4 Agency / team features
- Workspaces with multiple users.
- Shared brand kits.
- Shared template collections.
- Centralized billing.

---

## Phase 4 — Scale & platform

### 4.1 Public API
- Let agencies / other tools call the generation pipeline.
- API keys, usage metering, higher-tier pricing.

### 4.2 Integrations
- Direct publish to Meta Ads / Google Ads (requires platform auth).
- Shopify app listing (one-click product import).
- Klaviyo / email tool integrations for dropping generated ads into campaigns.

### 4.3 Community / marketplace
- User-contributed templates (moderated).
- Revenue share for popular contributors.

---

## Pricing philosophy

- **No free generation.** Signup gates the pipeline. Free tier has a small monthly credit allowance (10) to let users see quality before committing.
- **Credits consumed at submit, not at download.** Aligns cost with actual spend on our side.
- **Quality tier gating optional.** Cake gates output resolution by tier; we may or may not — decide after measuring what users want.
- **Pricing inspired by Cake** (credit-based, three tiers) not Magritte (seat-based) because our cost per unit is compute, not content.

---

## Product principles

1. **Template does 99% of the work.** The whole reason the app is valuable is because the user doesn't have to describe anything — they pick. Keep the wizard short.
2. **Recognition, not description.** Every step that adds cognitive load (type this, describe that) is a bug. Replace with visual pickers.
3. **Don't ask for commitment before showing value.** The first half of the wizard should feel like a demo, not a form.
4. **Cost honesty.** Credits deducted at submit are the honest model. Nothing hidden.
5. **Admin tools are for us, not users.** Prompt editing, template management, bulk ingest — admin-only. Users never see the composer internals.
6. **The composer LLM is the product.** Every feature either feeds it better context (brand kit, hooks) or surfaces its output better (multi-format, download zip). Nothing that isn't one of those is a priority.

---

## Open questions

- Auth provider: Clerk vs Convex Auth vs Better Auth? Leaning Clerk.
- Library scale target — 200 is a POC moat, but Magritte has 30k. Realistic mid-term?
- Do we self-curate templates forever or build user-contribution flow?
- What's the actual per-generation cost once we measure? That sets the credit tier numbers.
- Video: build-in or wait? Big feature, big cost.

---

## Decision log

- **2026-04-20** — Adopted product-centric UX model. The "product" (uploaded image) is the organizing unit, not projects or sessions. Uploading creates a Product record; all generations grouped under it. No draft persistence for template selection — re-picking is low friction.
- **2026-04-20** — Dropped Step 2 (Analyze) as a separate wizard step; folded into Step 1 (Upload) so analysis runs automatically on upload.
- **2026-04-20** — Switched generation model from `google/nano-banana` to `google/nano-banana-2`, then back to v1 after safety-filter issues, then to v2 again (user preference) with explicit aspect ratio to avoid `match_input_image` ambiguity.
- **2026-04-20** — Admin prompt page repurposed: fields are now composer LLM meta-instructions, not the literal image-model prompt. Added `coreInstructions` field.
- **2026-04-20** — Explicitly rejected chat-based iteration as the default refinement path. Template-first flow stays.
- **2026-04-20** — Rejected Looka's "free to generate, pay to download" model because our generations cost real money per run.
- **2026-04-20** — Rejected the "mood picker" (Minimal/Luxe/Playful) as a wizard step — doesn't map to ad creatives. Replaced with scene-type + hook filters once library is big enough.

---

## Companion docs in this repo

- `PATTERNS.md` — Convex + TanStack Start architecture patterns
- `CONVEX_JOBS_PATTERNS.md` — Convex native jobs vs Trigger.dev analysis
- `ROADMAP.md` — this file
