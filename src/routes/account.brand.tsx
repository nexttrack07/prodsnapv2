import { createFileRoute } from '@tanstack/react-router'
import { BrandKitPage } from '~/components/brand/BrandKitPage'

export const Route = createFileRoute('/account/brand')({
  component: BrandKitPage,
})
