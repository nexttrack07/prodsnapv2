import { createFileRoute } from '@tanstack/react-router'
import { SignUp } from '@clerk/react'
import { Center } from '@mantine/core'

// Splat route so Clerk's path-based sub-steps (e.g. /sign-up/verify-email-address,
// /sign-up/continue, /sign-up/sso-callback) all render the SignUp component
// instead of 404ing. The splat also matches the bare /sign-up path.
export const Route = createFileRoute('/sign-up/$')({
  component: SignUpRoute,
})

function SignUpRoute() {
  return (
    <Center mih="100vh" p="md">
      <SignUp
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        fallbackRedirectUrl="/onboarding"
      />
    </Center>
  )
}
