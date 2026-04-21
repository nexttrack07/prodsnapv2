import { Link } from '@tanstack/react-router'
import { Container, Title, Text, Button, Stack, Center, Group } from '@mantine/core'

export function NotFound({ children }: { children?: React.ReactNode }) {
  return (
    <Center py="xl" mih={400}>
      <Container size="sm">
        <Stack align="center" gap="md">
          <Title order={1}>Page not found</Title>
          <Text c="dimmed" ta="center">
            {children || 'The page you are looking for does not exist.'}
          </Text>
          <Group>
            <Button
              onClick={() => window.history.back()}
              variant="filled"
              color="teal"
              tt="uppercase"
              fw={800}
              size="sm"
            >
              Go back
            </Button>
            <Button
              component={Link}
              to="/"
              variant="filled"
              color="cyan"
              tt="uppercase"
              fw={800}
              size="sm"
            >
              Start Over
            </Button>
          </Group>
        </Stack>
      </Container>
    </Center>
  )
}
