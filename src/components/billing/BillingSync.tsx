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
import { useCallback, useEffect, useRef } from 'react'
import { useAction, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'

const DEBOUNCE_MS = 30_000

export function BillingSync() {
  const syncPlan = useAction(api.billing.syncPlan.syncUserPlan)
  const billingStatus = useQuery(api.billing.syncPlan.getBillingStatus)
  const hasSynced = useRef(false)
  const lastSyncAt = useRef(0)

  const runSync = useCallback(
    (reason: string) => {
      const now = Date.now()
      if (now - lastSyncAt.current < DEBOUNCE_MS) return
      lastSyncAt.current = now
      syncPlan().catch((err) => {
        console.warn(`[BillingSync] failed to sync plan (${reason}):`, err)
      })
    },
    [syncPlan],
  )

  // Mount-time sync (runs once)
  useEffect(() => {
    if (hasSynced.current) return
    hasSynced.current = true
    lastSyncAt.current = Date.now()
    syncPlan().catch((err) => {
      console.warn('[BillingSync] failed to sync plan (mount):', err)
    })
  }, [syncPlan])

  // Re-sync when the user returns to the tab
  useEffect(() => {
    const handleFocus = () => runSync('focus')
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [runSync])

  // Re-sync when the billing period is detected as stale
  useEffect(() => {
    if (billingStatus?.resetsOn == null) return
    if (billingStatus.resetsOn < Date.now()) {
      runSync('stale-period')
    }
  }, [billingStatus?.resetsOn, runSync])

  return null
}
