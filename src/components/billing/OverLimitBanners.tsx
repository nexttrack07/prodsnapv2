import { Alert, Anchor } from '@mantine/core'
import { IconBolt, IconPhoto } from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'

/**
 * Layout-wide banners for over-limit states. Rendered in studio.tsx so they
 * appear on all /studio/* routes, not just the index.
 */
export function OverLimitBanners() {
  const billingStatus = useQuery(api.billing.syncPlan.getBillingStatus)

  if (!billingStatus || !billingStatus.signedIn || !billingStatus.plan) {
    return null
  }

  const creditsExhausted =
    billingStatus.creditsTotal > 0 &&
    billingStatus.creditsUsed >= billingStatus.creditsTotal

  const atProductLimit =
    billingStatus.productLimit !== null &&
    billingStatus.productCount >= billingStatus.productLimit

  const resetDate = billingStatus.resetsOn
    ? new Date(billingStatus.resetsOn).toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
      })
    : null

  return (
    <>
      {creditsExhausted && (
        <Alert
          color="red"
          icon={<IconBolt size={16} />}
          mb="md"
          title="Credits exhausted"
          radius={0}
          styles={{ root: { borderRadius: 0, borderLeft: 'none', borderRight: 'none' } }}
        >
          You have used all {billingStatus.creditsTotal} credits for this month.
          {resetDate ? ` They reset on ${resetDate}.` : ''}{' '}
          <Anchor component={Link} to="/pricing" fw={500}>
            Upgrade to Pro
          </Anchor>{' '}
          for 5x more.
        </Alert>
      )}

      {atProductLimit && (
        <Alert
          color="yellow"
          icon={<IconPhoto size={16} />}
          mb="md"
          title="Product limit reached"
          radius={0}
          styles={{ root: { borderRadius: 0, borderLeft: 'none', borderRight: 'none' } }}
        >
          You have {billingStatus.productCount} products but your plan allows{' '}
          {billingStatus.productLimit}.{' '}Archive products or{' '}
          <Anchor component={Link} to="/pricing" fw={500}>
            upgrade to Pro
          </Anchor>
          .
        </Alert>
      )}
    </>
  )
}
