import { createFileRoute } from '@tanstack/react-router'
import { SignIn } from '@clerk/react'
import { Center } from '@mantine/core'

// Hash routing keeps every Clerk step (factor-one, SSO callback, etc.) on this
// single /sign-in route via the URL hash — no path-based sub-routes that would
// 404 (e.g. /sign-in/factor-one).
export const Route = createFileRoute('/sign-in')({
  component: SignInRoute,
})

function SignInRoute() {
  return (
    <Center mih="100vh" p="md">
      <SignIn
        routing="hash"
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/home"
      />
    </Center>
  )
}
