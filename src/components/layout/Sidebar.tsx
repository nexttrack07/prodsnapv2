/**
 * Icon-only app-shell sidebar. Narrow strip of nav icons with tooltips on
 * hover. Used inside <AppShellLayout/>. Marketing pages and wizard pages
 * don't render this.
 */
import { Link, useRouterState } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { UserButton, useUser } from '@clerk/react'
import { useMediaQuery } from '@mantine/hooks'
import {
  Box,
  Center,
  Group,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core'
import {
  IconHome2,
  IconLayoutGrid,
  IconBrush,
  IconLibrary,
  IconSparkles,
  IconReceipt,
  IconBolt,
  IconShield,
} from '@tabler/icons-react'
import { api } from '../../../convex/_generated/api'
import { LogoMark } from '../Logo'

type NavItem = {
  to?: string
  icon: typeof IconHome2
  label: string
  disabled?: boolean
  comingSoonNote?: string
}

const PRIMARY_NAV: ReadonlyArray<NavItem> = [
  { to: '/home', icon: IconHome2, label: 'Home' },
  { to: '/products', icon: IconLayoutGrid, label: 'Products' },
  { to: '/templates', icon: IconSparkles, label: 'Templates' },
  { to: '/library', icon: IconLibrary, label: 'Library' },
  { to: '/account/brand', icon: IconBrush, label: 'Brand kit' },
]

// Admin nav is included only when publicMetadata.role === 'admin'. This is
// the same client-side check the /admin route guard does; it's purely for UI
// visibility. The actual security boundary is server-side requireAdmin /
// requireAdminIdentity on every admin mutation, so a non-admin who bypasses
// the UI cannot do anything privileged.
const ADMIN_NAV_ITEM: NavItem = { to: '/admin', icon: IconShield, label: 'Admin' }
const BILLING_NAV_ITEM: NavItem = {
  to: '/account/billing',
  icon: IconReceipt,
  label: 'Billing',
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const billingStatus = useQuery(api.billing.syncPlan.getBillingStatus, {})
  const isMobile = useMediaQuery('(max-width: 768px)')
  const { user } = useUser()
  const isAdmin =
    (user?.publicMetadata as Record<string, unknown> | undefined)?.role === 'admin'
  const secondaryNav: ReadonlyArray<NavItem> = isAdmin
    ? [ADMIN_NAV_ITEM, BILLING_NAV_ITEM]
    : [BILLING_NAV_ITEM]

  return (
    <Stack h="100%" gap={0} justify="space-between" py="md" align={isMobile ? 'flex-start' : 'center'}>
      <Stack gap="xs" align={isMobile ? 'flex-start' : 'center'} w="100%">
        <Center pb="sm" w="100%" style={isMobile ? { justifyContent: 'flex-start', paddingLeft: 16 } : undefined}>
          <Tooltip label="Landing page" position="right">
            <UnstyledButton
              component={Link}
              to="/"
              aria-label="ProdSnap landing page"
              style={{ borderRadius: 4 }}
            >
              <LogoMark size="md" />
            </UnstyledButton>
          </Tooltip>
        </Center>

        <Stack gap={6} align={isMobile ? 'flex-start' : 'center'} w="100%" px={8}>
          {PRIMARY_NAV.map((item) => (
            <NavIcon key={item.label} item={item} onNavigate={onNavigate} isMobile={isMobile ?? false} />
          ))}
        </Stack>
      </Stack>

      <Stack gap={6} align={isMobile ? 'flex-start' : 'center'} w="100%" px={8}>
        {secondaryNav.map((item) => (
          <NavIcon key={item.label} item={item} onNavigate={onNavigate} isMobile={isMobile ?? false} />
        ))}

        <CreditsIcon billingStatus={billingStatus ?? null} isMobile={isMobile ?? false} />

        <Box pt={6} style={isMobile ? { paddingLeft: 4 } : undefined}>
          <UserButton
            appearance={{
              elements: {
                avatarBox: { width: 36, height: 36 },
              },
            }}
          />
        </Box>
      </Stack>
    </Stack>
  )
}

function NavIcon({
  item,
  onNavigate,
  isMobile,
}: {
  item: NavItem
  onNavigate?: () => void
  isMobile: boolean
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const Icon = item.icon
  const isActive =
    !item.disabled &&
    item.to !== undefined &&
    (item.to === '/home' ? pathname === '/home' : pathname.startsWith(item.to))

  const buttonStyle: React.CSSProperties = {
    width: isMobile ? '100%' : 40,
    height: 40,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: isMobile ? 'flex-start' : 'center',
    gap: isMobile ? 10 : 0,
    paddingLeft: isMobile ? 8 : 0,
    transition: 'background-color 120ms ease, color 120ms ease',
    backgroundColor: isActive ? 'var(--mantine-color-dark-6)' : 'transparent',
    color: item.disabled
      ? 'var(--mantine-color-dark-3)'
      : isActive
      ? 'white'
      : 'var(--mantine-color-dark-1)',
    cursor: item.disabled ? 'not-allowed' : 'pointer',
    opacity: item.disabled ? 0.55 : 1,
    position: 'relative',
  }

  const inner = (
    <Box style={buttonStyle}>
      <Icon size={20} stroke={1.6} />
      {isMobile && (
        <Text size="sm" fw={isActive ? 600 : 400} c="inherit" style={{ lineHeight: 1 }}>
          {item.label}
        </Text>
      )}
      {isActive && !isMobile && (
        <Box
          pos="absolute"
          left={-8}
          top={8}
          bottom={8}
          w={3}
          style={{
            backgroundColor: 'var(--mantine-color-brand-5)',
            borderRadius: 2,
          }}
        />
      )}
      {isActive && isMobile && (
        <Box
          pos="absolute"
          left={0}
          top={4}
          bottom={4}
          w={3}
          style={{
            backgroundColor: 'var(--mantine-color-brand-5)',
            borderRadius: 2,
          }}
        />
      )}
    </Box>
  )

  if (item.disabled) {
    return (
      <Tooltip
        label={item.comingSoonNote ?? `${item.label} — coming soon`}
        position="right"
        offset={8}
        disabled={isMobile}
      >
        <UnstyledButton
          component="div"
          aria-disabled="true"
          aria-label={item.label}
          style={isMobile ? { width: '100%' } : undefined}
        >
          {inner}
        </UnstyledButton>
      </Tooltip>
    )
  }

  if (!item.to) return null

  return (
    <Tooltip label={item.label} position="right" offset={8} disabled={isMobile}>
      <UnstyledButton
        component={Link}
        to={item.to}
        onClick={onNavigate}
        aria-label={item.label}
        style={isMobile ? { width: '100%' } : undefined}
        styles={{
          root: {
            '&:hover > div': isActive
              ? undefined
              : {
                  backgroundColor: 'var(--mantine-color-dark-6)',
                  color: 'white',
                },
          },
        }}
      >
        {inner}
      </UnstyledButton>
    </Tooltip>
  )
}

function CreditsIcon({
  billingStatus,
  isMobile,
}: {
  billingStatus:
    | NonNullable<
        ReturnType<typeof useQuery<typeof api.billing.syncPlan.getBillingStatus>>
      >
    | null
  isMobile: boolean
}) {
  if (!billingStatus || !billingStatus.signedIn) return null

  const creditsUsed =
    typeof billingStatus.creditsUsed === 'number' ? billingStatus.creditsUsed : 0
  const creditsTotal =
    typeof billingStatus.creditsTotal === 'number' ? billingStatus.creditsTotal : 0
  const creditsLeft = creditsTotal > 0 ? Math.max(0, creditsTotal - creditsUsed) : 0
  const resetsOn =
    typeof billingStatus.resetsOn === 'number' ? billingStatus.resetsOn : null
  const daysLeft = resetsOn
    ? Math.max(0, Math.ceil((resetsOn - Date.now()) / (1000 * 60 * 60 * 24)))
    : null
  const planName = billingStatus.plan
    ? billingStatus.plan.charAt(0).toUpperCase() + billingStatus.plan.slice(1)
    : 'Free'

  return (
    <Tooltip
      position="right"
      offset={8}
      disabled={isMobile}
      label={
        <Stack gap={2}>
          <Text size="xs" fw={600}>
            {planName}
          </Text>
          <Text size="xs" c="dark.1">
            {creditsLeft}/{creditsTotal} credits left
          </Text>
          {daysLeft !== null && (
            <Text size="xs" c="dark.2">
              Resets in {daysLeft}d
            </Text>
          )}
        </Stack>
      }
    >
      <UnstyledButton
        component={Link}
        to="/account/billing"
        aria-label="Plan and credits"
        style={{
          width: isMobile ? '100%' : 40,
          height: 40,
          borderRadius: 10,
          display: 'flex',
          alignItems: isMobile ? 'flex-start' : 'center',
          justifyContent: isMobile ? 'flex-start' : 'center',
          gap: isMobile ? 10 : 0,
          paddingLeft: isMobile ? 8 : 0,
          color: 'var(--mantine-color-brand-5)',
          backgroundColor: 'rgba(84, 116, 180, 0.10)',
        }}
      >
        <IconBolt size={18} stroke={1.6} />
        {isMobile && (
          <Text size="sm" fw={400} c="inherit" style={{ lineHeight: 1 }}>
            {planName} · {creditsLeft} credits
          </Text>
        )}
      </UnstyledButton>
    </Tooltip>
  )
}
