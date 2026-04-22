/**
 * Shared types for the billing UI layer.
 *
 * Clerk's `BillingPlanResource` lives inside their type packages but isn't
 * re-exported cleanly via `@clerk/react`. Rather than import across
 * package boundaries that may churn, we define a narrow summary type with
 * just the fields our UI consumes. usePlans() output is compatible via
 * structural typing.
 */
export type BillingFeatureSummary = {
  id: string
  name: string
  slug: string
  description?: string | null
}

export type BillingMoneyAmountSummary = {
  amount: number
  amountFormatted: string
  currency: string
  currencySymbol: string
}

export type BillingPlanSummary = {
  id: string
  name: string
  slug: string
  description: string | null
  fee: BillingMoneyAmountSummary | null
  annualFee: BillingMoneyAmountSummary | null
  annualMonthlyFee: BillingMoneyAmountSummary | null
  hasBaseFee: boolean
  forPayerType: 'user' | 'org'
  features: BillingFeatureSummary[]
  freeTrialDays: number | null
  freeTrialEnabled: boolean
}
