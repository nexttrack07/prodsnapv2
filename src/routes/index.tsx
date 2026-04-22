import { Link, createFileRoute } from '@tanstack/react-router'
import {
  Container,
  Title,
  Text,
  Button,
  Group,
  Box,
  SimpleGrid,
  Paper,
  Badge,
  Indicator,
} from '@mantine/core'
import { IconArrowRight } from '@tabler/icons-react'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <Box
      component="section"
      pos="relative"
      style={{ overflow: 'hidden' }}
      className="bg-radial-fade"
    >
      <Box
        pos="absolute"
        top={0}
        left={0}
        right={0}
        bottom={0}
        className="bg-grid-soft"
        style={{ opacity: 0.5, pointerEvents: 'none' }}
      />
      <Container size="lg" pos="relative" pt={96} pb={128} ta="center">
        <Indicator
          inline
          processing
          color="teal"
          size={8}
          offset={4}
          position="middle-start"
        >
          <Badge
            variant="outline"
            color="gray"
            radius="lg"
            px="md"
            py={4}
            pl="lg"
            styles={{
              root: {
                backgroundColor: 'var(--mantine-color-dark-7)',
                borderColor: 'var(--mantine-color-dark-5)',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.3)',
              },
            }}
          >
            <Text size="xs" fw={500} c="dark.1">
              Turn products into bestsellers — visually
            </Text>
          </Badge>
        </Indicator>

        <Title
          order={1}
          mt="lg"
          fz={{ base: 40, md: 56 }}
          fw={600}
          lh={1.05}
          c="white"
        >
          Pro-quality product photos{' '}
          <Text
            component="span"
            inherit
            c="brand.4"
          >
            in a snap
          </Text>
        </Title>

        <Text size="lg" c="dark.2" maw={640} mx="auto" mt="lg">
          Upload your product, pick an ad template, and watch AI compose lifestyle shots that
          actually look like your brand shot them.
        </Text>

        <Group justify="center" mt="xl">
          <Button
            component={Link}
            to="/studio"
            size="xl"
            fz="md"
            color="brand"
            rightSection={<IconArrowRight size={18} />}
            style={{
              boxShadow: '0 8px 32px rgba(84, 116, 180, 0.4)',
              transition: 'transform 200ms ease, box-shadow 200ms ease',
            }}
            styles={{
              root: {
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: '0 12px 40px rgba(84, 116, 180, 0.5)',
                },
              },
            }}
          >
            Open the Studio
          </Button>
        </Group>

        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="lg" mt={80}>
          {[
            { n: '1', t: 'Upload', d: 'Drop a product photo. Any background.' },
            { n: '2', t: 'Match', d: 'AI finds ad templates that fit your product.' },
            { n: '3', t: 'Generate', d: 'One click, multiple on-brand variations.' },
          ].map((s) => (
            <Paper
              key={s.n}
              radius="lg"
              p="xl"
              withBorder
              style={{
                backgroundColor: 'rgba(13, 13, 13, 0.8)',
                backdropFilter: 'blur(12px)',
                textAlign: 'left',
                borderColor: 'var(--mantine-color-dark-5)',
                transition: 'transform 200ms ease, border-color 200ms ease, box-shadow 200ms ease',
              }}
              styles={{
                root: {
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    borderColor: 'var(--mantine-color-brand-6)',
                    boxShadow: '0 12px 40px rgba(84, 116, 180, 0.15)',
                  },
                },
              }}
            >
              <Badge
                size="sm"
                variant="light"
                color="brand"
                radius="sm"
                mb="sm"
              >
                STEP {s.n}
              </Badge>
              <Text fw={600} size="lg" c="white" mt={8}>
                {s.t}
              </Text>
              <Text size="sm" c="dark.2" mt={6}>
                {s.d}
              </Text>
            </Paper>
          ))}
        </SimpleGrid>
      </Container>
    </Box>
  )
}
