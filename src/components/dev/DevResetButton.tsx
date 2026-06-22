/**
 * LOCAL TESTING ONLY. A fixed dev button that wipes the signed-in account's
 * activation state and drops you back on the landing page, so you can re-run
 * landing → free ad test without signing up new accounts.
 *
 * Renders only in a Vite dev build (`import.meta.env.DEV`); the underlying
 * mutation is additionally gated by `DEV_ALLOW_REACTIVATION=true` in the Convex
 * env, so this never does anything in production.
 */
import { useState } from 'react'
import { useMutation } from 'convex/react'
import { useNavigate } from '@tanstack/react-router'
import { notifications } from '@mantine/notifications'
import { Button } from '@mantine/core'
import { IconRefresh } from '@tabler/icons-react'
import { api } from '../../../convex/_generated/api'
import { STARTER_MODE_KEY } from '../../routes/onboarding'

export function DevResetButton() {
  if (!import.meta.env.DEV) return null
  return <DevResetButtonInner />
}

function DevResetButtonInner() {
  const navigate = useNavigate()
  const reset = useMutation(api.activation.resetMyActivation)
  const [busy, setBusy] = useState(false)

  const handleReset = async () => {
    setBusy(true)
    try {
      await reset({})
      try {
        sessionStorage.removeItem(STARTER_MODE_KEY)
      } catch {
        /* ignore */
      }
      notifications.show({
        color: 'green',
        message: 'Activation reset — back to the landing page.',
      })
      navigate({ to: '/' })
    } catch (err) {
      notifications.show({
        color: 'red',
        title: 'Reset failed',
        message: err instanceof Error ? err.message : 'Could not reset.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      size="xs"
      variant="filled"
      color="grape"
      loading={busy}
      leftSection={<IconRefresh size={13} />}
      onClick={handleReset}
      style={{
        position: 'fixed',
        bottom: 12,
        left: 12,
        zIndex: 9999,
        opacity: 0.85,
      }}
    >
      Reset activation (dev)
    </Button>
  )
}
