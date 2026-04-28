import { createFileRoute } from '@tanstack/react-router'
import { Container } from '@mantine/core'
import type { Id } from '../../convex/_generated/dataModel'
import { AdDetailContent } from '~/components/ads/AdDetailPanel'

export const Route = createFileRoute('/ads/$adId')({
  component: AdDetailPage,
})

function AdDetailPage() {
  const { adId } = Route.useParams()

  return (
    <Container size="sm" py="xl">
      <AdDetailContent
        adId={adId as Id<'templateGenerations'>}
        showBackLink
      />
    </Container>
  )
}
