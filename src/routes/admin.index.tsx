import { Link, createFileRoute } from '@tanstack/react-router'
import { Container, Title, Text, SimpleGrid, Paper, Box, ThemeIcon, Group } from '@mantine/core'
import { IconLayoutGrid, IconTextCaption, IconArrowRight, IconFlask2 } from '@tabler/icons-react'

export const Route = createFileRoute('/admin/')({
  component: AdminIndex,
})

function AdminIndex() {
  return (
    <Container size="lg" py={48}>
      <Paper
        radius="lg"
        p="xl"
        mb={40}
        style={{
          background: 'linear-gradient(135deg, rgba(84, 116, 180, 0.12) 0%, rgba(84, 116, 180, 0.04) 100%)',
          border: '1px solid var(--mantine-color-dark-5)',
        }}
      >
        <Title order={1} fz={36} fw={600} c="white">
          Admin
        </Title>
        <Text size="lg" c="dark.2" mt={8}>
          Manage the template library and the generation prompt config.
        </Text>
      </Paper>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
        <AdminCard
          to="/admin/templates"
          title="Templates"
          description="Upload new ad templates, review ingestion status, retry or delete."
          icon={<IconLayoutGrid size={24} />}
        />
        <AdminCard
          to="/admin/prompts"
          title="Generation prompts"
          description="Tweak the prompt that the image model sees for exact / remix / color-adapt."
          icon={<IconTextCaption size={24} />}
        />
        <AdminCard
          to="/admin/playground"
          title="Variation Playground"
          description="Re-run any user's variation flow with full visibility into prompts and inputs."
          icon={<IconFlask2 size={24} />}
        />
      </SimpleGrid>
    </Container>
  )
}

function AdminCard({
  to,
  title,
  description,
  icon,
}: {
  to: string
  title: string
  description: string
  icon: React.ReactNode
}) {
  return (
    <Paper
      component={Link}
      to={to}
      radius="lg"
      p="xl"
      withBorder
      style={{
        textDecoration: 'none',
        borderColor: 'var(--mantine-color-dark-5)',
        backgroundColor: 'var(--mantine-color-dark-7)',
        transition: 'transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease',
      }}
      styles={{
        root: {
          '&:hover': {
            transform: 'translateY(-4px)',
            boxShadow: '0 12px 40px rgba(84, 116, 180, 0.2)',
            borderColor: 'var(--mantine-color-brand-6)',
          },
          '&:hover .admin-card-arrow': {
            transform: 'translateX(4px)',
          },
        },
      }}
    >
      <ThemeIcon
        size={52}
        radius="lg"
        variant="gradient"
        gradient={{ from: 'brand.7', to: 'brand.5', deg: 135 }}
        mb="lg"
        style={{ boxShadow: '0 4px 16px rgba(84, 116, 180, 0.25)' }}
      >
        {icon}
      </ThemeIcon>
      <Text fw={600} size="xl" c="white">
        {title}
      </Text>
      <Text size="sm" c="dark.2" mt={6} mb="lg">
        {description}
      </Text>
      <Group gap={6}>
        <Text size="sm" fw={600} c="brand.5">
          Open
        </Text>
        <IconArrowRight
          size={16}
          className="admin-card-arrow"
          style={{
            transition: 'transform 200ms ease',
            color: 'var(--mantine-color-brand-5)',
          }}
        />
      </Group>
    </Paper>
  )
}
