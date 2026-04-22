/**
 * Small header indicator showing the user's monthly credit consumption.
 * Reads `getBillingStatus` (Convex reactive query) so it auto-updates as
 * generations happen.
 *
 * Rendering variants:
 *   - Pre-subscription user (plan == null / signedIn == false) → hidden
 *   - Normal: "47/100 credits · resets Nov 1"
 *   - Low (<=10% remaining): colored warning
 *   - Exhausted (0 left): red "Out of credits"
 */
import { Badge, Text, Tooltip } from '@mantine/core'
import { IconBolt } from '@tabler/icons-react'
import { useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'

export function CreditsIndicator() {
  const status = useQuery(api.billing.syncPlan.getBillingStatus)

  if (!status || !status.signedIn || !status.plan || !status.creditsTotal) {
    return null
  }

  const used = status.creditsUsed
  const total = status.creditsTotal
  const remaining = Math.max(0, total - used)
  const isExhausted = remaining <= 0
  const isLow = !isExhausted && remaining / total <= 0.1

  const color = isExhausted ? 'red' : isLow ? 'yellow' : 'brand'
  const resetDate = status.resetsOn
    ? new Date(status.resetsOn).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
    : null

  const label = isExhausted
    ? `0/${total} credits — resets ${resetDate ?? ''}`
    : `${used}/${total} credits · resets ${resetDate ?? ''}`

  return (
    <Tooltip
      label={`Monthly generation credits. Each generation uses one credit.`}
      position="bottom"
    >
      <Badge
        color={color}
        variant={isExhausted || isLow ? 'filled' : 'light'}
        leftSection={<IconBolt size={12} />}
        size="md"
        styles={{ root: { textTransform: 'none', fontWeight: 500 } }}
      >
        <Text component="span" size="xs">
          {label}
        </Text>
      </Badge>
    </Tooltip>
  )
}
