/**
 * /account/billing page. Displays the signed-in user's current plan +
 * usage, with actions to change plan or cancel subscription.
 *
 * Reads from:
 *   - api.billing.syncPlan.getBillingStatus — snapshot of plan/limits/usage
 * Writes via:
 *   - api.billing.syncPlan.cancelMySubscription — cancel (end of period)
 *   - api.billing.syncPlan.syncUserPlan — force resync after cancel
 */
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useClerk } from '@clerk/react'
import {
  Alert,
  Button,
  Card,
  Container,
  Group,
  Loader,
  Modal,
  Paper,
  Progress,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { IconBolt, IconPhoto } from '@tabler/icons-react'
import { useAction, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'

export function AccountBillingPage() {
  const { openUserProfile } = useClerk()
  const status = useQuery(api.billing.syncPlan.getBillingStatus)
  const cancelSub = useAction(api.billing.syncPlan.cancelMySubscription)
  const syncPlan = useAction(api.billing.syncPlan.syncUserPlan)

  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [canceling, setCanceling] = useState(false)
  const [canceledMessage, setCanceledMessage] = useState<string | null>(null)

  if (!status) {
    return (
      <Container size="sm" py="xl">
        <Group justify="center" py="xl">
          <Loader size="md" />
        </Group>
      </Container>
    )
  }

  if (!status.signedIn) {
    return (
      <Container size="sm" py="xl">
        <Text c="dark.2">Please sign in to view billing details.</Text>
      </Container>
    )
  }

  if (!status.plan) {
    return (
      <Container size="sm" py="xl">
        <Stack gap="lg">
          <Title order={2}>Billing</Title>
          <Alert color="yellow" variant="light">
            You don't have an active subscription.
          </Alert>
          <Group gap="sm">
            <Button component={Link} to="/pricing" color="brand" fz="sm">
              Choose a plan
            </Button>
            <Button variant="subtle" color="gray" fz="sm" onClick={() => openUserProfile()}>
              Manage or delete account
            </Button>
          </Group>
        </Stack>
      </Container>
    )
  }

  const creditsPct = status.creditsTotal
    ? Math.min(100, Math.round((status.creditsUsed / status.creditsTotal) * 100))
    : 0
  const productPct = status.productLimit
    ? Math.min(100, Math.round((status.productCount / status.productLimit) * 100))
    : 0
  const resetDate = status.resetsOn
    ? new Date(status.resetsOn).toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
      })
    : null

  const cancelScheduledAt = (status as { cancelScheduledAt?: number | null })
    .cancelScheduledAt ?? null
  const periodEnd = (status as { periodEnd?: number | null }).periodEnd ?? null
  const periodEndLabel = periodEnd
    ? new Date(periodEnd).toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null

  const doCancel = async () => {
    setCanceling(true)
    setCancelError(null)
    try {
      await cancelSub({ endNow: false })
      // Don't hard-refresh userPlans — end-of-period cancels keep the user
      // on their plan until the period expires.
      await syncPlan().catch(() => {})
      setCanceledMessage(
        'Your subscription is scheduled to cancel at the end of the current billing period. You keep access until then.',
      )
      setCancelOpen(false)
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setCanceling(false)
    }
  }

  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <Title order={2}>Billing</Title>

        {(['past_due', 'incomplete', 'unpaid'] as const).includes(
          (status as { billingStatus?: string }).billingStatus as 'past_due' | 'incomplete' | 'unpaid',
        ) && (
          <Alert color="yellow" variant="light" title="Payment issue">
            There's a problem with your payment — update your payment method to keep using ProdSnap.{' '}
            <Button
              variant="transparent"
              color="yellow"
              size="compact-sm"
              p={0}
              onClick={() => openUserProfile()}
            >
              Update payment method
            </Button>
          </Alert>
        )}

        {cancelScheduledAt && (
          <Alert color="orange" variant="light" title="Cancellation scheduled">
            <Stack gap="xs">
              <Text size="sm">
                Your subscription is scheduled to end
                {periodEndLabel ? ` on ${periodEndLabel}` : ' at the end of the current billing period'}
                . You'll keep access until then.
              </Text>
              <Group>
                <Button
                  variant="light"
                  color="brand"
                  size="xs"
                  onClick={() => openUserProfile()}
                >
                  Resume subscription
                </Button>
              </Group>
            </Stack>
          </Alert>
        )}

        {canceledMessage && (
          <Alert color="green" variant="light" withCloseButton={false}>
            {canceledMessage}
          </Alert>
        )}

        <Card withBorder radius="lg" padding="lg" bg="dark.7">
          <Stack gap="md">
            <Group justify="space-between" align="flex-start">
              <Stack gap={4}>
                <Text size="xs" c="dark.2" tt="uppercase" fw={600}>
                  Current plan
                </Text>
                <Title order={3} tt="capitalize">
                  {status.plan}
                </Title>
              </Stack>
              <Button
                component={Link}
                to={`/pricing${status.plan ? `?plan=${status.plan}` : ''}`}
                variant="light"
                color="brand"
                size="sm"
              >
                Change plan
              </Button>
            </Group>

            <Stack gap="xs">
              <Group justify="space-between">
                <Group gap={6}>
                  <IconBolt size={16} />
                  <Text size="sm">Monthly credits</Text>
                </Group>
                <Text size="sm" c="dark.1">
                  {status.creditsUsed} / {status.creditsTotal}
                </Text>
              </Group>
              <Progress value={creditsPct} color={creditsPct >= 90 ? 'red' : 'brand'} />
              {resetDate && (
                <Text size="xs" c="dark.3">
                  Resets on {resetDate}
                </Text>
              )}
            </Stack>

            <Stack gap="xs">
              <Group justify="space-between">
                <Group gap={6}>
                  <IconPhoto size={16} />
                  <Text size="sm">Products</Text>
                </Group>
                <Text size="sm" c="dark.1">
                  {status.productCount}
                  {status.productLimit != null ? ` / ${status.productLimit}` : ''}
                </Text>
              </Group>
              {status.productLimit != null && (
                <Progress value={productPct} color={productPct >= 90 ? 'red' : 'brand'} />
              )}
            </Stack>
          </Stack>
        </Card>

        <Card withBorder radius="lg" padding="lg" bg="dark.7">
          <Stack gap="sm">
            <Text size="xs" c="dark.2" tt="uppercase" fw={600}>
              Cancel subscription
            </Text>
            <Text size="sm" c="dark.1">
              You'll keep access until the end of the current billing period.
              After that, your subscription won't renew and you'll be routed
              to the pricing page.
            </Text>
            <Button
              variant="subtle"
              color="red"
              w="fit-content"
              size="sm"
              onClick={() => setCancelOpen(true)}
            >
              Cancel subscription
            </Button>
          </Stack>
        </Card>

        <Card withBorder radius="lg" padding="lg" bg="dark.7">
          <Stack gap="sm">
            <Text size="xs" c="dark.2" tt="uppercase" fw={600}>
              Account
            </Text>
            <Text size="sm" c="dark.1">
              Manage your profile or delete your account from Clerk account settings.
            </Text>
            <Button
              variant="subtle"
              color="gray"
              w="fit-content"
              size="sm"
              onClick={() => openUserProfile()}
            >
              Manage or delete account
            </Button>
          </Stack>
        </Card>

        <Paper withBorder p="md" radius="md" mt="lg" style={{ borderColor: 'var(--mantine-color-red-9)' }}>
          <Stack gap="xs">
            <Text fw={500} c="red.5">Danger zone</Text>
            <Text size="sm" c="dark.2">
              Deleting your account is permanent. Your products, generations, and billing
              history will be lost. Cancel your subscription first if it's still active.
            </Text>
            <Button
              variant="outline"
              color="red"
              size="xs"
              fz="xs"
              onClick={() => openUserProfile()}
              disabled={canceling}
            >
              Manage or delete account
            </Button>
          </Stack>
        </Paper>
      </Stack>

      <Modal
        opened={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel subscription?"
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            Your subscription will stop renewing at the end of the current
            billing period. You keep all your credits and access until then.
          </Text>
          {cancelError && (
            <Alert color="red" variant="light">
              {cancelError}
            </Alert>
          )}
          <Group justify="flex-end" gap="sm">
            <Button
              variant="default"
              onClick={() => setCancelOpen(false)}
              disabled={canceling}
            >
              Keep subscription
            </Button>
            <Button color="red" onClick={doCancel} loading={canceling}>
              Confirm cancel
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  )
}
