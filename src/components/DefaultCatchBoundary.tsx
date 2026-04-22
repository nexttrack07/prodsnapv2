import {
  ErrorComponent,
  Link,
  rootRouteId,
  useMatch,
  useRouter,
} from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'
import { Center, Stack, Button, Group } from '@mantine/core'

export function DefaultCatchBoundary({ error }: ErrorComponentProps) {
  const router = useRouter()
  const isRoot = useMatch({
    strict: false,
    select: (state) => state.id === rootRouteId,
  })

  console.error(error)

  return (
    <Center mih={400} p="md">
      <Stack align="center" gap="lg">
        <ErrorComponent error={error} />
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
