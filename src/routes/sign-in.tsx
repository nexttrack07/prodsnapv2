import { createFileRoute } from '@tanstack/react-router'
import { SignIn } from '@clerk/react'
import { Center } from '@mantine/core'

export const Route = createFileRoute('/sign-in')({
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
