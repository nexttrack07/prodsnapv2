import { Link, createFileRoute } from '@tanstack/react-router'
import { Container, Title, Text, List, Anchor, Stack, Divider } from '@mantine/core'
import { seo } from '~/utils/seo'

export const Route = createFileRoute('/terms')({
  head: () => ({
    meta: [
      ...seo({
        title: 'Terms of Service · ProdSnap',
        description: 'Terms governing use of the ProdSnap AI product photo service.',
      }),
    ],
  }),
  component: TermsOfService,
})

function TermsOfService() {
  return (
    <Container size="md" py={64}>
      <Stack gap="xl">
        <div>
          <Title order={1} c="white" mb="xs">
            Terms of Service
          </Title>
          <Text size="sm" c="dark.2">
            Last updated: April 23, 2026
          </Text>
        </div>

        <Divider color="dark.5" />

        <div>
          <Title order={2} c="white" mb="sm" fz="lg">
            Service description
          </Title>
          <Text c="dark.1">
            ProdSnap is an AI-powered product photography service. We generate photo variations from
            images you upload. We do not guarantee the quality, accuracy, or commercial suitability
            of any generated image. Results may vary.
          </Text>
        </div>

        <div>
          <Title order={2} c="white" mb="sm" fz="lg">
            User obligations
          </Title>
          <List spacing="xs" c="dark.1">
            <List.Item>
              You must legally own or hold the rights to any image you upload to ProdSnap.
            </List.Item>
            <List.Item>
              You must not upload images that are illegal, abusive, or that infringe third-party
              rights.
            </List.Item>
            <List.Item>You are responsible for paying for credits consumed by your account.</List.Item>
          </List>
        </div>

        <div>
          <Title order={2} c="white" mb="sm" fz="lg">
            Subscription &amp; billing
          </Title>
          <List spacing="xs" c="dark.1">
            <List.Item>
              Subscriptions are billed monthly on a recurring basis via Clerk Billing.
            </List.Item>
            <List.Item>Credits reset on your billing anniversary date each month.</List.Item>
            <List.Item>
              You may cancel your subscription at any time from{' '}
              <Anchor component={Link} to="/account/billing" c="brand.4">
                /account/billing
              </Anchor>
              . Cancellation takes effect at the end of the current billing period.
            </List.Item>
            <List.Item>
              Consumed credits are non-refundable. Unused credits at cancellation are forfeited.
            </List.Item>
          </List>
        </div>

        <div>
          <Title order={2} c="white" mb="sm" fz="lg">
            Acceptable use
          </Title>
          <Text c="dark.1" mb="sm">
            The following are strictly prohibited:
          </Text>
          <List spacing="xs" c="dark.1">
            <List.Item>Child sexual abuse material (CSAM) in any form</List.Item>
            <List.Item>Impersonation of individuals, brands, or organisations</List.Item>
            <List.Item>Images promoting or depicting illegal products or activities</List.Item>
          </List>
        </div>

        <div>
          <Title order={2} c="white" mb="sm" fz="lg">
            Liability disclaimer
          </Title>
          <Text c="dark.1">
            ProdSnap is provided "AS IS" without warranty of any kind, express or implied. To the
            fullest extent permitted by law, we disclaim all warranties and shall not be liable for
            any indirect, incidental, or consequential damages arising from your use of the service.
          </Text>
        </div>

        <div>
          <Title order={2} c="white" mb="sm" fz="lg">
            Termination
          </Title>
          <Text c="dark.1">
            We reserve the right to suspend or terminate your account without notice if you violate
            these Terms of Service or engage in activity that harms other users or the integrity of
            the service.
          </Text>
        </div>

        <div>
          <Title order={2} c="white" mb="sm" fz="lg">
            Governing law
          </Title>
          <Text c="dark.1">
            These terms are governed by the laws of the United States, without regard to conflict of
            law principles.
          </Text>
        </div>

        <div>
          <Title order={2} c="white" mb="sm" fz="lg">
            Contact
          </Title>
          <Text c="dark.1">
            Questions about these terms?{' '}
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
