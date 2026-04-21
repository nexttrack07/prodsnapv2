import { Anchor, Stack, Text, Image } from '@mantine/core'

export function IconLink({
  icon,
  href,
  label,
}: {
  icon: string
  href: string
  label: string
}) {
  return (
    <Anchor href={href} underline="never">
      <Stack align="center" gap={8}>
        <Image src={icon} h={32} w={32} radius="lg" />
        <Text size="xs" tt="uppercase" fw={700} c="gray.6" ta="center">
          {label}
        </Text>
      </Stack>
    </Anchor>
  )
}
