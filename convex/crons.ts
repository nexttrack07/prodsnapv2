import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

crons.cron('clear messages table', '0,20,40 * * * *', internal.board.clear)

crons.hourly(
  'refresh stale billing periods',
  { minuteUTC: 7 },
  internal.billing.syncPlan.refreshStalePeriodsInternal,
)

crons.interval(
  'retry failed billing webhooks',
  { minutes: 1 },
  internal.billing.webhookHandler.retryFailedWebhooks,
  {},
)

crons.daily(
  'seed-credit-pricing',
  { hourUTC: 0, minuteUTC: 0 },
  internal.lib.billing.seedPricing.seedPricing,
)

// Sweep userPlans for trials ending within the next 3 days and email each
// user once per period. Webhook coverage for trial_end is inconsistent across
// Clerk billing event subtypes, so we own the schedule ourselves.
crons.daily(
  'notify-trials-ending',
  { hourUTC: 14, minuteUTC: 0 }, // ~9am Central, post-coffee, pre-rage
  internal.billing.notifications.scanAndNotifyTrialsEnding,
)

export default crons
