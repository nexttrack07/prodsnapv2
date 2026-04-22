/**
 * Rendered after `checkout.confirm()` succeeds but BEFORE `finalize()`
 * navigates. Forces a Clerk session reload so the new subscription state
 * hits Convex, then polls our server-side plan query until the plan is
 * visible. Only THEN do we navigate the user into the studio.
 *
 * Covers the primary conversion path from the plan's pre-mortem Scenario 4.
 * Without this, a user who just paid would immediately get "No active
 * subscription" on their first paid mutation because Convex is still
 * holding a stale JWT / userPlans row.
 */
import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
} from '@mantine/core'
import { useAction, useQuery } from 'convex/react'
import { useClerk } from '@clerk/react'
import { api } from '../../../convex/_generated/api'

export type PostCheckoutInterstitialProps = {
  /** Open the modal when checkout.confirm succeeds. */
  open: boolean
  /** Called once the new plan is visible server-side (ready to finalize). */
  onPlanActive: () => void
}

const POLL_INTERVAL_MS = 500
const TIMEOUT_MS = 10_000

export function PostCheckoutInterstitial({
  open,
  onPlanActive,
}: PostCheckoutInterstitialProps) {
  const clerk = useClerk()
  const syncUserPlan = useAction(api.billing.syncPlan.syncUserPlan)
  const status = useQuery(
    api.billing.syncPlan.getBillingStatus,
    open ? {} : 'skip',
  )
  const [timedOut, setTimedOut] = useState(false)
  const startedAtRef = useRef<number | null>(null)

  // On open, trigger a fresh JWT + sync + start the polling timer.
  useEffect(() => {
    if (!open) {
      setTimedOut(false)
      startedAtRef.current = null
      return
    }
    startedAtRef.current = Date.now()
    // Force the client to get a fresh session token reflecting the new plan.
    // (Convex's provider hard-codes the 'convex' template so this reloads
    // the right token as well.)
    void clerk.session?.reload()
    // Kick the server-side sync.
    void syncUserPlan().catch(() => {
      // swallow — getBillingStatus will still reflect the state on next poll.
    })
    // Timeout ticker.
    const t = setTimeout(() => setTimedOut(true), TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [open, clerk, syncUserPlan])

  // Poll-like behavior: Convex useQuery is reactive, but we also trigger
  // syncUserPlan again periodically while we wait, since the first call
  // might race ahead of Clerk's backend consistency.
  useEffect(() => {
    if (!open || timedOut) return
    const interval = setInterval(() => {
      void syncUserPlan().catch(() => {})
    }, POLL_INTERVAL_MS * 4) // every ~2s, not every 500ms
    return () => clearInterval(interval)
  }, [open, timedOut, syncUserPlan])

  // When the server reports a plan, resolve.
  useEffect(() => {
    if (!open) return
    if (status && status.plan) onPlanActive()
  }, [open, status, onPlanActive])

  return (
    <Modal
      opened={open}
      onClose={() => {}} // not dismissible while activating
      withCloseButton={false}
      closeOnClickOutside={false}
      closeOnEscape={false}
      centered
      title="Activating your plan…"
      size="sm"
    >
      <Stack gap="md" align="center" py="md">
        {!timedOut ? (
          <>
            <Loader size="lg" color="brand" />
            <Text c="dark.1" size="sm" ta="center">
              Your subscription is syncing. This usually takes a few seconds.
            </Text>
          </>
        ) : (
          <>
            <Alert color="yellow" variant="light" w="100%">
              Still activating — your subscription may take a few more
              moments to sync. Try refreshing the page.
            </Alert>
            <Group gap="sm">
              <Button
                variant="default"
                onClick={() => {
                  setTimedOut(false)
                  startedAtRef.current = Date.now()
                  void clerk.session?.reload()
                  void syncUserPlan().catch(() => {})
                  setTimeout(() => setTimedOut(true), TIMEOUT_MS)
                }}
              >
                Retry
              </Button>
              <Button
                color="brand"
                onClick={() => window.location.reload()}
              >
                Refresh page
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  )
}
