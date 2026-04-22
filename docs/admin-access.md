# Admin Access Runbook

## Overview

Admin access is gated by Clerk `publicMetadata.role === "admin"`. This metadata is writable only via the Clerk Backend API or Clerk Dashboard — clients cannot self-elevate.

Two env vars must be set for full admin gate enforcement:

- `CLERK_SECRET_KEY` — Clerk Backend API secret (already required for billing; set in Convex dashboard env vars)
- `CLERK_ADMIN_USER_IDS` — comma-separated list of Clerk user IDs (e.g. `user_abc123,user_def456`) for query/mutation-level checks

## Granting Admin Access

### Step 1 — Set publicMetadata in Clerk Dashboard

1. Go to [Clerk Dashboard](https://dashboard.clerk.com) → your application
2. Navigate to **Users** → select the target user
3. Click **Metadata** tab → **Public**
4. Set the JSON to include `"role": "admin"`:
   ```json
   { "role": "admin" }
   ```
5. Save. The change takes effect immediately for new sessions; existing sessions refresh on next token renewal.

### Step 2 — Add user ID to CLERK_ADMIN_USER_IDS

1. Copy the user's Clerk ID from the Clerk Dashboard (format: `user_XXXX`)
2. In the [Convex Dashboard](https://dashboard.convex.dev) → your deployment → **Settings** → **Environment Variables**
3. Add or update `CLERK_ADMIN_USER_IDS` with the comma-separated list of admin user IDs:
   ```
   user_abc123,user_def456
   ```
4. Save. Convex functions pick up env var changes immediately.

## Revoking Admin Access

1. In Clerk Dashboard: set the user's `publicMetadata` back to `{}` (or remove the `role` key)
2. In Convex Dashboard: remove the user's ID from `CLERK_ADMIN_USER_IDS`

## How the Gate Works

- **Client-side** (`src/routes/admin.tsx`): reads `user.publicMetadata.role` via Clerk's `useUser()` hook. Non-admins are redirected to `/` immediately. This is a UX gate only — server-side checks are authoritative.
- **Actions** (`convex/admin/playgroundActions.ts`): `requireAdmin(ctx)` calls the Clerk Backend API to verify `publicMetadata.role === "admin"` on every request. This is the authoritative server-side check.
- **Queries/Mutations** (`convex/admin/playground.ts`): `requireAdminIdentity(ctx)` verifies the caller's Clerk user ID is in `CLERK_ADMIN_USER_IDS`. Since queries/mutations cannot make external HTTP calls, this env-var check is the available gate at this layer.

## Current Admins

- faadhil1991@gmail.com (owner)
