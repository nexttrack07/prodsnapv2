/**
 * Structured billing error codes.
 *
 * Surfaced to the client as ConvexError data so `mapBillingError` can branch
 * on a stable code instead of substring-matching the message text. The
 * message itself is still set for logs and unknown-fallback paths, but the
 * client should prefer `err.data.code` when present.
 */
import { ConvexError } from 'convex/values'

export type BillingErrorCode =
  | 'NO_SUBSCRIPTION'
  | 'MISSING_CAPABILITY'
  | 'PRODUCT_LIMIT'
  | 'CREDITS_EXHAUSTED'
  | 'CREDITS_INSUFFICIENT'
  | 'RATE_LIMIT'

export type BillingErrorData = {
  code: BillingErrorCode
  message: string
}

export function billingError(
  code: BillingErrorCode,
  message: string,
): ConvexError<BillingErrorData> {
  return new ConvexError({ code, message })
}
