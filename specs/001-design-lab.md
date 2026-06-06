# Design Lab — Feature Spec

**Status:** Draft v2 (corrected)
**Scope:** Admin-only (v1)  
**Last updated:** 2026-05-31

---

## Problem

A print-on-demand seller has already chosen a niche and needs to rapidly generate original designs for it. They study what's working in competitor designs and want to create their own variations — staying within the niche, not discovering new ones. This feature compresses that research-to-design loop into a guided three-step pipeline.

---

## User Flow

### Step 0 — Setup

User uploads 1–5 competitor design images and fills in a short niche context form:

- **Niche description** — a few sentences describing the niche (e.g. "Hiking and outdoor adventure, focused on US national parks and wilderness themes")
- **Target audience** — who buys these (e.g. "Outdoor enthusiasts 25–45, largely male, value authenticity over trends")
- **Product type** — T-shirt, hoodie, mug, etc.

Clicks **Analyze designs**.

### Step 1 — Concept Review

System runs one LLM call with all images + niche context. Returns 3–5 concept directions specific to that niche (no prompts yet — just titles and rationale).

User sees a **card grid** of concepts. Each card shows:
- Concept title
- Rationale (why this concept works for this specific niche + audience)

User approves or skips each card. Clicks **Get ideas for X concepts** when done.

### Step 2 — Prompt Review

System generates 2–4 text-to-image prompt variations per approved concept (text-only LLM call — no images needed, context is carried from Step 1). All concepts expanded in one call.

User sees a **prompt card grid** grouped by concept. Each prompt card shows:
- Prompt title + editable prompt text
- Reference image picker — thumbnails of uploaded designs, user selects which to use as style references for this specific prompt (all selected by default; selection is optional)
- Approve / skip toggle

Clicks **Generate X designs** when satisfied.

### Step 3 — Results

All approved prompts dispatched in parallel (max 4 concurrent). Prompts with reference images use img2img; prompts with no references use text-to-image.

Results appear in a **card grid** as each finishes. Failed cards show a retry button.

When done, all generated images are saved permanently to the **Design Library**.

---

## Niche context in LLM calls

The niche form data is passed to both LLM calls:

**Step 1 analysis prompt:** "Here are N competitor designs within this niche: [description]. Target audience: [audience]. Product type: [type]. What concepts from these designs work for this niche and why?"

**Step 2 expansion prompt:** "For this niche ([description], targeting [audience], [type] format), generate text-to-image prompts for each of these concepts: [list]. Each prompt should produce original work that fits the niche — do not reproduce the competitor designs."

---

## Data Model (Convex)

Only final images are persisted. Steps 0–2 live in local React state.

### `designOutputs`

| Field | Type | Notes |
|---|---|---|
| `adminUserId` | string | |
| `imageUrl` | string | CDN URL |
| `storageKey` | string | R2 key |
| `prompt` | string | Snapshot |
| `promptTitle` | string | Snapshot |
| `conceptTitle` | string | Snapshot |
| `referenceImageUrls` | string[] | May be empty |
| `batchName` | string? | Optional |
| `nicheDescription` | string? | Snapshot for library context |
| `createdAt` | number | |

Indexes: `by_adminUserId`

---

## Architecture

### Step 1 — Analysis

```
analyzeDesigns action (imageUrls[], nicheInfo)
  └── single LLM call with all images + niche context
  └── returns concept[] (title + rationale only)
  └── client stores in state → renders concept grid
```

### Step 2 — Expansion

```
expandConcepts action (approvedConcepts[], nicheInfo)
  └── text-only LLM call (no images — niche context carries)
  └── returns prompts[] grouped by concept
  └── client stores in state → renders prompt grid
```

### Step 3 — Generation

```
generateSingleDesign action (prompt, refs?, batchName?)
  └── img2img if refs, text-to-image if not
  └── upload result to R2
  └── ctx.runMutation: save to designOutputs
  └── returns { imageUrl }
```

Max 4 concurrent generations via queue-based limiter.

---

## Frontend Routes

| Route | Purpose |
|---|---|
| `/admin/design-lab` | Landing — New Batch + Library |
| `/admin/design-lab/new` | 3-step wizard |
| `/admin/design-lab/library` | Design library grid |

---

## Out of Scope (v1)

- Mockup integration
- Bulk download
- Batch history (no batch persistence, only image outputs persist)
- Public/user-facing access

---

## Resolved decisions

- Reference images: optional per prompt (empty = text-to-image fallback)
- Concept count: 3–5 (LLM decides based on material)
- Prompt count: 2–4 per concept (LLM decides)
- Retry: per-card retry, no full-batch re-run
- Concurrency: max 4 simultaneous generation calls
- Admin gate: `requireAdmin` on actions, `requireAdminIdentity` on queries/mutations
