import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

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

// Mark templateGenerations rows that are stuck in 'queued'/'running' as
// 'failed'. Client-side timeout only fires while the tab is open; this cron
// provides server-side reconciliation for orphaned workflows.
crons.interval(
  'mark-stuck-generations-failed',
  { minutes: 2 },
  internal.studio.markStuckGenerationsFailed,
  {},
)

// Weekly return trigger: email owners of exported Ad Tests that have had ~a
// week to run, prompting them to log winners and start the next test. Daily
// cadence (not weekly) so a missed run still catches the backlog next day;
// each test is nudged at most once via lastLifecycleEmailSentAt.
crons.daily(
  'ad-test-weekly-lifecycle',
  { hourUTC: 15, minuteUTC: 0 }, // ~10am Central
  internal.adTestLifecycle.scanAndNotifyAdTestLifecycle,
)

export default crons
