# Convex Background Jobs — Patterns & Trigger.dev Viability

Research-backed guide for replacing Supabase + Trigger.dev with Convex. Sourced from docs.convex.dev, get-convex/workflow, get-convex/workpool, trigger.dev/docs, and direct analysis of `../sceneframe` (Trigger.dev v4.4.4) and `../projects/prodsnap-marketing` (Trigger.dev v4.0.4).

---

## TL;DR

**Recommendation: drop Trigger.dev. Use Convex native primitives (path A).**

- Every workload in prodsnap-marketing and sceneframe maps cleanly onto Convex **actions + Workpool + Workflow + scheduler**.
- The one Trigger.dev feature without a direct Convex equivalent is `wait.for()` inside a single task run — but Convex **Workflow's `step.sleep()` / `step.awaitEvent()`** solves the same problem (durable suspension with zero cost while sleeping).
- Neither app actually needs Trigger.dev's GPU/heavy-machine tiers — all compute is delegated to Replicate/OpenAI/ElevenLabs via HTTP. Convex actions can make those same calls.
- Keep Trigger.dev only if you specifically want its replay dashboard UX or truly multi-hour single-task runs (>10min continuous compute). Neither applies here.

**When Trigger.dev still makes sense:** heavy native deps (ffmpeg/puppeteer running inside the task itself, not delegated), single-run wall-time >10 min of continuous compute (not sleeping), or you already have the observability tooling wired up.

---

## 1. Convex native primitives — what each does, with exact limits

### 1.1 Actions (`action`, `internalAction`)
The workhorse for anything that calls external APIs (Replicate, OpenAI, ElevenLabs, Stripe, R2).

- **Timeout**: 10 minutes hard wall-clock.
- **Memory**: 64 MiB in Convex runtime; 512 MiB if you add `"use node";` at the top of the file (required for `sharp`, AWS SDK, etc.).
- **Args/return payload**: 16 MiB (Convex runtime), 5 MiB for args in Node.js actions.
- **Can**: use `fetch`, call other queries/mutations/actions via `ctx.runQuery/runMutation/runAction`.
- **Cannot**: write to the DB directly (must call a mutation).
- **Parallelism note**: "Actions from a single client are parallelized" — fire many concurrent actions from the client without serializing.

Use for: Replicate call, OpenAI completion, R2 upload, Stripe API call, CLIP embedding.

### 1.2 Scheduler (`ctx.scheduler.runAfter`, `runAt`, `cancel`)
Fire-and-forget delayed mutations/actions.

- **Max delay**: unbounded ("minutes, days, months"). Persisted in `_scheduled_functions` system table.
- **Limit**: one function can schedule up to **1000** functions with total argument size **8 MB**.
- **Cancelation**: `ctx.scheduler.cancel(id)` — cancels if not started; if started, it finishes but any functions IT schedules are cancelled.
- **Results persist 7 days** after completion.

Use for: "check again in 30 seconds" polling loops, delayed email, cleanup tasks.

### 1.3 Cron jobs (`convex/crons.ts`)
- `crons.interval(name, { seconds|minutes|hours }, internal.X, args)`
- `crons.cron(name, "0 16 1 * *", internal.X)` — standard 5-field cron, UTC
- `crons.hourly/daily/weekly/monthly` helpers
- Can call mutations **or actions** (not just mutations).
- No documented hard cap on number of crons.

Use for: monthly credit resets, scheduled reports, data cleanup.

### 1.4 Workpool component (`@convex-dev/workpool`)
Concurrency-limited queue — direct replacement for Trigger.dev queues.

- `maxParallelism` cap per pool (set to 0 to pause).
- Per-call `enqueueAction(ctx, internal.X, args, { retry, onComplete, context })`.
- `enqueueActionBatch` for batching.
- Retries with exponential backoff + jitter: `retry: { maxAttempts, initialBackoffMs, base }`.
- `onComplete` callback mutation (runs on success/failure/cancel).
- Status persisted in DB (reactive UI): `kind: "pending" | "running" | "finished"`, `statusTtl` default 1 day.
- `pool.cancel(id)` / `pool.cancelAll()`.

```ts
// convex.config.ts
import workpool from "@convex-dev/workpool/convex.config.js"
app.use(workpool, { name: "imageGenPool" })
app.use(workpool, { name: "audioGenPool" })

// index.ts
export const imagePool = new Workpool(components.imageGenPool, {
  maxParallelism: 10,
  retryActionsByDefault: true,
  defaultRetryBehavior: { maxAttempts: 3, initialBackoffMs: 1000, base: 2 },
})
```

Maps 1:1 to sceneframe's `queue: { name: "audio-generation", concurrencyLimit: 5 }`.

### 1.5 Workflow component (`@convex-dev/workflow`) ⭐
The killer feature — durable multi-step execution.

```ts
export const userOnboarding = workflow.define({
  args: { userId: v.id("users") },
}).handler(async (step, args) => {
  const result = await step.runAction(internal.llm.generate, { userId: args.userId }, { retry: true })
  if (result.requiresVerification) await step.awaitEvent({ name: "emailVerified" })
  await step.sleep(3 * 24 * 60 * 60 * 1000) // 3 days, no compute cost while sleeping
  await step.runMutation(internal.emails.sendFollowUp, { userId: args.userId })
})
```

- **Durability via deterministic replay**: Convex re-executes the handler, replaying the journal of completed steps until it reaches the next unfinished one. Survives deploys and restarts.
- **Duration**: no hard limit. `step.sleep(ms)` and `step.awaitEvent(...)` consume **zero resources** while waiting — the workflow can literally sleep for 30 days.
- **Mutations are exactly-once**; `onComplete` handler is exactly-once.
- **Per-step retries**: `{ retry: true }` or custom `{ retry: { maxAttempts, initialBackoffMs, base } }`.
- **Restart**: `restart(ctx, components.workflow, workflowId, { from: 2 })` or `from: "stepName"`.
- **Nested workflows**: `step.runWorkflow(internal.foo.bar, args)`.

**Hard limits to respect:**
- **Step I/O: 1 MB total** per single workflow execution — pass R2 URLs, not image bytes.
- **Journal: 8 MiB** — constrains total number of steps; keep workflows tight.
- **Determinism**: if you change step order/add/remove steps on an in-flight workflow, it fails with a "determinism violation." Plan deploy-vs-in-flight-workflow carefully.
- **No `fetch` / `crypto.subtle` in the handler itself** — delegate to `step.runAction(...)`.
- `Math.random` in handler is seeded (deterministic) — don't use for crypto.

This is the direct replacement for Trigger.dev's `wait.for()` pattern.

### 1.6 HTTP actions (`httpAction`, `convex/http.ts`)
Webhooks and public HTTP endpoints (Stripe webhooks, Polar webhooks, shareable APIs).

Use for: `POST /api/webhooks/stripe` → validate signature → mutate.

---

## 2. Trigger.dev features that Convex lacks (and whether you care)

| Trigger.dev feature | Convex equivalent | Matters for our apps? |
|---|---|---|
| `wait.for({ seconds: 30 })` checkpointing | `step.sleep(30_000)` in Workflow | **Yes** — covered |
| `tasks.trigger` | `ctx.scheduler.runAfter` / `workpool.enqueueAction` | Yes — covered |
| `batch.trigger` | `pool.enqueueActionBatch` | Yes — covered |
| Queue `concurrencyLimit` | Workpool `maxParallelism` | Yes — covered |
| Retries w/ backoff | Workpool `retry` / Workflow step `{ retry }` | Yes — covered |
| `tags` + `useRealtimeRunsWithTag` | Convex reactive queries on a `jobs` table | Yes — covered (different shape) |
| `onFailure` / `onComplete` | Workpool `onComplete`, Workflow `onComplete` | Yes — covered |
| Machine tiers (micro → large-2x, up to 8 vCPU/16 GB) | Node action = 512 MiB, 1 vCPU; no tiering | **No** — all compute is delegated to Replicate/OpenAI/ElevenLabs |
| GPU machines | None | **No** — same reason |
| Run dashboard / replay UI | Convex dashboard function logs | **Partial** — Trigger's UI is nicer |
| Single task run >10 min of continuous compute | **Not possible in a single action.** Workflow splits it across steps. | Only if we can't split — we always can |

---

## 3. Bridging: can Trigger.dev and Convex coexist?

Yes, if you want to. Two directions:

**Convex → Trigger.dev** (Convex action kicks off a Trigger task):
```ts
// convex/jobs.ts
"use node"
import { action } from "./_generated/server"
import { tasks } from "@trigger.dev/sdk/v3"

export const startHeavyJob = action({
  args: { imageUrl: v.string() },
  handler: async (ctx, args) => {
    const handle = await tasks.trigger("render-video", args)
    // Persist handle.id in Convex so we can correlate the webhook
    await ctx.runMutation(internal.jobs.recordHandle, { handleId: handle.id, ... })
  },
})
```

**Trigger.dev → Convex** (a Trigger task writes results back):
```ts
// src/trigger/render.ts
import { ConvexHttpClient } from "convex/browser"
import { api } from "../../convex/_generated/api"

const convex = new ConvexHttpClient(process.env.CONVEX_URL!)

export const renderVideo = task({
  id: "render-video",
  run: async (payload) => {
    // ... do heavy work ...
    await convex.mutation(api.jobs.markComplete, { id: payload.jobId, outputUrl })
  },
})
```

**Gotchas:**
- Auth: the Trigger task runs as a service — mint a service token or use an `internalMutation` exposed via an HTTP action with a shared secret.
- **Double retries**: if both Trigger and Convex are configured to retry on failure, you'll compound. Pick one layer to own retries.
- Observability splits across two dashboards.

For the workloads in our reference apps, this bridge adds complexity without adding capability. Skip unless you have a real reason.

---

## 4. Pattern recipes — direct replacements

### 4.1 On-demand generation with concurrency cap (image/audio)

**Trigger.dev (sceneframe, audio-generation queue, concurrency 5):**
```ts
export const generateVoiceoverAsset = task({
  id: "generate-voiceover-asset",
  queue: { name: "audio-generation", concurrencyLimit: 5 },
  retry: { maxAttempts: 3 },
  run: async (payload, { tags }) => { /* ElevenLabs → R2 → DB */ },
})
// Call: await generateVoiceoverAsset.trigger(payload, { tags: [...] })
```

**Convex equivalent:**
```ts
// convex.config.ts
app.use(workpool, { name: "audioPool" })

// convex/jobs.ts
export const audioPool = new Workpool(components.audioPool, {
  maxParallelism: 5,
  retryActionsByDefault: true,
  defaultRetryBehavior: { maxAttempts: 3, initialBackoffMs: 1000, base: 2 },
})

export const enqueueVoiceover = mutation({
  args: { assetId: v.id("assets"), script: v.string() },
  handler: async (ctx, args) => {
    await audioPool.enqueueAction(ctx, internal.audio.doVoiceover, args, {
      onComplete: internal.audio.markDone,
      context: { assetId: args.assetId },
    })
  },
})

// convex/audio.ts — the actual worker
"use node"
export const doVoiceover = internalAction({
  args: { assetId: v.id("assets"), script: v.string() },
  handler: async (ctx, { assetId, script }) => {
    const mp3 = await elevenlabs.tts(script)
    const url = await uploadToR2(mp3, `voice/${assetId}.mp3`)
    await ctx.runMutation(internal.audio.updateAsset, { assetId, url })
    return { url }
  },
})
```

Client reactivity comes from a Convex query on the `assets` table — no `useRealtimeRunsWithTag` needed; Convex is reactive by default.

### 4.2 Long polling / checkpoint pattern (video generation up to 15 min)

**Trigger.dev (sceneframe's `check-shot-video-generation`):**
```ts
run: async (payload) => {
  while (true) {
    const status = await provider.getStatus(payload.generationId)
    if (status.done) return await uploadFromUrl(status.videoUrl, ...)
    await wait.for({ seconds: 30 }) // checkpointed, zero cost while waiting
  }
}
```

**Convex equivalent — Workflow with `step.sleep`:**
```ts
// convex/workflows.ts
export const checkVideoWorkflow = workflow.define({
  args: { generationId: v.string(), assetId: v.id("assets") },
}).handler(async (step, args) => {
  const MAX_POLLS = 30 // 15 min at 30s intervals
  for (let i = 0; i < MAX_POLLS; i++) {
    const status = await step.runAction(internal.video.fetchStatus,
      { generationId: args.generationId }, { retry: true })
    if (status.done) {
      await step.runAction(internal.video.uploadAndRecord,
        { videoUrl: status.videoUrl, assetId: args.assetId })
      return
    }
    if (status.failed) {
      await step.runMutation(internal.video.markFailed, { assetId: args.assetId, error: status.error })
      return
    }
    await step.sleep(30_000)
  }
  await step.runMutation(internal.video.markFailed, { assetId: args.assetId, error: "timeout" })
})

// Kick off from a mutation after you submit to the provider:
await workflow.start(ctx, internal.workflows.checkVideoWorkflow, {
  generationId, assetId,
})
```

Each `step.sleep(30_000)` checkpoints the workflow — no compute billed during sleep, survives deploys.

### 4.3 Batch triggers (parallel image generation over N placeholders)

**Trigger.dev:** `Promise.all(placeholders.map(p => generateShotImageAsset.trigger(p)))`

**Convex:** `pool.enqueueActionBatch(ctx, internal.image.generate, placeholders)` — single round-trip, queued into the pool, respects `maxParallelism`.

### 4.4 Multi-step pipeline (prodsnap-marketing `studio-generate-from-template`)

Sequence: mark running → build prompt → Replicate → download → R2 upload → DB update. Perfect Workflow use case — if R2 upload fails, only that step retries; no need to re-run Replicate.

```ts
export const generateFromTemplate = workflow.define({
  args: { generationId: v.id("template_generations") },
}).handler(async (step, args) => {
  await step.runMutation(internal.tg.markRunning, args)
  const { prompt, inputs } = await step.runQuery(internal.tg.buildPrompt, args)
  const replicateUrl = await step.runAction(internal.replicate.generate,
    { prompt, inputs }, { retry: { maxAttempts: 3, initialBackoffMs: 2000, base: 2 } })
  const r2Url = await step.runAction(internal.r2.uploadFromUrl,
    { sourceUrl: replicateUrl, dest: `studio/${args.generationId}.png` },
    { retry: true })
  await step.runMutation(internal.tg.markComplete, { ...args, outputUrl: r2Url })
})
```

### 4.5 Scheduled monthly credit reset

Replace prodsnap-marketing's `reset_monthly_credits()` PL/pgSQL cron:
```ts
// convex/crons.ts
crons.cron("reset monthly credits", "0 0 1 * *", internal.credits.resetMonthly)

// convex/credits.ts
export const resetMonthly = internalMutation(async (ctx) => {
  const users = await ctx.db.query("userCredits").collect()
  for (const u of users) {
    const tier = await getTier(ctx, u.userId)
    await ctx.db.patch(u._id, {
      currentCredits: tier.monthlyCredits,
      lastResetDate: Date.now(),
    })
    await ctx.db.insert("creditTransactions", { userId: u.userId, type: "credit", amount: tier.monthlyCredits, reason: "monthly_reset" })
  }
})
```

### 4.6 Stripe webhooks
```ts
// convex/http.ts
import { httpRouter } from "convex/server"
const http = httpRouter()
http.route({
  path: "/webhooks/stripe",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const sig = request.headers.get("stripe-signature")!
    const body = await request.text()
    const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
    await ctx.runMutation(internal.billing.handleStripeEvent, { event })
    return new Response("ok")
  }),
})
export default http
```

### 4.7 Realtime UI (replacing `useRealtimeRunsWithTag`)

Trigger.dev exposed run state via public tokens + `useRealtimeRunsWithTag`. In Convex, every query is already reactive — just write job state to a table and subscribe:

```ts
// schema.ts
jobs: defineTable({
  kind: v.string(),             // "image" | "video" | "voiceover"
  projectId: v.id("projects"),
  status: v.union(v.literal("pending"), v.literal("running"), v.literal("complete"), v.literal("failed")),
  outputUrl: v.optional(v.string()),
  error: v.optional(v.string()),
  startedAt: v.number(),
}).index("by_project", ["projectId"])

// queries.ts
export const jobsByProject = (projectId) => convexQuery(api.jobs.listByProject, { projectId })
// Component:
const { data: jobs } = useSuspenseQuery(jobsByProject(projectId))
```

Update `jobs` from inside the Workpool/Workflow steps and the UI updates instantly. Simpler than the token-minting dance.

---

## 5. Mapping sceneframe's 9 Trigger tasks → Convex

| Trigger task | Convex shape | Pool / workflow |
|---|---|---|
| `start-shot-video-generation` | `mutation` that submits to provider + starts `checkVideoWorkflow` | — |
| `check-shot-video-generation` | **Workflow** with `step.sleep(30s)` polling loop | — |
| `start-transition-video-generation` | `mutation` + starts workflow | — |
| `check-transition-video-generation` | **Workflow** | — |
| `generate-shot-image-asset` (queue:10) | action | Workpool `imagePool`, `maxParallelism: 10` |
| `generate-voiceover-asset` (queue:5) | action | Workpool `audioPool`, `maxParallelism: 5` |
| `generate-background-music-asset` (queue:5) | action | `audioPool` |
| `generate-sfx-asset` (queue:5) | action | `audioPool` |
| `generate-segment-audio-asset` (queue:5) | action | `audioPool` |

All external deps (ElevenLabs, Replicate, Kling) are HTTP APIs — Convex actions call them fine. The only architectural shift is video polling: instead of `wait.for()` inside a task, it's `step.sleep()` inside a Workflow.

---

## 6. Mapping prodsnap-marketing's 5 Trigger tasks → Convex

| Trigger task | Convex shape |
|---|---|
| `studio-analyze-product` (GPT-4o-mini + CLIP, parallel) | action calling both APIs with `Promise.all` |
| `studio-generate-prompts` (GPT-4o structured output) | action |
| `studio-generate-image` (Replicate) | action in `imagePool` |
| `studio-ingest-template` (CLIP embed + vision tag, sequential) | **Workflow** (two steps) |
| `studio-generate-from-template` (prompt → Replicate → download → R2 → DB) | **Workflow** (§4.4 recipe) |

Plus the non-Trigger infra: Stripe webhooks → `httpAction`, monthly credit reset → cron (§4.5), CLIP vector search → Convex's native vector index.

---

## 7. Gotchas & rules of thumb

- **Workflow steps pass data, not payloads.** 1 MB limit across all step args/returns per workflow execution. Pass R2 URLs, not image bytes.
- **`"use node";` goes at the top of files that need `sharp`, `@aws-sdk/*`, `stripe`, or other Node-only deps.** Convex/Node-runtime files cannot coexist in the same file.
- **Mutations are transactional and retried until committed. Actions are not — they can partially succeed.** Put the side-effect (API call) in the action, put the DB write in a mutation the action calls.
- **Don't retry non-idempotent actions.** Replicate and OpenAI charge per call — either pass an `idempotency_key` header or disable retries on that step.
- **Workflow determinism**: don't change step order or add/remove steps while workflows are in flight. Deploy, wait for in-flight workflows to drain, then ship changes to the workflow graph. For quick iteration, use `workflow.restart(...)` to clear.
- **Scheduler cancelation has a gotcha**: already-running functions keep running, but anything they schedule will NOT run. Plan accordingly for polling loops.
- **Convex dashboard shows function logs and scheduled-function status**, but nothing as rich as Trigger's replay UI. If debug UX matters, factor that in.
- **Crons run in UTC.** Convert before you deploy.

---

## 8. Feature-addition checklist (jobs edition)

When adding a new async feature:

1. **Classify**: single external call <10min → **action**. Multi-step or needs polling/sleeping → **Workflow**. Scheduled → **cron**. Concurrency-capped high-volume → **Workpool**.
2. **DB schema**: add a `jobs`-style table (or extend your domain table) with `status` enum + `outputUrl`/`error`. Index by the thing you'll subscribe from (project id, user id).
3. **Internal functions**: write the actions (`"use node";` if needed) with minimal args and R2-URL returns.
4. **Orchestration**: wrap in Workpool or Workflow per §1. Set retries on idempotent steps, disable on paid APIs unless they support idempotency keys.
5. **Entry point**: a public `mutation` that inserts the job row (status: pending) and calls `pool.enqueueAction` or `workflow.start`.
6. **UI**: reactive `useSuspenseQuery` on the `jobs` table. No tokens, no polling.
7. **Error path**: `onComplete` handler (Workpool) or final mutation step (Workflow) stamps `status: failed` + `error`. Client renders from the row.
8. **Tests**: Convex test runner + local dev deployment. Use seed scripts in `convex/board:seed` style.

---

## 9. Sources
- Convex Actions — https://docs.convex.dev/functions/actions (10-min timeout, 64/512 MiB memory, `"use node"`)
- Convex Scheduler — https://docs.convex.dev/scheduling/scheduled-functions (1000 scheduled/call, 8 MB args, 7-day persistence)
- Convex Crons — https://docs.convex.dev/scheduling/cron-jobs (interval/cron/named helpers, calls mutations or actions)
- Convex Platform Limits — https://docs.convex.dev/production/state/limits (16 MiB payloads, 1 MiB document, concurrency tiers)
- Workflow component — https://github.com/get-convex/workflow (durability via deterministic replay, `step.sleep`, `step.awaitEvent`, 1 MB step I/O, 8 MiB journal)
- Workpool component — https://github.com/get-convex/workpool (`maxParallelism`, retries, `onComplete`, `enqueueActionBatch`)
- Trigger.dev machines — https://trigger.dev/docs/machines (micro → large-2x; no GPU documented)
- Trigger.dev wait — https://trigger.dev/docs/wait (checkpoint after 5s, zero compute cost during wait)
- Reference apps analyzed: `/Users/nexttrack/sceneframe` (9 tasks), `/Users/nexttrack/projects/prodsnap-marketing` (5 tasks)
