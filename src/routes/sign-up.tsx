import { createFileRoute } from '@tanstack/react-router'
import { SignUp } from '@clerk/react'
import { Center } from '@mantine/core'

// Hash routing keeps every Clerk step (email verification, SSO callback, etc.)
// on this single /sign-up route via the URL hash — no path-based sub-routes
// that would 404 (e.g. /sign-up/verify-email-address).
export const Route = createFileRoute('/sign-up')({
  component: SignUpRoute,
})

function SignUpRoute() {
  return (
    <Center mih="100vh" p="md">
      <SignUp
        routing="hash"
        signInUrl="/sign-in"
        fallbackRedirectUrl="/onboarding"
      />
    </Center>
  )
}
