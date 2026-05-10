import { createFileRoute } from '@tanstack/react-router'
import { SignUp } from '@clerk/react'
import { Center } from '@mantine/core'

export const Route = createFileRoute('/sign-up')({
  component: SignUpRoute,
})

function SignUpRoute() {
  return (
    <Center mih="100vh" p="md">
      <SignUp
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        forceRedirectUrl="/home"
      />
    </Center>
  )
}
