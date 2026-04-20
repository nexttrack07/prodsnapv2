# Project Patterns Reference

Captured from the Trellaux demo before removal. Use these as the blueprint when building the real app. File paths reference the demo's location; mirror the shape, not the domain.

---

## 1. Stack overview

- **Frontend**: React 19 + TanStack Router (file-based) + TanStack Start (SSR)
- **Data layer**: Convex (realtime DB + functions) bridged to TanStack Query via `@convex-dev/react-query`
- **Validation**: `convex/values` server-side, `zod` client-side (for `FormData` parsing)
- **Styling**: Tailwind v4 via `@tailwindcss/vite`
- **Build**: Vite + `@tanstack/react-start/plugin/vite`

---

## 2. Convex backend

### 2.1 Schema with validators (`convex/schema.ts`)

```ts
import { defineSchema, defineTable } from 'convex/server'
import { type Infer, v } from 'convex/values'

const schema = defineSchema({
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
})
export default schema
```

**Key ideas**
- Define tables with `v.*` validators — these are enforced at insert/patch time.
- Add a named `.index(name, [fields])` for every lookup you'll run. Use these in queries via `.withIndex('name', q => q.eq(...))`.
- Keep a **business id** (`v.string()`) alongside Convex's `_id` when the id needs to be stable/shareable (URLs, foreign keys across tables). Look up by the business id through the `'id'` index.

### 2.2 Reusable argument validators

Derive partial/update validators from the table validator so mutation `args` stay in sync with the schema:

```ts
const board = schema.tables.boards.validator
export const updateBoardSchema = v.object({
  id: board.fields.id,
  name: v.optional(board.fields.name),
  color: v.optional(v.string()),
})

// Strip fields for "create" input (id/order are generated server-side)
const { order, id, ...rest } = schema.tables.columns.validator.fields
export const newColumnsSchema = v.object(rest)

// Exportable TS types for the whole app
export type Board = Infer<typeof board>
```

**Rule of thumb**: if a mutation's args are a subset or variant of a table row, derive the validator from the table validator — don't redeclare.

### 2.3 Queries and mutations (`convex/board.ts`)

```ts
import { v } from 'convex/values'
import { type QueryCtx, internalMutation, mutation, query } from './_generated/server'

export const getBoards = query(async (ctx) => {
  return await ctx.db.query('boards').collect()
})

export const getBoard = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const board = await ctx.db
      .query('boards')
      .withIndex('id', (q) => q.eq('id', id))
      .unique()
    return board
  },
})

export const createItem = mutation({
  args: schema.tables.items.validator,
  handler: async (ctx, item) => {
    await ensureBoardExists(ctx, item.boardId)
    await ctx.db.insert('items', item)
  },
})
```

**Patterns to reuse**
- **`query` vs `mutation` vs `internalMutation`**: reads / writes / writes callable only from other Convex functions (crons, actions). Exposed via `api.*` or `internal.*`.
- **Two call forms**: bare `query(async (ctx) => ...)` for no-arg functions, or `query({ args, handler })` when you want validated input.
- **Index-based lookups** are the only way to filter efficiently: `.withIndex('board', q => q.eq('boardId', boardId)).collect()`.
- **`.unique()`** asserts exactly one result (throws otherwise). Use it for id-based lookups.
- **Parallel fan-out** with `Promise.all`:
  ```ts
  const [columns, items] = await Promise.all([
    ctx.db.query('columns').withIndex('board', q => q.eq('boardId', id)).collect(),
    ctx.db.query('items').withIndex('board', q => q.eq('boardId', id)).collect(),
  ])
  ```
- **Invariants for existence checks**: extract `ensureBoardExists(ctx, id)`-style helpers that `.unique()` then `invariant(...)`. Keeps mutation bodies focused on the write.
- **Strip system fields before returning** when the client doesn't need them:
  ```ts
  const { _id, _creationTime, ...rest } = doc
  ```

### 2.4 Cron jobs (`convex/crons.ts`)

```ts
import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()
crons.cron('reset demo data', '0,20,40 * * * *', internal.board.clear)
export default crons
```

Crons call `internalMutation`s (via `internal.*`), never public `api.*`.

### 2.5 Invariant helper (`convex/invariant.ts`)

```ts
export function invariant(value: unknown, message?: string): asserts value {
  if (!value) throw new Error(message ?? 'Invariant failed')
}
```

Duplicated on the client at `src/invariant.ts`. Use it liberally after lookups so TS narrows to non-null and misuse throws loudly.

---

## 3. Client data layer — Convex ↔ TanStack Query

### 3.1 Wiring (`src/router.tsx`)

```ts
const CONVEX_URL = (import.meta as any).env.VITE_CONVEX_URL!
const convexQueryClient = new ConvexQueryClient(CONVEX_URL)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryKeyHashFn: convexQueryClient.hashFn(),
      queryFn: convexQueryClient.queryFn(),
    },
  },
  mutationCache: new MutationCache({
    onError: (error) => toast(error.message, { className: 'bg-red-500 text-white' }),
  }),
})
convexQueryClient.connect(queryClient)

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  context: { queryClient },
  Wrap: ({ children }) => (
    <ConvexProvider client={convexQueryClient.convexClient}>
      {children}
    </ConvexProvider>
  ),
  scrollRestoration: true,
})
setupRouterSsrQueryIntegration({ router, queryClient })
```

**What this buys you**
- Convex queries are cached + deduped by React Query.
- A **single `mutationCache.onError`** turns every unhandled mutation error into a toast — no per-call `try/catch`.
- `setupRouterSsrQueryIntegration` dehydrates the query cache on SSR and rehydrates on the client, so `loader` prefetches cross the wire.
- `defaultPreload: 'intent'` prefetches route data on link hover.

### 3.2 Centralized query keys (`src/queries.ts`)

```ts
export const boardQueries = {
  list: () => convexQuery(api.board.getBoards, {}),
  detail: (id: string) => convexQuery(api.board.getBoard, { id }),
}
```

`convexQuery(...)` returns a **QueryOptions** object — pass it to `useSuspenseQuery`, `useQuery`, `queryClient.ensureQueryData`, `prefetchQuery`, etc. Always funnel queries through a per-domain object like this so there's one place to refactor.

### 3.3 Consuming queries in components

```ts
// route loader (runs during navigation, before render)
loader: async ({ params, context: { queryClient } }) => {
  await queryClient.ensureQueryData(boardQueries.detail(params.boardId))
}

// component (suspends until data is ready)
const { data: board } = useSuspenseQuery(boardQueries.detail(boardId))
```

Pattern: **loader prefetches, component suspends.** The loader populates the cache during route transition; the component reads from the cache via `useSuspenseQuery` and never sees a loading state mid-render. Pair with `pendingComponent: () => <Loader />` on the route for the initial navigation fallback.

### 3.4 Mutations with optimistic updates

```ts
export function useCreateColumnMutation() {
  const mutationFn = useConvexMutation(api.board.createColumn)
    .withOptimisticUpdate((localStore, args) => {
      const board = localStore.getQuery(api.board.getBoard, { id: args.boardId })
      if (!board) return
      const newBoard = {
        ...board,
        columns: [
          ...board.columns,
          { ...args, order: board.columns.length + 1, id: Math.random() + '', items: [] },
        ],
      }
      localStore.setQuery(api.board.getBoard, { id: board.id }, newBoard)
    })
  return useMutation({ mutationFn })
}
```

**Template shape**
1. `useConvexMutation(api.X.Y)` — type-safe mutation binding.
2. `.withOptimisticUpdate((localStore, args) => { ... })` — read current cached query, construct the next state, write it back. Reverts automatically on server error.
3. Wrap with TanStack `useMutation({ mutationFn })` so you get `mutate`, `isPending`, `variables`, `error`, etc. in components.
4. `localStore.getQuery` / `localStore.setQuery` take the same `api.X.Y, args` pair used for reads — the args object must match exactly (that's the cache key).

**Reading the in-flight value for UI feedback** (see `Board.tsx`):
```tsx
value={updateBoardMutation.isPending && updateBoardMutation.variables.name
  ? updateBoardMutation.variables.name
  : board.name}
```
Lets you show the pending value immediately without waiting for server confirmation.

### 3.5 When to skip optimistic updates
`useUpdateBoardMutation` uses a plain `useConvexMutation(...)` with no optimistic handler — Convex's realtime subscription will push the new value shortly. Skip the optimistic path when the update is rare or the UI can tolerate ~1 round-trip of staleness.

---

## 4. Routing — TanStack Router + Start

### 4.1 Root route with context (`src/routes/__root.tsx`)

```ts
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [{ charSet: 'utf-8' }, ...seo({ title: '...', description: '...' })],
    links: [{ rel: 'stylesheet', href: appCss }, ...],
  }),
  errorComponent: (props) => <RootDocument><DefaultCatchBoundary {...props} /></RootDocument>,
  notFoundComponent: () => <NotFound />,
  component: RootComponent,
})
```

- `createRootRouteWithContext<T>()` declares what the root expects from `createRouter({ context })`. This is how `queryClient` becomes available to every loader.
- `head()` is the single source of truth for `<head>` tags — rendered by `<HeadContent />` inside the document shell.
- `errorComponent` / `notFoundComponent` on the root catch anything unhandled below.

### 4.2 File-based leaf routes

```ts
// src/routes/boards.$boardId.tsx
export const Route = createFileRoute('/boards/$boardId')({
  component: Home,
  pendingComponent: () => <Loader />,
  loader: async ({ params, context: { queryClient } }) => {
    await queryClient.ensureQueryData(boardQueries.detail(params.boardId))
  },
})

function Home() {
  const { boardId } = Route.useParams()
  return <Board boardId={boardId} />
}
```

- File name encodes the path. `$param` is a URL param. `.gen.ts` is auto-generated — never hand-edit.
- `Route.useParams()` / `Route.useSearch()` are typed accessors — avoid the generic `useParams()` import.
- `pendingComponent` shows during loader execution on navigation.

### 4.3 SSR-safe router factory

The `getRouter()` function in `src/router.tsx` is called both on the server (per request) and on the client (once). That's why the `QueryClient` is constructed inside the factory — each request needs its own cache. `notifyManager.setScheduler(window.requestAnimationFrame)` runs only in the browser via the `typeof document !== 'undefined'` guard.

---

## 5. TanStack Start server functions

For server-only work that isn't a Convex function (hitting third-party APIs, secrets, Node-only libs):

```ts
// src/utils/posts.tsx
import { createServerFn } from '@tanstack/react-start'

export const fetchPost = createServerFn({ method: 'GET' })
  .inputValidator((postId: string) => postId)
  .handler(async ({ data }) => {
    const post = await axios.get(`...${data}`).then(r => r.data)
      .catch(err => { if (err.status === 404) throw notFound(); throw err })
    return post
  })
```

- `.inputValidator(fn)` — runs on the server, receives raw input, returns the validated value exposed as `data` in the handler. Use zod here for anything non-trivial.
- Call like any async function from the client; TanStack Start handles the RPC. Pair with `queryClient.ensureQueryData({ queryKey, queryFn: () => fetchPost(id) })` inside a route loader.
- Throw `notFound()` / `redirect()` from a handler — the router will render the right boundary.

Convex already covers realtime DB access, so reserve server functions for **non-Convex** work.

---

## 6. Forms and client-side validation

### 6.1 Zod schemas mirroring Convex validators (`src/db/schema.ts`)

```ts
import { z } from 'zod'

export const itemSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string().optional(),
  order: z.coerce.number(),
  columnId: z.string().uuid(),
  boardId: z.coerce.string(),
})
export const deleteItemSchema = itemSchema.pick({ id: true, boardId: true })
```

Why two layers: `convex/values` can't parse `FormData` string blobs. Zod coerces strings → numbers, validates shape client-side, then hands a clean object to the Convex mutation (which validates again server-side).

### 6.2 Uncontrolled form → mutation (`NewCard.tsx`)

```tsx
<form onSubmit={(event) => {
  event.preventDefault()
  const formData = new FormData(event.currentTarget)
  formData.set('id', crypto.randomUUID())
  mutate(itemSchema.parse(Object.fromEntries(formData.entries())))
}}>
  <input type="hidden" name="boardId" value={boardId} />
  <input type="hidden" name="columnId" value={columnId} />
  <input type="hidden" name="order" value={nextOrder} />
  <textarea name="title" required ref={textAreaRef} />
</form>
```

Uncontrolled inputs + `FormData` + `zod.parse` is a lightweight alternative to react-hook-form for small forms. `crypto.randomUUID()` generates ids client-side so optimistic updates have a stable id before the server responds.

### 6.3 Field-name constants (`src/types.ts`)

```ts
export const ItemMutationFields = {
  id: { type: String, name: 'id' },
  columnId: { type: String, name: 'columnId' },
  order: { type: Number, name: 'order' },
  title: { type: String, name: 'title' },
} as const
```

Keeps `<input name=...>` and the zod keys in sync — rename once, everything follows.

### 6.4 Inline edit component (`EditableText.tsx`)

Pattern worth stealing verbatim: a button that flips into a form on click, commits on blur/Enter, reverts on Escape, restores focus to the button after commit. `editState` prop is optional so the parent can hoist the state when it needs to coordinate (e.g., column drag is disabled while editing).

---

## 7. UX plumbing

### 7.1 Global error surfacing
- `MutationCache.onError` → toast (see §3.1). No per-mutation try/catch needed.
- Route-level `errorComponent` → `DefaultCatchBoundary` with retry + back buttons.
- `react-hot-toast` `<Toaster />` rendered once in the root document.

### 7.2 Offline indicator (`src/hooks/useOfflineIndicator.tsx`)

```ts
onlineManager.subscribe(() => {
  if (onlineManager.isOnline()) toast.success('online', { id: 'ReactQuery', duration: 2000 })
  else toast.error('offline', { id: 'ReactQuery', duration: Infinity })
})
```

Shared toast id means online/offline toasts replace each other instead of stacking.

### 7.3 Loading indicator tied to router state

```tsx
const isLoading = useRouterState({ select: (s) => s.isLoading })
```

Drive a top-bar spinner from router state so it covers every navigation without per-route wiring.

### 7.4 SEO helper (`src/utils/seo.ts`)
One function returns the full meta array (title + description + OG + Twitter). Spread into `head().meta` on any route that wants overrides.

---

## 8. Package scripts (`package.json`)

```json
"dev": "pnpm exec convex dev --once && concurrently -r pnpm:dev:web pnpm:dev:db",
"dev:web": "vite dev",
"dev:db": "convex dev --run board:seed",
"build": "vite build && tsc --noEmit",
```

- `convex dev --once` pushes schema/functions before starting the app (needed so codegen in `convex/_generated/*` is current).
- `--run board:seed` runs a seed mutation on every dev startup — swap for your own seed function.
- `tsc --noEmit` after `vite build` catches type errors the bundler ignored.

---

## 9. Checklist when adding a new feature

1. **Schema** — add/extend a table in `convex/schema.ts`, define every index you'll query by, export `Infer` types.
2. **Derived validators** — for each mutation, derive args from the table validator (avoid redeclaring).
3. **Convex functions** — `query` for reads, `mutation` for writes, `internalMutation` for cron/action targets. Use `ensureXExists` helpers for lookup+invariant.
4. **Query keys** — add entries to a per-domain `fooQueries` object in `src/queries.ts`.
5. **Mutations hooks** — `useConvexMutation(...).withOptimisticUpdate(...)` + `useMutation({ mutationFn })` in `src/queries.ts`. Update the relevant cached query inside `withOptimisticUpdate`.
6. **Zod mirror** — if a form will parse `FormData`, mirror the Convex validator with a zod schema in `src/db/schema.ts`.
7. **Route** — create a file route, `loader: queryClient.ensureQueryData(...)`, `useSuspenseQuery(...)` in the component, `pendingComponent` for the transition fallback.
8. **Errors** — rely on `mutationCache.onError` for transient failures; only add per-call handling when you need recovery logic.
9. **Type-check** — `pnpm build` (runs `tsc --noEmit`) before considering it done.
