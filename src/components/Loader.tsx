import { Center, Loader as MantineLoader } from '@mantine/core'

export function Loader() {
  return (
    <Center h="100%">
      <MantineLoader size="xl" color="dark.9" />
    </Center>
  )
}
