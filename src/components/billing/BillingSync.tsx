/**
 * Invisible component that syncs the signed-in user's Clerk plan into the
 * Convex `userPlans` table on mount. Must be rendered inside an
 * `<Authenticated>` boundary — will no-op if called without auth.
 *
 * This is how server-side billing enforcement gets the user's plan:
 *   1. User signs in.
 *   2. <BillingSync/> mounts and fires the `syncUserPlan` action once.
 *   3. Action calls Clerk Backend API, writes userPlans row.
 *   4. All subsequent paid Convex mutations read from userPlans
 *      via `requireCapability` / `requireCredit` / `requireProductLimit`.
 *
 * If sync fails, we log and move on — enforcement helpers will fall through
 * to "no active subscription" behavior which correctly sends the user to
 * /pricing. We don't want sync failures to block app render.
 */
import { useEffect, useRef } from 'react'
import { useAction } from 'convex/react'
import { api } from '../../../convex/_generated/api'

export function BillingSync() {
  const syncPlan = useAction(api.billing.syncPlan.syncUserPlan)
  const hasSynced = useRef(false)

  useEffect(() => {
    if (hasSynced.current) return
    hasSynced.current = true
    syncPlan().catch((err) => {
      // Surface to console in dev; in prod, Convex logs capture it too.
      // Not user-facing — enforcement will handle stale/missing state.
      console.warn('[BillingSync] failed to sync plan:', err)
    })
  }, [syncPlan])

  return null
}
