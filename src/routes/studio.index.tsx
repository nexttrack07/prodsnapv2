/**
 * Legacy /studio path. Now redirects to /home — the work-oriented dashboard
 * that replaced the old product-grid view. Product detail pages still live
 * at /studio/$productId.
 */
import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/studio/')({
  beforeLoad: () => {
    throw redirect({ to: '/home' })
  },
})
