[Skip to main content](https://clerk.com/docs/tanstack-react-start/guides/billing/for-b2c#main)

# Clerk Billing for B2C SaaS

1. [Enable Billing](https://clerk.com/docs/tanstack-react-start/guides/billing/for-b2c#enable-billing)
1. [Payment gateway](https://clerk.com/docs/tanstack-react-start/guides/billing/for-b2c#payment-gateway)
2. [Create a Plan](https://clerk.com/docs/tanstack-react-start/guides/billing/for-b2c#create-a-plan)
3. [Add Features to a Plan](https://clerk.com/docs/tanstack-react-start/guides/billing/for-b2c#add-features-to-a-plan)
4. [Create a pricing page](https://clerk.com/docs/tanstack-react-start/guides/billing/for-b2c#create-a-pricing-page)
5. [Control access with Features and Plans](https://clerk.com/docs/tanstack-react-start/guides/billing/for-b2c#control-access-with-features-and-plans)
1. [Example: Using `has()`](https://clerk.com/docs/tanstack-react-start/guides/billing/for-b2c#example-using-has)
2. [Example: Using `<Show>`](https://clerk.com/docs/tanstack-react-start/guides/billing/for-b2c#example-using-show)

Available in other SDKs

[![](<Base64-Image-Removed>)](https://clerk.com/docs/tanstack-react-start/guides/billing/for-b2c)

Copy as markdownMarkdownCopy as markdown

[Open inOpen in ChatGPTOpenAI](https://chatgpt.com/?q=Read+https%3A%2F%2Fclerk.com%2Fdocs%2Ftanstack-react-start%2Fguides%2Fbilling%2Ffor-b2c.md&hints=search)

Warning

Billing is currently in Beta and its APIs are experimental and may undergo breaking changes. To mitigate potential disruptions, we recommend [pinning](https://clerk.com/docs/pinning) your SDK and `clerk-js` package versions.

Clerk Billing for B2C SaaS allows you to create Plans and manage Subscriptions **for individual users** in your application. If you'd like to charge companies or organizations, see [Billing for B2B SaaS](https://clerk.com/docs/tanstack-react-start/guides/billing/for-b2b). You can also combine both B2C and B2B Billing in the same application.

## [Enable Billing](https://clerk.com/docs/tanstack-react-start/guides/billing/for-b2c\#enable-billing)

To enable Billing for your application, navigate to the [**Billing Settings**⁠](https://dashboard.clerk.com/~/billing/settings) page in the Clerk Dashboard. This page will guide you through enabling Billing for your application.

Clerk Billing costs the same as using Stripe Billing directly, just 0.7% per transaction, plus transaction fees which are paid directly to Stripe. Clerk Billing is **not** the same as Stripe Billing. Plans and pricing are managed directly through the Clerk Dashboard and won't sync with your existing Stripe products or plans. Clerk uses Stripe **only** for payment processing, so you don't need to set up Stripe Billing.

### [Payment gateway](https://clerk.com/docs/tanstack-react-start/guides/billing/for-b2c\#payment-gateway)

Once you have enabled Billing, you will see the following **Payment gateway** options for collecting payments via Stripe:

- **Clerk development gateway**: A shared **test** Stripe account used for development instances. This allows developers to test and build Billing flows **in development** without needing to create and configure a Stripe account.
- **Stripe account**: Use your own Stripe account for production. **A Stripe account created for a development instance cannot be used for production**. You will need to create a separate Stripe account for your production environment.

## [Create a Plan](https://clerk.com/docs/tanstack-react-start/guides/billing/for-b2c\#create-a-plan)

Subscription Plans are what your users subscribe to. There is no limit to the number of Plans you can create.

To create a Plan, navigate to the [**Subscription plans**⁠](https://dashboard.clerk.com/~/billing/plans) page in the Clerk Dashboard. Here, you can create, edit, and delete Plans. To setup B2C Billing, select the **Plans for Users** tab and select **Add Plan**. When creating a Plan, you can also create Features for the Plan; see the next section for more information.

Tip

What is the **Publicly available** option?

Show detailsHide details

Show detailsHide details

Plans appear in some Clerk components depending on what kind of Plan it is. All Plans can appear in the `<PricingTable />` component. If it's a user Plan, it can appear in the `<UserProfile />` component. When creating or editing a Plan, if you'd like to hide it from appearing in Clerk components, you can toggle the **Publicly available** option off.

## [Add Features to a Plan](https://clerk.com/docs/tanstack-react-start/guides/billing/for-b2c\#add-features-to-a-plan)

[Features](https://clerk.com/docs/guides/secure/features) make it easy to give entitlements to your Plans. You can add any number of Features to a Plan.

You can add a Feature to a Plan when you are creating a Plan. To add it after a Plan is created:

1. Navigate to the [**Subscription plans**⁠](https://dashboard.clerk.com/~/billing/plans) page in the Clerk Dashboard.
2. Select the Plan you'd like to add a Feature to.
3. In the **Features** section, select **Add Feature**.

Tip

What is the **Publicly available** option?

Show detailsHide details

Show detailsHide details

Plans appear in some Clerk components depending on what kind of Plan it is. All Plans can appear in the `<PricingTable />` component. If it's a user Plan, it can appear in the `<UserProfile />` component. When adding a Feature to a Plan, it will also automatically appear in the corresponding Plan. When creating or editing a Feature, if you'd like to hide it from appearing in Clerk components, you can toggle the **Publicly available** option off.

## [Create a pricing page](https://clerk.com/docs/tanstack-react-start/guides/billing/for-b2c\#create-a-pricing-page)

You can create a pricing page by using the [<PricingTable />](https://clerk.com/docs/tanstack-react-start/reference/components/billing/pricing-table) component. This component displays a table of Plans and Features that users can subscribe to. **It's recommended to create a dedicated page**, as shown in the following example.

app/routes/pricing.tsx

```
import { PricingTable } from '@clerk/tanstack-react-start'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: PricingPage,
})

function PricingPage() {
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '0 1rem' }}>
      <PricingTable />
    </div>
  )
}
```

## [Control access with Features and Plans](https://clerk.com/docs/tanstack-react-start/guides/billing/for-b2c\#control-access-with-features-and-plans)

You can use Clerk's Features and Plans to gate access to the content. There are a few ways to do this, but the recommended approach is to either use the [`has()`](https://clerk.com/docs/reference/backend/types/auth-object#has) method or the [<Show>](https://clerk.com/docs/tanstack-react-start/reference/components/control/show) component.

### [Example: Using `has()`](https://clerk.com/docs/tanstack-react-start/guides/billing/for-b2c\#example-using-has)

Use the `has()` method to test if the user has access to a **Plan**:

```
const hasPremiumAccess = has({ plan: 'gold' })
```

Or a **Feature**:

```
const hasPremiumAccess = has({ feature: 'widgets' })
```

The [`has()`](https://clerk.com/docs/reference/backend/types/auth-object#has) method is a server-side helper that checks if the Organization has been granted a specific type of access control (Role, Permission, Feature, or Plan) and returns a boolean value. `has()` is available on the [`auth` object](https://clerk.com/docs/reference/backend/types/auth-object), which you will access differently [depending on the framework you are using](https://clerk.com/docs/reference/backend/types/auth-object#how-to-access-the-auth-object).

Plan

Feature

The following example demonstrates how to use `has()` to check if a user has a Plan.

app/routes/bronze-content.tsx

```
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { auth } from '@clerk/tanstack-react-start/server'

export const authStateFn = createServerFn().handler(async () => {
  const { has, userId } = await auth()

  return {
    userId,
    hasBronzePlan: has({ plan: 'bronze' }),
  }
})

export const Route = createFileRoute('/bronze-content')({
  component: BronzeContentPage,
  beforeLoad: async () => {
    const authObject = await authStateFn()
    return {
      userId: authObject.userId,
      hasBronzePlan: authObject.hasBronzePlan,
    }
  },
})

function BronzeContentPage() {
  const { hasBronzePlan } = Route.useRouteContext()

  if (!hasBronzePlan) return <h1>Only subscribers to the Bronze plan can access this content.</h1>

  return <h1>For Bronze subscribers only</h1>
}
```

### [Example: Using `<Show>`](https://clerk.com/docs/tanstack-react-start/guides/billing/for-b2c\#example-using-show)

The [<Show>](https://clerk.com/docs/tanstack-react-start/reference/components/control/show) component can be used to protect content or even entire routes by checking if the user has been granted a specific type of access control (Role, Permission, Feature, or Plan). You can pass a `fallback` prop to `<Show>` that will be rendered if the user does not have the access control.

Plan

Feature

The following example demonstrates how to use `<Show>` to protect a page by checking if the user has a Plan.

app/routes/protected-content.tsx

```
import { Show } from '@clerk/tanstack-react-start'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/protected-content')({
  component: ProtectedContentPage,
})

function ProtectedContentPage() {
  return (
    <Show
      when={{ plan: 'bronze' }}
      fallback={<p>Only subscribers to the Bronze plan can access this content.</p>}
    >
      <h1>Exclusive Bronze Content</h1>
      <p>This content is only visible to Bronze subscribers.</p>
    </Show>
  )
}
```

## Feedback

What did you think of this content?

It was helpfulIt was not helpfulI have feedback

Last updated onApr 17, 2026

[GitHubEdit on GitHub](https://github.com/clerk/clerk-docs/edit/main/docs/guides/billing/for-b2c.mdx)

Support