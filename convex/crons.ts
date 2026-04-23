import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

crons.cron('clear messages table', '0,20,40 * * * *', internal.board.clear)

crons.hourly(
  'refresh stale billing periods',
  { minuteUTC: 7 },
  internal.billing.syncPlan.refreshStalePeriodsInternal,
)

export default crons
