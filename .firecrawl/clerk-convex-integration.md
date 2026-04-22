[Skip to main content](https://clerk.com/docs/guides/development/integrations/databases/convex#main)

# Integrate Convex with Clerk

1. [Set up Clerk as a Convex auth provider](https://clerk.com/docs/guides/development/integrations/databases/convex#set-up-clerk-as-a-convex-auth-provider)
2. [Map additional claims (optional)](https://clerk.com/docs/guides/development/integrations/databases/convex#map-additional-claims-optional)
3. [Configure Convex with Clerk's Frontend API URL](https://clerk.com/docs/guides/development/integrations/databases/convex#configure-convex-with-clerks-frontend-api-url)
4. [Deploy your changes to Convex](https://clerk.com/docs/guides/development/integrations/databases/convex#deploy-your-changes-to-convex)
5. [Configure the Clerk and Convex providers](https://clerk.com/docs/guides/development/integrations/databases/convex#configure-the-clerk-and-convex-providers)
6. [Show UI based on auth state](https://clerk.com/docs/guides/development/integrations/databases/convex#show-ui-based-on-auth-state)
7. [Use auth state in your Convex functions](https://clerk.com/docs/guides/development/integrations/databases/convex#use-auth-state-in-your-convex-functions)
8. [Next steps](https://clerk.com/docs/guides/development/integrations/databases/convex#next-steps)

Copy as markdownMarkdownCopy as markdown

[Open inOpen in ChatGPTOpenAI](https://chatgpt.com/?q=Read+https%3A%2F%2Fclerk.com%2Fdocs%2Fguides%2Fdevelopment%2Fintegrations%2Fdatabases%2Fconvex.md&hints=search)

## Before you start

- [Clerk IconSet up a Clerk application](https://clerk.com/docs/getting-started/quickstart/setup-clerk)
- [Integrate a Clerk SDK into your app](https://clerk.com/docs/getting-started/quickstart/overview)
- [Integrate Convex into your app](https://docs.convex.dev/quickstarts)

## Example repositories

- [Convex's Next.js + Clerk Template](https://github.com/get-convex/template-nextjs-clerk)
- [Convex's React + Clerk Template](https://github.com/get-convex/template-react-vite-clerk)

With [Convex⁠](https://www.convex.dev/), you can build a backend with a provided realtime database, file storage, text search, scheduling and more. Paired with Clerk's user authentication and management features, you can build a powerful application with minimal effort. This tutorial will show you how to integrate Clerk into your Convex application. It assumes that you have already integrated both Convex and one of Clerk's SDKs into your app.

## [Set up Clerk as a Convex auth provider](https://clerk.com/docs/guides/development/integrations/databases/convex\#set-up-clerk-as-a-convex-auth-provider)

For your Clerk session token to work with Convex, you need to set up the Convex integration in Clerk.

1. In the Clerk Dashboard, navigate to the [Convex integration setup⁠](https://dashboard.clerk.com/apps/setup/convex).
2. Choose your configuration options, and then select **Activate Convex integration**. This will reveal the Frontend API URL⁠ for your Clerk instance.
3. Save the URL. In development, its format is `https://verb-noun-00.clerk.accounts.dev`. In production, its format is `https://clerk.<your-domain>.com`.

## [Map additional claims (optional)](https://clerk.com/docs/guides/development/integrations/databases/convex\#map-additional-claims-optional)

If you need to map additional claims, navigate to the [**Sessions**⁠](https://dashboard.clerk.com/~/sessions) page in the Clerk Dashboard.

In the **Claims** section, the default audience (`aud`) claim required by Convex is pre-mapped. You can include additional claims as necessary. [Shortcodes](https://clerk.com/docs/guides/sessions/jwt-templates#shortcodes) are available to make adding dynamic user values easy.

## [Configure Convex with Clerk's Frontend API URL](https://clerk.com/docs/guides/development/integrations/databases/convex\#configure-convex-with-clerks-frontend-api-url)

1. In your `env` file, add your Frontend API URL⁠ as the `CLERK_FRONTEND_API_URL` environment variable. If this has already been configured, you can proceed to the next step..env

















```
CLERK_FRONTEND_API_URL=YOUR_FRONTEND_API_URL
```

2. In your app's `convex` folder, create a `auth.config.ts` file with the following configuration:convex/auth.config.ts

















```
export default {
     providers: [\
       {\
         domain: process.env.CLERK_FRONTEND_API_URL,\
         applicationID: 'convex',\
       },\
     ],
}
```


## [Deploy your changes to Convex](https://clerk.com/docs/guides/development/integrations/databases/convex\#deploy-your-changes-to-convex)

Run `npx convex dev` to automatically sync your configuration to your backend.

## [Configure the Clerk and Convex providers](https://clerk.com/docs/guides/development/integrations/databases/convex\#configure-the-clerk-and-convex-providers)

Both Clerk and Convex have provider components that are required to provide authentication and client context. You should already have Clerk's provider component, `<ClerkProvider>`, in your app. Convex offers a provider that is specifically for integrating with Clerk called `<ConvexProviderWithClerk>`.

Next.js

React

`<ConvexProviderWithClerk>` calls `ConvexReactClient()` to get Convex's client, so it must be used in a Client Component. Your `app/layout.tsx`, where you would use `<ConvexProviderWithClerk>`, is a Server Component, and a Server Component cannot contain Client Component code. To solve this, you must first create a _wrapper_ Client Component around `<ConvexProviderWithClerk>`.

components/ConvexClientProvider.tsx

```
'use client'

import { ReactNode } from 'react'
import { ConvexReactClient } from 'convex/react'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
import { useAuth } from '@clerk/nextjs'

if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
  throw new Error('Missing NEXT_PUBLIC_CONVEX_URL in your .env file')
}

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL)

export default function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  )
}
```

Now, your Server Component, `app/layout.tsx`, can use the wrapper component, `<ConvexClientProvider>`. It's important that `<ClerkProvider>` wraps `<ConvexClientProvider>`, and not the other way around, as Convex needs to be able to access the Clerk context.

app/layout.tsx

```
import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { ClerkProvider } from '@clerk/nextjs'
import ConvexClientProvider from '@/components/ConvexClientProvider'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Clerk Next.js Quickstart',
  description: 'Generated by create next app',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ClerkProvider>
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  )
}
```

## [Show UI based on auth state](https://clerk.com/docs/guides/development/integrations/databases/convex\#show-ui-based-on-auth-state)

You can control which UI is shown when the user is signed in or signed out using Convex's `<Authenticated>`, `<Unauthenticated>` and `<AuthLoading>` helper components. These should be used instead of Clerk's `<Show when="signed-in">`, `<Show when="signed-out">` and `<ClerkLoading>` components, respectively.

It's important to use the [`useConvexAuth()`⁠](https://docs.convex.dev/api/modules/react#useconvexauth) hook instead of Clerk's `useAuth()` hook when you need to check whether the user is signed in or
not. The `useConvexAuth()` hook makes sure that the browser has fetched the auth token needed to make authenticated requests to your Convex backend, and that the Convex backend has validated it.

In the following example, the `<Content />` component is a child of `<Authenticated>`, so its content and any of its child components are guaranteed to have an authenticated user, and Convex queries can require authentication.

Next.js

React

```
'use client'

import { Authenticated, Unauthenticated } from 'convex/react'
import { SignInButton, UserButton } from '@clerk/nextjs'
import { useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'

export default function Home() {
  return (
    <>
      <Authenticated>
        <UserButton />
        <Content />
      </Authenticated>
      <Unauthenticated>
        <SignInButton />
      </Unauthenticated>
    </>
  )
}

function Content() {
  const messages = useQuery(api.messages.getForCurrentUser)
  return <div>Authenticated content: {messages?.length}</div>
}
```

## [Use auth state in your Convex functions](https://clerk.com/docs/guides/development/integrations/databases/convex\#use-auth-state-in-your-convex-functions)

If the client is authenticated, you can access the information stored in the JWT via `ctx.auth.getUserIdentity`.

If the client isn't authenticated, `ctx.auth.getUserIdentity` will return `null`.

**Make sure that the component calling this query is a child of `<Authenticated>` from**
**`convex/react`**. Otherwise, it will throw on page load.

convex/messages.ts

```
import { query } from './_generated/server'

export const getForCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) {
      throw new Error('Not authenticated')
    }
    return await ctx.db
      .query('messages')
      .filter((q) => q.eq(q.field('author'), identity.email))
      .collect()
  },
})
```

## [Next steps](https://clerk.com/docs/guides/development/integrations/databases/convex\#next-steps)

Be aware that Convex may require usage of their custom hooks and methods rather than Clerk's, such as using Convex's `useConvexAuth()` hook instead of Clerk's `useAuth()` hook in some cases. For more information on how to use Convex with Clerk, see the [Convex docs⁠](https://docs.convex.dev/auth/clerk).

## Feedback

What did you think of this content?

It was helpfulIt was not helpfulI have feedback

Last updated onApr 17, 2026

[GitHubEdit on GitHub](https://github.com/clerk/clerk-docs/edit/main/docs/guides/development/integrations/databases/convex.mdx)

Support