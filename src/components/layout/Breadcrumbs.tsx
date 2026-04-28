/**
 * Breadcrumb strip rendered at the top of the AppShell main area. Derives
 * trail from the current pathname plus a small route-label map. For dynamic
 * segments like `/studio/:productId` we look up the product name via Convex
 * so the user sees "Hydra-Glow Serum" instead of the raw id.
 */
import { Link, useRouterState } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { Anchor, Breadcrumbs as MantineBreadcrumbs, Text } from '@mantine/core'
import { IconChevronRight } from '@tabler/icons-react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { capitalizeWords } from '../../utils/strings'

type Crumb = { label: string; href?: string }

const STATIC_LABELS: Record<string, string> = {
  '/home': 'Home',
  '/account/brand': 'Brand kit',
  '/account/billing': 'Billing',
  '/admin': 'Admin',
  '/admin/templates': 'Templates',
  '/admin/audit': 'Audit',
  '/admin/prompts': 'Prompts',
  '/admin/playground': 'Playground',
  '/pricing': 'Pricing',
  '/studio': 'Products',
}

export function Breadcrumbs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const crumbs = buildCrumbs(pathname)

  // Dynamic product detail page enrichment.
  const productMatch = pathname.match(/^\/studio\/([^/]+)/)
  const productId = (productMatch?.[1] ?? null) as Id<'products'> | null
  const product = useQuery(
    api.products.getProduct,
    productId ? { productId } : 'skip',
  )
  if (productId && product) {
    crumbs.push({ label: capitalizeWords(product.name) })
  } else if (productId && !product) {
    crumbs.push({ label: 'Product' })
  }

  if (crumbs.length === 0) return null
  if (crumbs.length === 1 && pathname === '/home') {
    // Don't render a single "Home" crumb on the home page itself.
    return null
  }

  return (
    <MantineBreadcrumbs
      separator={<IconChevronRight size={14} stroke={1.5} />}
      separatorMargin="xs"
    >
      {crumbs.map((c, i) => {
        const isLast = i === crumbs.length - 1
        if (c.href && !isLast) {
          return (
            <Anchor
              key={`${c.label}-${i}`}
              component={Link}
              to={c.href}
              size="sm"
              c="dark.2"
              underline="never"
            >
              {c.label}
            </Anchor>
          )
        }
        return (
          <Text key={`${c.label}-${i}`} size="sm" c={isLast ? 'white' : 'dark.2'} fw={isLast ? 600 : 400}>
            {c.label}
          </Text>
        )
      })}
    </MantineBreadcrumbs>
  )
}

function buildCrumbs(pathname: string): Array<Crumb> {
  if (pathname === '/home') {
    return [{ label: 'Home' }]
  }

  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) return []

  // Always anchor crumbs at Home for in-app pages.
  const trail: Array<Crumb> = [{ label: 'Home', href: '/home' }]

  let cumulative = ''
  for (let i = 0; i < segments.length; i++) {
    cumulative += `/${segments[i]}`
    const known = STATIC_LABELS[cumulative]
    // Skip the synthetic /studio crumb when we'll be appending a product name
    // anyway — keeps the trail tight.
    if (cumulative === '/studio' && segments.length > i + 1) continue
    if (known) {
      trail.push({
        label: known,
        href: i === segments.length - 1 ? undefined : cumulative,
      })
    } else if (cumulative.startsWith('/studio/') && i === segments.length - 1) {
      // Skip — the product name is appended by the caller after Convex lookup.
    } else if (i === segments.length - 1) {
      trail.push({
        label: capitalizeWords(segments[i].replace(/-/g, ' ')),
      })
    }
  }

  return trail
}
