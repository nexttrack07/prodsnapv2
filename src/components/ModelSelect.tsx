import { Avatar, Box, Group, Select, Text } from '@mantine/core'
import { IconBrandGoogleFilled, IconBrandOpenai } from '@tabler/icons-react'
import type { ComponentType } from 'react'

export type ImageEditModel = 'nano-banana-2' | 'gpt-image-2'

type ModelMeta = {
  value: ImageEditModel
  provider: string
  name: string
  color: string
  Icon: ComponentType<{ size?: number }>
}

const MODELS: ModelMeta[] = [
  {
    value: 'nano-banana-2',
    provider: 'Google',
    name: 'Nano Banana 2',
    color: 'blue',
    Icon: IconBrandGoogleFilled,
  },
  {
    value: 'gpt-image-2',
    provider: 'OpenAI',
    name: 'GPT Image 2',
    color: 'teal',
    Icon: IconBrandOpenai,
  },
]

const META_BY_VALUE = Object.fromEntries(MODELS.map((m) => [m.value, m])) as Record<
  ImageEditModel,
  ModelMeta
>

export function ModelSelect({
  value,
  onChange,
  size = 'sm',
}: {
  value: ImageEditModel
  onChange: (value: ImageEditModel) => void
  size?: 'xs' | 'sm' | 'md'
}) {
  const current = META_BY_VALUE[value]

  return (
    <Select
      value={value}
      onChange={(v) => {
        if (v === 'nano-banana-2' || v === 'gpt-image-2') onChange(v)
      }}
      data={MODELS.map((m) => ({ value: m.value, label: m.name }))}
      allowDeselect={false}
      size={size}
      comboboxProps={{ withinPortal: true, shadow: 'md' }}
      leftSection={
        <Avatar color={current.color} radius="xl" size="sm">
          <current.Icon size={14} />
        </Avatar>
      }
      leftSectionWidth={40}
      renderOption={({ option }) => {
        const meta = META_BY_VALUE[option.value as ImageEditModel]
        return (
          <Group gap="sm" wrap="nowrap" style={{ width: '100%' }}>
            <Avatar color={meta.color} radius="xl" size="md">
              <meta.Icon size={18} />
            </Avatar>
            <Box style={{ flex: 1 }}>
              <Text size="xs" c="dimmed" lh={1.2}>
                {meta.provider}
              </Text>
              <Text size="sm" fw={500} c="white" lh={1.3}>
                {meta.name}
              </Text>
            </Box>
          </Group>
        )
      }}
    />
  )
}
