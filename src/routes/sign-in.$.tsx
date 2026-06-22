import { createFileRoute } from '@tanstack/react-router'
import { SignIn } from '@clerk/react'
import { Center } from '@mantine/core'

// Splat route so Clerk's path-based sub-steps (e.g. /sign-in/factor-one,
// /sign-in/sso-callback) all render the SignIn component instead of 404ing.
// The splat also matches the bare /sign-in path.
export const Route = createFileRoute('/sign-in/$')({
  component: SignInRoute,
})

function SignInRoute() {
  return (
    <Center mih="100vh" p="md">
      <SignIn
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        forceRedirectUrl="/home"
      />
    </Center>
  )
}
