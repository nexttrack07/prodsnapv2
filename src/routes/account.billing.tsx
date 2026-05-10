import { createFileRoute } from '@tanstack/react-router'
import { AccountBillingPage } from '~/components/billing/AccountBillingPage'
import { DefaultCatchBoundary } from '~/components/DefaultCatchBoundary'

export const Route = createFileRoute('/account/billing')({
  component: AccountBillingPage,
  errorComponent: DefaultCatchBoundary,
})
