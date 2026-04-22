import { createFileRoute } from '@tanstack/react-router'
import { AccountBillingPage } from '~/components/billing/AccountBillingPage'

export const Route = createFileRoute('/account/billing')({
  component: AccountBillingPage,
})
