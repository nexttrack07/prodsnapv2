import {
  Link,
  rootRouteId,
  useMatch,
  useRouter,
} from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { Anchor, Button, Center, Code, Group, Stack, Text, Title } from '@mantine/core'

export function DefaultCatchBoundary({ error }: ErrorComponentProps) {
  const router = useRouter()
  const isRoot = useMatch({
    strict: false,
    select: (state) => state.id === rootRouteId,
  })

  console.error(error)

  return (
    <Center mih={400} p="md">
      <Stack align="center" gap="md" maw={480}>
        <Title order={2} ta="center">
          Something went wrong on our end.
        </Title>
        <Text c="dark.2" ta="center">
          We've been notified. Try again in a moment, or email{' '}
          <Anchor href="mailto:support@prodsnap.io">support@prodsnap.io</Anchor>{' '}
          if it keeps happening.
        </Text>
        {import.meta.env.DEV && error?.message && (
          <Code block style={{ maxWidth: '100%', overflow: 'auto' }}>
            {error.message}
          </Code>
        )}
        <Group>
          <Button
            onClick={() => router.invalidate()}
            variant="filled"
            color="gray"
            tt="uppercase"
            fw={800}
            size="sm"
            fz="xs"
          >
            Try Again
          </Button>
          {isRoot ? (
            <Button
              component={Link}
              to="/"
              variant="filled"
              color="gray"
              tt="uppercase"
              fw={800}
              size="sm"
              fz="xs"
            >
              Home
            </Button>
          ) : (
            <Button
              component={Link}
              to="/"
              onClick={(e) => {
                e.preventDefault()
                window.history.back()
              }}
              variant="filled"
              color="gray"
              tt="uppercase"
              fw={800}
              size="sm"
              fz="xs"
            >
              Go Back
            </Button>
          )}
        </Group>
      </Stack>
    </Center>
  )
}
