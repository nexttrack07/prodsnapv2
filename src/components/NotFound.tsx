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
              variant="light"
              color="brand"
              fw={600}
              size="md"
            >
              Go back
            </Button>
            <Button
              component={Link}
              to="/"
              variant="filled"
              color="brand"
              fw={600}
              size="md"
            >
              Start Over
            </Button>
          </Group>
        </Stack>
      </Container>
    </Center>
  )
}
