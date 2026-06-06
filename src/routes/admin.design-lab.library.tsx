import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/design-lab/library')({
  beforeLoad: () => { throw redirect({ to: '/admin/design-lab' }) },
})
