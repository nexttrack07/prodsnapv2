[Skip to main content](https://clerk.com/billing#main)

![](https://clerk.com/_next/static/media/circuit-lines@2xl.6eb893d2.webp?dpl=dpl_Ai7kfN8rypYKKMCoHf3qCnPNah27)

![](https://clerk.com/_next/static/media/circuit-components@2xl.4a5eabed.webp?dpl=dpl_Ai7kfN8rypYKKMCoHf3qCnPNah27)

![](https://clerk.com/_next/static/media/circuit-lines@2xl.6eb893d2.webp?dpl=dpl_Ai7kfN8rypYKKMCoHf3qCnPNah27)

![](https://clerk.com/_next/static/media/circuit-components@2xl.4a5eabed.webp?dpl=dpl_Ai7kfN8rypYKKMCoHf3qCnPNah27)

# Subscription billing, without the headache

Clerk Billing is the easiest way to implement subscriptions for B2C and B2B applications. No payment integration code to write, no UI work, nothing to keep in sync. Simply drop-in React components and start capturing recurring revenue.

[Start building](https://dashboard.clerk.com/sign-up)

[Start building](https://clerk.com/docs/quickstart)

## Define and manage plans directly in Clerk

Set up plans in Clerk’s dashboard, create a pricing page with the`<PricingTable />`component, and let customers manage their subscriptions through Clerk’s profile components.

acme.app

Tailor made pricing

from Acme, Inc

Free 14-day trial, no credit card required.

Starter

For personal use

$9

/mo

Billed annually

Unlimited projects

Custom branding

24/7 priority support

Advanced analytics

Collaboration tools

Daily backups

Mobile app integration

Start 14-day trial

Pro

For professionals

$19

/mo

Billed annually

Unlimited projects

Custom branding

24/7 priority support

Advanced analytics

Collaboration tools

Daily backups

Mobile app integration

Start 14-day trial

Checkout

Starter plan

Free trial

Billed annually

$9.00

per month

Subtotal

$9.00

Total Due after trial ends in 14 days

$9.00

Total Due Today

USD

$0.00

Secure, 1-click checkout with Link

Card number

4242 4242 4242 4242

1234 1234 1234 1234

Expiration date

12 / 29

MM / YY

Security code

361

CVC

Country

United States

Postal code

90210

12345

By providing your card information, you allow Team Commerce to charge your card for future payments in accordance with their terms.

Start free trial

Free trial successfully started!

Your new subscription is all set.

Total paid

$0.00

Trial ends on

Nov 12, 2026

Payment method

Visa ⋯ 4242

Continue

## Access user and subscription data in one place

Clerk automatically updates and stores your customer's subscription status alongside their user data, eliminating the need for complex synchronization code and the ongoing maintenance it requires.

`<PricingTable />`

Current plan

Starter

For personal use

$9

/ month

Monthly

Annually

Start 14-day trial

Subscribed

Start 14-day trial

AI assistant

Unlimited files and projects

Workspaces

Advanced reporting

Task reminders

Custom themes

30-day analytics retention

Priority Slack support

User

![](https://clerk.com/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Favatar%403x.11075843.png&w=256&q=75&dpl=dpl_Ai7kfN8rypYKKMCoHf3qCnPNah27)

Brooke Millie

Email address

brooke@example.com

User ID

user\_54UHj87K09LKkju09877s87YU

Joined

August 5, 2024

Subscription

Plan

Starter

Free trial

Status

Active

Amount

$9

Features

AI assistant

Workspaces

Task reminders

Custom themes

Brooke

![](https://clerk.com/_next/static/media/circuit-board@2xq95.2dbe8740.webp?dpl=dpl_Ai7kfN8rypYKKMCoHf3qCnPNah27)

## Gate features based on  your user's subscription plan

Use Clerk's helpers to control access to your application based on the features and entitlements defined in your user's active plan.

### `<Show />` for components

```
import { Show } from '@clerk/nextjs'

export default function ProtectedContentPage() {
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

### `has()` for everything else

```
import { auth } from '@clerk/nextjs/server'

export default async function BronzeContentPage() {
  const { has } = await auth()

  const hasBronzePlan = has({ plan: 'bronze' })

  if (!hasBronzePlan) return <h1>Only subscribers to the Bronze plan can access this content.</h1>

  return <h1>For Bronze subscribers only</h1>
}
```

## Better subscription management, no extra cost

Costs the same as [Stripe billing](https://stripe.com/pricing#billing). See how we compare with other providers:

All in

Billing fees

Transaction fees

- All in



3.6% + $0.30

- All in



3.6% + $0.30

- All in



4.5% + $0.40

- All in



5% + $0.40


| Clerk Billing | Stripe | Polar | Paddle |
| --- | --- | --- | --- |
| Billing fees<br>0.7% | [Billing fees](https://stripe.com/pricing#billing)<br>0.7% | [Billing fees](https://polar.sh/resources/pricing)<br>0.5% | [Billing fees](https://www.paddle.com/pricing)<br>N/A |
| Transaction fees (via Stripe)<br>2.9% + $0.30 | Transaction fees<br>2.9% + $0.30 | Transaction fees<br>4% + $0.40 | Transaction fees<br>5% + $0.40 |
| All in<br>3.6% + $0.30 | All in<br>3.6% + $0.30 | All in<br>4.5% + $0.40 | All in<br>5% + $0.40 |

Example above is for US credit card transactions.

## Integrate Clerk Billing with your framework of choice

[View docs](https://clerk.com/docs/guides/billing/overview)

[![](https://clerk.com/_next/static/media/react-outline.b1cbe9bf.svg?dpl=dpl_Ai7kfN8rypYKKMCoHf3qCnPNah27)![](https://clerk.com/_next/static/media/react.6432efd5.svg?dpl=dpl_Ai7kfN8rypYKKMCoHf3qCnPNah27)\\
\\
React](https://clerk.com/docs/react/getting-started/quickstart) [![](https://clerk.com/_next/static/media/nextjs-outline.904714f0.svg?dpl=dpl_Ai7kfN8rypYKKMCoHf3qCnPNah27)![](https://clerk.com/_next/static/media/nextjs.1a22d8c9.svg?dpl=dpl_Ai7kfN8rypYKKMCoHf3qCnPNah27)\\
\\
Next.js](https://clerk.com/docs/nextjs/getting-started/quickstart) [![](https://clerk.com/_next/static/media/astro-outline.df4875a4.svg?dpl=dpl_Ai7kfN8rypYKKMCoHf3qCnPNah27)![](https://clerk.com/_next/static/media/astro.cbd926b4.svg?dpl=dpl_Ai7kfN8rypYKKMCoHf3qCnPNah27)\\
\\
Astro](https://clerk.com/docs/astro/getting-started/quickstart) [![](https://clerk.com/_next/static/media/tanstack-outline.113f4910.svg?dpl=dpl_Ai7kfN8rypYKKMCoHf3qCnPNah27)![](https://clerk.com/_next/static/media/tanstack.ac511c83.webp?dpl=dpl_Ai7kfN8rypYKKMCoHf3qCnPNah27)\\
\\
TanStack React Start](https://clerk.com/docs/tanstack-react-start/getting-started/quickstart) [![](https://clerk.com/_next/static/media/expo-outline.c3d47fd4.svg?dpl=dpl_Ai7kfN8rypYKKMCoHf3qCnPNah27)![](https://clerk.com/_next/static/media/expo.06328ac5.svg?dpl=dpl_Ai7kfN8rypYKKMCoHf3qCnPNah27)\\
\\
Expo](https://clerk.com/docs/expo/getting-started/quickstart)

## Reliability you can count on

Keep your users authenticated and engaged, even in challenging network conditions, without writing any session management code.

![](https://clerk.com/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Freliability%403x.efc1ddcb.png&w=3840&q=90&dpl=dpl_Ai7kfN8rypYKKMCoHf3qCnPNah27)

### Established reliability

Founded in 2019, Clerk supports thousands of developers across over 10,000 active applications, managing authentication for 100+ million users across the globe.

![](https://clerk.com/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Fsecurity%403x.7d1deb91.png&w=3840&q=90&dpl=dpl_Ai7kfN8rypYKKMCoHf3qCnPNah27)

### Rigorous security standards

Security is Clerk’s top priority, with rigorous testing and certification across SOC 2 TYPE II, HIPAA, CCPA, and other industry standards.

![](https://clerk.com/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Fpayment-protection%403x.91244fc2.png&w=3840&q=90&dpl=dpl_Ai7kfN8rypYKKMCoHf3qCnPNah27)

### Payment protection

Clerk does not store or process credit card information. Instead, you plug in your preferred payment provider for added protections like fraud prevention, PCI compliance, and secure transaction handling with 3Dsecure.

![](https://clerk.com/_next/static/media/logomark-coming-soon@2xq50.6180d404.avif)![](https://clerk.com/_next/static/media/glow-coming-soon@q40.f9909b42.avif?dpl=dpl_Ai7kfN8rypYKKMCoHf3qCnPNah27)

## Coming soon

More features are in the works

- ### Trials⁠Live


Give customers free access to your paid subscriptions for a predefined limited time.

- ### Per-seat billing


Charge customers a variable rate based on the number of seats they select when subscribing to your plans.

- ### Taxes


Easily collect and manage taxes from our upcoming integrations with popular tax collection platforms.

- ### Coupons & discounts


Easily give customers a discount when signing up for your subscription plans via discount codes.

- ### Paid add-on features


Offer your customers paid features they can optionally add to their subscription.

- ### Metered and usage-based billing


We’ll tally up your customer’s usage of your features, and charge them according to the variable rates you set up.


## Technical questions and answers

What is Clerk Billing and how quickly can I launch subscriptions with it?

Clerk Billing helps you add subscriptions to your SaaS app with minimal code. We provide ready-to-use UI components like `<PricingTable />` that displays your pricing plans and lets users or organizations subscribe instantly. We manage the complete subscription lifecycle, allowing you to easily gate features and enforce plan limits.

Do I need a Stripe account to use Clerk Billing?

Yes. Simply connect your Stripe account during setup, and we’ll handle syncing users, payment methods, and transactions automatically.

Does Clerk Billing support usage-based/metered billing today?

Not yet, but usage-based billing is a top priority on our roadmap.

How does Billing work with other Clerk features, especially B2B Organizations?

Clerk Billing is designed with Organizations in mind. Like users, Organizations can have their own subscriptions, letting you bill per team and gate features based on their plan.

Can I restrict access to features/entitlements based on a user’s billing plan?

Yes, use Clerk’s authorization helpers like `has()` or the `<Show />` component to gate features or areas of your app based on a user’s subscription plan.

Can I test my billing flows in dev/staging before going live in prod?

Yes, Clerk’s development instances automatically use a Stripe test account, allowing you to use test credit cards to simulate subscriptions, failures, and upgrades with zero configuration.

Can I offer free trials or promo periods with Clerk Billing?

Yes, Clerk Billing now supports free trials.

Looking for more answers?

Find additional questions about pricing plans, international billing, testing scenarios, and more in our [complete Billing documentation](https://clerk.com/docs/guides/billing/overview).

![](https://clerk.com/_next/static/media/circuit-lines@2xl.6eb893d2.webp?dpl=dpl_Ai7kfN8rypYKKMCoHf3qCnPNah27)![](https://clerk.com/_next/static/media/circuit-components@2xl.4a5eabed.webp?dpl=dpl_Ai7kfN8rypYKKMCoHf3qCnPNah27)

![](https://clerk.com/_next/static/media/cta-logomark-shadow@2xq75.7fe307a4.jpg?dpl=dpl_Ai7kfN8rypYKKMCoHf3qCnPNah27)

![](https://clerk.com/_next/static/media/cta-glow.d1130aab.png?dpl=dpl_Ai7kfN8rypYKKMCoHf3qCnPNah27)

Start now, no strings attached

Integrate complete user management in minutes. **Free** for your first 50,000 monthly retained users and 100 monthly retained orgs. No credit card required.

[Start building](https://dashboard.clerk.com/sign-up)

[Start building](https://clerk.com/docs/quickstart)

Support