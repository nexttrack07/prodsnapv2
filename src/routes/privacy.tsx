import { Link, createFileRoute } from '@tanstack/react-router'
import { Container, Title, Text, List, Anchor, Stack, Divider } from '@mantine/core'
import { seo } from '~/utils/seo'

export const Route = createFileRoute('/privacy')({
  head: () => ({
    meta: [
      ...seo({
        title: 'Privacy Policy · ProdSnap',
        description: 'How ProdSnap collects, uses, and protects your data.',
      }),
    ],
  }),
  component: PrivacyPolicy,
})

function PrivacyPolicy() {
  return (
    <Container size="md" py={64}>
      <Stack gap="xl">
        <div>
          <Title order={1} c="white" mb="xs">
            Privacy Policy
          </Title>
          <Text size="sm" c="dark.2">
            Last updated: April 23, 2026
          </Text>
        </div>

        <Divider color="dark.5" />

        <div>
          <Title order={2} c="white" mb="sm" fz="lg">
            What we collect
          </Title>
          <List spacing="xs" c="dark.1">
            <List.Item>Email address and identity data via Clerk authentication</List.Item>
            <List.Item>Product images you upload to the studio</List.Item>
            <List.Item>AI-generated photo variations produced from your uploads</List.Item>
            <List.Item>Billing events and credit usage associated with your account</List.Item>
          </List>
        </div>

        <div>
          <Title order={2} c="white" mb="sm" fz="lg">
            How we use it
          </Title>
          <List spacing="xs" c="dark.1">
            <List.Item>To operate the ProdSnap service and deliver generated images to you</List.Item>
            <List.Item>To improve the quality and relevance of AI prompt templates</List.Item>
            <List.Item>To accurately count and bill credit usage on your account</List.Item>
          </List>
        </div>

        <div>
          <Title order={2} c="white" mb="sm" fz="lg">
            Who we share it with
          </Title>
          <Text c="dark.1" mb="sm">
            We use the following sub-processors to deliver the service. We do not sell your data to
            third parties.
          </Text>
          <List spacing="xs" c="dark.1">
            <List.Item>
              <strong>Clerk</strong> — authentication and user management
            </List.Item>
            <List.Item>
              <strong>Convex</strong> — database and backend infrastructure
            </List.Item>
            <List.Item>
              <strong>Cloudflare R2</strong> — image storage
            </List.Item>
            <List.Item>
              <strong>fal.ai</strong> — AI image generation
            </List.Item>
          </List>
        </div>

        <div>
          <Title order={2} c="white" mb="sm" fz="lg">
            Retention
          </Title>
          <Text c="dark.1">
            We retain your data for as long as your account is active. Upon account deletion, your
            images, generated variations, and personal data are removed from our systems within 30
            days.
          </Text>
        </div>

        <div>
          <Title order={2} c="white" mb="sm" fz="lg">
            Your rights
          </Title>
          <Text c="dark.1">
            You may access, update, or delete your personal data at any time through your Clerk
            account profile. To export your data or request deletion, visit your account settings or
            contact us directly.
          </Text>
        </div>

        <div>
          <Title order={2} c="white" mb="sm" fz="lg">
            Contact
          </Title>
          <Text c="dark.1">
            Questions about this policy?{' '}
            <Anchor href="mailto:support@prodsnap.io" c="brand.4">
              support@prodsnap.io
            </Anchor>
          </Text>
        </div>

        <Divider color="dark.5" />

        <Anchor component={Link} to="/" c="dark.2" size="sm">
          ← Back to home
        </Anchor>
      </Stack>
    </Container>
  )
}
