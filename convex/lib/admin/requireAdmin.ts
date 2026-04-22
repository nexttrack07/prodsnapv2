"use node";

/**
 * Server-side admin gate for Convex functions.
 *
 * For ACTIONS: requireAdmin(ctx) calls the Clerk Backend API to verify
 * publicMetadata.role === 'admin'. This is the canonical strong check —
 * publicMetadata is writable ONLY from the Clerk Backend API, not by clients.
 *
 * For QUERIES/MUTATIONS: requireAdminIdentity(ctx) verifies the caller is
 * authenticated and their subject matches the CLERK_ADMIN_USER_IDS env var
 * (comma-separated Clerk user IDs). This is the only option since
 * queries/mutations cannot make external HTTP calls. The action-level gate
 * is the primary enforcement for sensitive mutations.
 *
 * Admin role assignment: set publicMetadata.role = "admin" on the target user
 * in the Clerk Dashboard (Users → select user → Metadata → Public), AND add
 * their Clerk user ID to the CLERK_ADMIN_USER_IDS env var in the Convex
 * dashboard. See docs/admin-access.md for the runbook.
 */

import { createClerkClient } from "@clerk/backend";
import type { ActionCtx, MutationCtx, QueryCtx } from "../../_generated/server";

export async function requireAdmin(ctx: ActionCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Admin access required: not authenticated");
  }

  const clerk = createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY,
  });

  // identity.subject is the Clerk user ID (e.g. "user_abc123")
  const clerkUserId = identity.subject;
  const user = await clerk.users.getUser(clerkUserId);

  const role = (user.publicMetadata as Record<string, unknown>)?.role;
  if (role !== "admin") {
    throw new Error("Admin access required: insufficient permissions");
  }

  return clerkUserId;
}

export async function requireAdminIdentity(
  ctx: QueryCtx | MutationCtx,
): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Admin access required: not authenticated");
  }

  const adminIds = (process.env.CLERK_ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (adminIds.length === 0 || !adminIds.includes(identity.subject)) {
    throw new Error("Admin access required: insufficient permissions");
  }

  return identity.subject;
}
