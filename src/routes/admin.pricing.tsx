import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import {
  Anchor,
  Badge,
  Box,
  Container,
  Divider,
  Group,
  NumberFormatter,
  Paper,
  SimpleGrid,
  Slider,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { IconArrowLeft } from '@tabler/icons-react'

export const Route = createFileRoute('/admin/pricing')({
  component: AdminPricing,
})

type PlanConfig = {
  name: string
  credits: number
  price: number
}

type PlanDefaults = {
  lite: PlanConfig
  pro: PlanConfig
  max: PlanConfig
  cogsPerCredit: number
  premiumCreditCost: number
  bgRemovalCreditCost: number
  bgRemovalRawCost: number
  premiumRawCost: number
}

const DEFAULTS: PlanDefaults = {
  lite: { name: 'Lite', credits: 50, price: 29.99 },
  pro: { name: 'Pro', credits: 150, price: 49.99 },
  max: { name: 'Max', credits: 500, price: 129 },
  cogsPerCredit: 0.08, // nano-banana-2 standard
  premiumCreditCost: 3, // 3 credits per premium gen
  bgRemovalCreditCost: 1, // 1 credit per BG removal
  premiumRawCost: 0.22, // gpt-image-2 high 1024×1024
  bgRemovalRawCost: 0.018, // BRIA RMBG
}

const STORAGE_KEY = 'prodsnap.pricing-calculator.v1'

function loadStored(): PlanDefaults {
  if (typeof window === 'undefined') return DEFAULTS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<PlanDefaults>
    return { ...DEFAULTS, ...parsed }
  } catch {
    return DEFAULTS
  }
}

function AdminPricing() {
  const [state, setState] = useState<PlanDefaults>(DEFAULTS)

  // Hydrate from localStorage on mount (avoid SSR mismatch)
  useEffect(() => {
    setState(loadStored())
  }, [])

  // Persist on change
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // ignore quota
    }
  }, [state])

  const updatePlan = (key: 'lite' | 'pro' | 'max', patch: Partial<PlanConfig>) => {
    setState((s) => ({ ...s, [key]: { ...s[key], ...patch } }))
  }

  const computed = useMemo(() => {
    const calc = (p: PlanConfig) => {
      const perCredit = p.credits > 0 ? p.price / p.credits : 0
      const cogs = p.credits * state.cogsPerCredit
      const profit = p.price - cogs
      const margin = p.price > 0 ? (profit / p.price) * 100 : 0
      return { perCredit, cogs, profit, margin }
    }
    return {
      lite: calc(state.lite),
      pro: calc(state.pro),
      max: calc(state.max),
    }
  }, [state])

  const litePerCredit = computed.lite.perCredit

  return (
    <Container size="xl" py={48}>
      <Anchor
        component={Link}
        to="/admin"
        size="sm"
        c="dark.2"
        mb="md"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        <IconArrowLeft size={14} /> Back to admin
      </Anchor>

      <Paper
        radius="lg"
        p="xl"
        mb={32}
        style={{
          background:
            'linear-gradient(135deg, rgba(16, 24, 40, 0.12) 0%, rgba(16, 24, 40, 0.04) 100%)',
          border: '1px solid var(--mantine-color-dark-5)',
        }}
      >
        <Title order={1} fz={32} fw={600} c="dark.0">
          Pricing Calculator
        </Title>
        <Text size="md" c="dark.2" mt={6}>
          Drag the sliders to model plan pricing. Credits and price persist across reloads.
        </Text>
      </Paper>

      {/* Shared inputs */}
      <Paper
        radius="lg"
        p="lg"
        mb="lg"
        withBorder
        style={{
          backgroundColor: 'var(--mantine-color-dark-7)',
          borderColor: 'var(--mantine-color-dark-5)',
        }}
      >
        <Stack gap="md">
          <Group justify="space-between" align="baseline">
            <Text fw={600} c="dark.0">
              Cost to us per credit (COGS)
            </Text>
            <Text fw={700} c="brand.4" fz="lg">
              <NumberFormatter
                value={state.cogsPerCredit}
                prefix="$"
                decimalScale={3}
                fixedDecimalScale
              />
            </Text>
          </Group>
          <Slider
            value={state.cogsPerCredit}
            min={0.01}
            max={0.4}
            step={0.005}
            color="brand"
            onChange={(v) => setState((s) => ({ ...s, cogsPerCredit: v }))}
            marks={[
              { value: 0.018, label: 'BRIA' },
              { value: 0.061, label: 'gpt-img medium' },
              { value: 0.08, label: 'nano-banana' },
              { value: 0.22, label: 'gpt-img high' },
            ]}
            styles={{
              markLabel: { fontSize: 10, color: 'var(--mantine-color-dark-2)' },
            }}
          />
          <Text size="xs" c="dimmed">
            Default $0.08 = nano-banana-2 standard. Drag left to model "we switched to a cheaper model" scenarios.
          </Text>
        </Stack>
      </Paper>

      {/* Three plan cards */}
      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
        <PlanCard
          accent="dark.2"
          plan={state.lite}
          metrics={computed.lite}
          litePerCredit={litePerCredit}
          isAnchor
          onCreditsChange={(v) => updatePlan('lite', { credits: v })}
          onPriceChange={(v) => updatePlan('lite', { price: v })}
        />
        <PlanCard
          accent="brand.5"
          plan={state.pro}
          metrics={computed.pro}
          litePerCredit={litePerCredit}
          badge="Most Popular"
          onCreditsChange={(v) => updatePlan('pro', { credits: v })}
          onPriceChange={(v) => updatePlan('pro', { price: v })}
        />
        <PlanCard
          accent="grape.5"
          plan={state.max}
          metrics={computed.max}
          litePerCredit={litePerCredit}
          onCreditsChange={(v) => updatePlan('max', { credits: v })}
          onPriceChange={(v) => updatePlan('max', { price: v })}
        />
      </SimpleGrid>

      {/* Comparison table */}
      <Paper
        radius="lg"
        p="lg"
        mt="lg"
        withBorder
        style={{
          backgroundColor: 'var(--mantine-color-dark-7)',
          borderColor: 'var(--mantine-color-dark-5)',
        }}
      >
        <Title order={3} fz={18} fw={600} c="dark.0" mb="md">
          Side-by-side
        </Title>
        <Table
          striped
          withRowBorders={false}
          styles={{
            th: { color: 'var(--mantine-color-dark-1)', fontWeight: 600 },
            td: { color: 'var(--mantine-color-gray-2)' },
          }}
        >
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Tier</Table.Th>
              <Table.Th ta="right">Credits</Table.Th>
              <Table.Th ta="right">Price</Table.Th>
              <Table.Th ta="right">$/credit</Table.Th>
              <Table.Th ta="right">Discount vs Lite</Table.Th>
              <Table.Th ta="right">COGS</Table.Th>
              <Table.Th ta="right">Profit/user</Table.Th>
              <Table.Th ta="right">Margin</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(['lite', 'pro', 'max'] as const).map((key) => {
              const p = state[key]
              const m = computed[key]
              const discount =
                litePerCredit > 0 && key !== 'lite'
                  ? ((litePerCredit - m.perCredit) / litePerCredit) * 100
                  : 0
              return (
                <Table.Tr key={key}>
                  <Table.Td fw={600} c="dark.0">
                    {p.name}
                  </Table.Td>
                  <Table.Td ta="right">{p.credits}</Table.Td>
                  <Table.Td ta="right">
                    <NumberFormatter value={p.price} prefix="$" decimalScale={2} fixedDecimalScale thousandSeparator />
                  </Table.Td>
                  <Table.Td ta="right">
                    <NumberFormatter value={m.perCredit} prefix="$" decimalScale={3} fixedDecimalScale />
                  </Table.Td>
                  <Table.Td ta="right" c={discount > 0 ? 'teal.4' : 'dimmed'}>
                    {key === 'lite' ? '—' : `${discount.toFixed(1)}%`}
                  </Table.Td>
                  <Table.Td ta="right">
                    <NumberFormatter value={m.cogs} prefix="$" decimalScale={2} fixedDecimalScale />
                  </Table.Td>
                  <Table.Td ta="right" fw={600} c="dark.0">
                    <NumberFormatter value={m.profit} prefix="$" decimalScale={2} fixedDecimalScale />
                  </Table.Td>
                  <Table.Td ta="right" c={m.margin >= 70 ? 'teal.4' : m.margin >= 50 ? 'yellow.4' : 'red.4'}>
                    {m.margin.toFixed(1)}%
                  </Table.Td>
                </Table.Tr>
              )
            })}
          </Table.Tbody>
        </Table>
      </Paper>

      {/* Per-action retail (derived) */}
      <Paper
        radius="lg"
        p="lg"
        mt="lg"
        withBorder
        style={{
          backgroundColor: 'var(--mantine-color-dark-7)',
          borderColor: 'var(--mantine-color-dark-5)',
        }}
      >
        <Title order={3} fz={18} fw={600} c="dark.0" mb="md">
          What each action costs the user (at Lite's $/credit anchor)
        </Title>
        <Text size="xs" c="dimmed" mb="md">
          Premium gen = 3 credits each. BG removal = 1 credit each.
        </Text>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <ActionRetail
            label="Standard image (nano-banana-2)"
            credits={1}
            litePerCredit={litePerCredit}
            cost={state.cogsPerCredit}
          />
          <ActionRetail
            label="Premium image (gpt-image-2 high)"
            credits={state.premiumCreditCost}
            litePerCredit={litePerCredit}
            cost={state.premiumRawCost}
          />
          <ActionRetail
            label="Background removal (BRIA)"
            credits={state.bgRemovalCreditCost}
            litePerCredit={litePerCredit}
            cost={state.bgRemovalRawCost}
          />
        </SimpleGrid>
      </Paper>

      {/* Scenario: 1000 users */}
      <Paper
        radius="lg"
        p="lg"
        mt="lg"
        mb={48}
        withBorder
        style={{
          backgroundColor: 'var(--mantine-color-dark-7)',
          borderColor: 'var(--mantine-color-dark-5)',
        }}
      >
        <Title order={3} fz={18} fw={600} c="dark.0" mb="md">
          At 1000 customers (50% Lite · 35% Pro · 15% Max)
        </Title>
        <ScenarioSummary
          counts={{ lite: 500, pro: 350, max: 150 }}
          state={state}
          computed={computed}
        />
      </Paper>

      <Group justify="space-between" mb={64}>
        <Text size="xs" c="dimmed">
          State is stored in localStorage. Refresh keeps your numbers.
        </Text>
        <Anchor
          component="button"
          type="button"
          size="xs"
          c="dark.2"
          onClick={() => {
            window.localStorage.removeItem(STORAGE_KEY)
            setState(DEFAULTS)
          }}
        >
          Reset to defaults
        </Anchor>
      </Group>
    </Container>
  )
}

function PlanCard({
  plan,
  metrics,
  litePerCredit,
  accent,
  badge,
  isAnchor,
  onCreditsChange,
  onPriceChange,
}: {
  plan: PlanConfig
  metrics: { perCredit: number; cogs: number; profit: number; margin: number }
  litePerCredit: number
  accent: string
  badge?: string
  isAnchor?: boolean
  onCreditsChange: (v: number) => void
  onPriceChange: (v: number) => void
}) {
  const discount = !isAnchor && litePerCredit > 0
    ? ((litePerCredit - metrics.perCredit) / litePerCredit) * 100
    : 0
  const marginColor = metrics.margin >= 70 ? 'teal.4' : metrics.margin >= 50 ? 'yellow.4' : 'red.4'

  return (
    <Paper
      radius="lg"
      p="lg"
      withBorder
      style={{
        backgroundColor: 'var(--mantine-color-dark-7)',
        borderColor: `var(--mantine-color-${accent.replace('.', '-')})`,
        borderWidth: badge ? 2 : 1,
      }}
    >
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Title order={2} fz={22} fw={600} c="dark.0">
            {plan.name}
          </Title>
          {badge && (
            <Badge color="brand" size="sm" variant="filled">
              {badge}
            </Badge>
          )}
        </Group>

        <Box>
          <Group justify="space-between" align="baseline" mb={6}>
            <Text size="sm" c="dark.2">
              Credits / month
            </Text>
            <Text fw={700} c="dark.0">
              {plan.credits}
            </Text>
          </Group>
          <Slider
            value={plan.credits}
            min={10}
            max={2000}
            step={10}
            color={accent.split('.')[0]}
            onChange={onCreditsChange}
          />
        </Box>

        <Box>
          <Group justify="space-between" align="baseline" mb={6}>
            <Text size="sm" c="dark.2">
              Monthly price
            </Text>
            <Text fw={700} c="dark.0">
              <NumberFormatter value={plan.price} prefix="$" decimalScale={2} fixedDecimalScale />
            </Text>
          </Group>
          <Slider
            value={plan.price}
            min={0}
            max={999}
            step={1}
            color={accent.split('.')[0]}
            onChange={onPriceChange}
          />
        </Box>

        <Divider color="dark.5" />

        <Stack gap={6}>
          <Metric label="$ per credit" value={metrics.perCredit} prefix="$" decimals={3} accent="dark.0" />
          {!isAnchor && (
            <Metric
              label="Discount vs Lite"
              value={discount}
              suffix="%"
              decimals={1}
              accent={discount > 0 ? 'teal.4' : 'dimmed'}
            />
          )}
          <Metric label="COGS / user" value={metrics.cogs} prefix="$" decimals={2} accent="dimmed" />
          <Metric label="Profit / user" value={metrics.profit} prefix="$" decimals={2} accent="dark.0" emphasized />
          <Metric label="Margin" value={metrics.margin} suffix="%" decimals={1} accent={marginColor} emphasized />
        </Stack>
      </Stack>
    </Paper>
  )
}

function Metric({
  label,
  value,
  prefix,
  suffix,
  decimals,
  accent,
  emphasized,
}: {
  label: string
  value: number
  prefix?: string
  suffix?: string
  decimals: number
  accent: string
  emphasized?: boolean
}) {
  return (
    <Group justify="space-between" align="baseline">
      <Text size="sm" c="dark.2">
        {label}
      </Text>
      <Text fw={emphasized ? 700 : 500} fz={emphasized ? 'md' : 'sm'} c={accent}>
        <NumberFormatter
          value={value}
          prefix={prefix}
          suffix={suffix}
          decimalScale={decimals}
          fixedDecimalScale
          thousandSeparator
        />
      </Text>
    </Group>
  )
}

function ActionRetail({
  label,
  credits,
  litePerCredit,
  cost,
}: {
  label: string
  credits: number
  litePerCredit: number
  cost: number
}) {
  const retail = credits * litePerCredit
  const profit = retail - cost
  const margin = retail > 0 ? (profit / retail) * 100 : 0
  return (
    <Paper
      radius="md"
      p="md"
      withBorder
      style={{
        backgroundColor: 'var(--mantine-color-dark-8)',
        borderColor: 'var(--mantine-color-dark-5)',
      }}
    >
      <Text size="sm" c="dark.2" mb="xs">
        {label}
      </Text>
      <Group gap="xs" align="baseline">
        <Text fw={700} fz="xl" c="dark.0">
          {credits}
        </Text>
        <Text size="xs" c="dimmed">
          credit{credits === 1 ? '' : 's'}
        </Text>
      </Group>
      <Text size="xs" c="dimmed" mt="xs">
        Retail{' '}
        <NumberFormatter value={retail} prefix="$" decimalScale={2} fixedDecimalScale /> · Cost{' '}
        <NumberFormatter value={cost} prefix="$" decimalScale={3} fixedDecimalScale /> · Margin{' '}
        <Text span c={margin >= 70 ? 'teal.4' : margin >= 50 ? 'yellow.4' : 'red.4'} fw={600}>
          {margin.toFixed(1)}%
        </Text>
      </Text>
    </Paper>
  )
}

function ScenarioSummary({
  counts,
  state,
  computed,
}: {
  counts: { lite: number; pro: number; max: number }
  state: PlanDefaults
  computed: Record<'lite' | 'pro' | 'max', { perCredit: number; cogs: number; profit: number; margin: number }>
}) {
  const total =
    counts.lite * computed.lite.profit +
    counts.pro * computed.pro.profit +
    counts.max * computed.max.profit
  const revenue =
    counts.lite * state.lite.price +
    counts.pro * state.pro.price +
    counts.max * state.max.price
  const cogsTotal =
    counts.lite * computed.lite.cogs +
    counts.pro * computed.pro.cogs +
    counts.max * computed.max.cogs

  return (
    <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
      <StatBlock label="Total revenue" value={revenue} accent="dark.0" />
      <StatBlock label="Total COGS" value={cogsTotal} accent="dimmed" />
      <StatBlock label="Total profit" value={total} accent="teal.4" emphasized />
    </SimpleGrid>
  )
}

function StatBlock({
  label,
  value,
  accent,
  emphasized,
}: {
  label: string
  value: number
  accent: string
  emphasized?: boolean
}) {
  return (
    <Paper
      radius="md"
      p="md"
      withBorder
      style={{
        backgroundColor: 'var(--mantine-color-dark-8)',
        borderColor: 'var(--mantine-color-dark-5)',
      }}
    >
      <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={6}>
        {label}
      </Text>
      <Text fw={700} fz={emphasized ? 28 : 22} c={accent}>
        <NumberFormatter
          value={value}
          prefix="$"
          decimalScale={0}
          fixedDecimalScale
          thousandSeparator
        />
      </Text>
    </Paper>
  )
}
