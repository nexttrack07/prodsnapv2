import { createFileRoute } from '@tanstack/react-router'
import { CheckoutForm } from '~/components/billing/CheckoutForm'

type CheckoutSearch = {
  planId: string
  period: 'month' | 'annual'
}

export const Route = createFileRoute('/checkout')({
  validateSearch: (search: Record<string, unknown>): CheckoutSearch => {
    const planId = typeof search.planId === 'string' ? search.planId : ''
    const periodRaw = typeof search.period === 'string' ? search.period : 'month'
    const period: 'month' | 'annual' =
      periodRaw === 'annual' ? 'annual' : 'month'
    return { planId, period }
  },
  component: CheckoutRoute,
})

function CheckoutRoute() {
  const { planId, period } = Route.useSearch()
  if (!planId) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        Missing planId — <a href="/pricing">pick a plan</a>.
      </div>
    )
  }
  return <CheckoutForm planId={planId} period={period} />
}
