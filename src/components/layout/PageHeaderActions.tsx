/**
 * Tiny helper that lets a route-level page render content into the
 * AppShellLayout's breadcrumb-row right slot (`#page-header-actions`).
 *
 * Usage:
 *   <PageHeaderActions>
 *     <ActionIcon ...><IconTrash /></ActionIcon>
 *   </PageHeaderActions>
 *
 * Mounts a React portal once the slot is in the DOM. No-op on routes
 * that don't render an AppShellLayout (marketing / wizard).
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export function PageHeaderActions({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setTarget(document.getElementById('page-header-actions'))
    return () => setTarget(null)
  }, [])

  if (!target) return null
  return createPortal(children, target)
}
