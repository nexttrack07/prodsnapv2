/**
 * Icon-only app-shell sidebar. Narrow strip of nav icons with tooltips on
 * hover. Used inside <AppShellLayout/>. Marketing pages and wizard pages
 * don't render this.
 */
import { Link, useRouterState } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { UserButton } from '@clerk/react'
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
  {
    icon: IconLayoutGrid,
    label: 'Products',
    disabled: true,
    comingSoonNote: 'Products — coming soon',
  },
  { to: '/templates', icon: IconSparkles, label: 'Templates' },
  { to: '/library', icon: IconLibrary, label: 'Library' },
  { to: '/account/brand', icon: IconBrush, label: 'Brand kit' },
]

const SECONDARY_NAV: ReadonlyArray<NavItem> = [
  { to: '/account/billing', icon: IconReceipt, label: 'Billing' },
]

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const billingStatus = useQuery(api.billing.syncPlan.getBillingStatus, {})

  return (
    <Stack h="100%" gap={0} justify="space-between" py="md" align="center">
      <Stack gap="xs" align="center" w="100%">
        <Center pb="sm">
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

        <Stack gap={6} align="center" w="100%" px={8}>
          {PRIMARY_NAV.map((item) => (
            <NavIcon key={item.label} item={item} onNavigate={onNavigate} />
          ))}
        </Stack>
      </Stack>

      <Stack gap={6} align="center" w="100%" px={8}>
        {SECONDARY_NAV.map((item) => (
          <NavIcon key={item.label} item={item} onNavigate={onNavigate} />
        ))}

        <CreditsIcon billingStatus={billingStatus ?? null} />

        <Box pt={6}>
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
}: {
  item: NavItem
  onNavigate?: () => void
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const Icon = item.icon
  const isActive =
    !item.disabled &&
    item.to !== undefined &&
    (item.to === '/home' ? pathname === '/home' : pathname.startsWith(item.to))

  const buttonStyle: React.CSSProperties = {
    width: 40,
    height: 40,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
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
      {isActive && (
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
    </Box>
  )

  if (item.disabled) {
    return (
      <Tooltip
        label={item.comingSoonNote ?? `${item.label} — coming soon`}
        position="right"
        offset={8}
      >
        <UnstyledButton component="div" aria-disabled="true" aria-label={item.label}>
          {inner}
        </UnstyledButton>
      </Tooltip>
    )
  }

  if (!item.to) return null

  return (
    <Tooltip label={item.label} position="right" offset={8}>
      <UnstyledButton
        component={Link}
        to={item.to}
        onClick={onNavigate}
        aria-label={item.label}
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
}: {
  billingStatus:
    | NonNullable<
        ReturnType<typeof useQuery<typeof api.billing.syncPlan.getBillingStatus>>
      >
    | null
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
          width: 40,
          height: 40,
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--mantine-color-brand-5)',
          backgroundColor: 'rgba(84, 116, 180, 0.10)',
        }}
      >
        <IconBolt size={18} stroke={1.6} />
      </UnstyledButton>
    </Tooltip>
  )
}
