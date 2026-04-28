import { useState } from 'react'
import { useMutation } from 'convex/react'
import {
  Box,
  Button,
  Group,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core'
import {
  IconShoppingBag,
  IconBrandReact,
  IconBuildingSkyscraper,
  IconPalette,
  IconBuildingStore,
  IconHeart,
  IconQuestionMark,
} from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { api } from '../../../convex/_generated/api'

type Role =
  | 'ecom-store-owner'
  | 'saas-founder'
  | 'agency-freelancer'
  | 'content-creator'
  | 'local-service'
  | 'nonprofit'
  | 'something-else'

const ROLES: ReadonlyArray<{
  id: Role
  title: string
  description: string
  Icon: typeof IconShoppingBag
}> = [
  {
    id: 'ecom-store-owner',
    title: 'Ecommerce store owner',
    description: 'I run my own store and make my own ads',
    Icon: IconShoppingBag,
  },
  {
    id: 'saas-founder',
    title: 'SaaS / app founder',
    description: 'I sell software or services online',
    Icon: IconBrandReact,
  },
  {
    id: 'agency-freelancer',
    title: 'Ad agency or freelancer',
    description: 'I run ads for multiple clients',
    Icon: IconBuildingSkyscraper,
  },
  {
    id: 'content-creator',
    title: 'Content creator',
    description: 'I sell merch, courses, or sponsorships',
    Icon: IconPalette,
  },
  {
    id: 'local-service',
    title: 'Local or service business',
    description: 'Restaurant, gym, contractor, etc.',
    Icon: IconBuildingStore,
  },
  {
    id: 'nonprofit',
    title: 'Nonprofit or organization',
    description: 'Fundraising, awareness, advocacy',
    Icon: IconHeart,
  },
  {
    id: 'something-else',
    title: 'Something else',
    description: "We'll figure it out together",
    Icon: IconQuestionMark,
  },
]

export function StepRole({ onNext }: { onNext: () => void }) {
  const [selected, setSelected] = useState<Role | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const setRole = useMutation(api.onboardingProfiles.setRole)

  const handleContinue = async () => {
    if (!selected || submitting) return
    setSubmitting(true)
    try {
      await setRole({ role: selected })
      onNext()
    } catch (err) {
      notifications.show({
        title: "Couldn't save",
        message: err instanceof Error ? err.message : 'Try again',
        color: 'red',
      })
      setSubmitting(false)
    }
  }

  return (
    <Stack gap="lg">
      <Stack gap="xs" align="center">
        <Title order={1} fz={28} fw={600} ta="center">
          Welcome — quick intro
        </Title>
        <Text c="dark.2" ta="center" maw={420}>
          What best describes you? We'll tailor the experience.
        </Text>
      </Stack>

      <Stack gap="sm">
        {ROLES.map((r) => (
          <RoleCard
            key={r.id}
            role={r}
            selected={selected === r.id}
            onSelect={() => setSelected(r.id)}
          />
        ))}
      </Stack>

      <Group justify="flex-end">
        <Button
          color="brand"
          size="md"
          disabled={!selected}
          loading={submitting}
          onClick={handleContinue}
          rightSection="→"
        >
          Continue
        </Button>
      </Group>
    </Stack>
  )
}

function RoleCard({
  role,
  selected,
  onSelect,
}: {
  role: (typeof ROLES)[number]
  selected: boolean
  onSelect: () => void
}) {
  const { Icon } = role
  return (
    <Paper
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      p="md"
      radius="lg"
      withBorder
      style={{
        cursor: 'pointer',
        borderColor: selected
          ? 'var(--mantine-color-brand-5)'
          : 'var(--mantine-color-dark-5)',
        borderWidth: selected ? 2 : 1,
        backgroundColor: selected
          ? 'rgba(84, 116, 180, 0.12)'
          : 'var(--mantine-color-dark-7)',
        transition: 'all 150ms ease',
      }}
    >
      <Group gap="md" wrap="nowrap">
        <ThemeIcon
          size={44}
          radius="md"
          variant={selected ? 'filled' : 'light'}
          color={selected ? 'brand' : 'gray'}
        >
          <Icon size={22} />
        </ThemeIcon>
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Text fw={600} c="white">
            {role.title}
          </Text>
          <Text size="sm" c="dark.2">
            {role.description}
          </Text>
        </Box>
      </Group>
    </Paper>
  )
}
