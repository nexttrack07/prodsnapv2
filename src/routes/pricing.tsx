import { createFileRoute } from '@tanstack/react-router'
import { PricingPage } from '~/components/billing/PricingPage'

export const Route = createFileRoute('/pricing')({
  component: PricingPage,
  validateSearch: (search: Record<string, unknown>) => {
    // No required search params for /pricing — checkout carries its own.
    return {}
  },
})
