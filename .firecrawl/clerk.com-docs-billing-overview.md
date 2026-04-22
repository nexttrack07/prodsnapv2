[Skip to main content](https://clerk.com/docs/guides/billing/overview#main)

# Clerk Billing

1. [Frequently asked questions (FAQ)](https://clerk.com/docs/guides/billing/overview#frequently-asked-questions-faq)
01. [Can I use an existing Stripe account with Clerk Billing?](https://clerk.com/docs/guides/billing/overview#can-i-use-an-existing-stripe-account-with-clerk-billing)
02. [Can I see Subscriptions in my Stripe account?](https://clerk.com/docs/guides/billing/overview#can-i-see-subscriptions-in-my-stripe-account)
03. [Can I use the same Stripe account for both dev and prod environments?](https://clerk.com/docs/guides/billing/overview#can-i-use-the-same-stripe-account-for-both-dev-and-prod-environments)
04. [Does Clerk Billing support refunds?](https://clerk.com/docs/guides/billing/overview#does-clerk-billing-support-refunds)
05. [Is Clerk a Merchant of Record (MoR) for transactions?](https://clerk.com/docs/guides/billing/overview#is-clerk-a-merchant-of-record-mo-r-for-transactions)
06. [Does Clerk Billing support non-USD currencies?](https://clerk.com/docs/guides/billing/overview#does-clerk-billing-support-non-usd-currencies)
07. [What third-party tools does Clerk Billing integrate with?](https://clerk.com/docs/guides/billing/overview#what-third-party-tools-does-clerk-billing-integrate-with)
08. [Can I offer custom pricing plans to specific customers?](https://clerk.com/docs/guides/billing/overview#can-i-offer-custom-pricing-plans-to-specific-customers)
09. [Can I let users upgrade or downgrade their plans mid-cycle?](https://clerk.com/docs/guides/billing/overview#can-i-let-users-upgrade-or-downgrade-their-plans-mid-cycle)
10. [Does Clerk Billing support annual Subscriptions?](https://clerk.com/docs/guides/billing/overview#does-clerk-billing-support-annual-subscriptions)
11. [How does Clerk handle taxes and VAT for international billing?](https://clerk.com/docs/guides/billing/overview#how-does-clerk-handle-taxes-and-vat-for-international-billing)
12. [How can I test failure scenarios like expired cards or canceled Subscriptions?](https://clerk.com/docs/guides/billing/overview#how-can-i-test-failure-scenarios-like-expired-cards-or-canceled-subscriptions)
13. [Which countries is Clerk Billing not supported in?](https://clerk.com/docs/guides/billing/overview#which-countries-is-clerk-billing-not-supported-in)
14. [Does Clerk Billing support additional factor authentication like 3D Secure?](https://clerk.com/docs/guides/billing/overview#does-clerk-billing-support-additional-factor-authentication-like-3-d-secure)

Copy as markdownMarkdownCopy as markdown

Warning

Billing is currently in Beta and its APIs are experimental and may undergo breaking changes. To mitigate potential disruptions, we recommend [pinning](https://clerk.com/docs/pinning) your SDK and `clerk-js` package versions.

Clerk Billing allows your customers to purchase recurring Subscriptions to your application. To get started, **choose one or combine both of the following** business models depending on your application's needs.

### [BillingforB2CSaaS](https://clerk.com/docs/guides/billing/for-b2c)

To charge individual users

### [BillingforB2BSaaS](https://clerk.com/docs/guides/billing/for-b2b)

To charge companies or organizations

### [Webhooks](https://clerk.com/docs/guides/development/webhooks/billing)

To track Subscription lifecycles and monitor payment attempts

### [Buildasimplecheckoutpage](https://clerk.com/docs/guides/development/custom-flows/billing/checkout-new-payment-method)

To charge users with a new payment method

## [Frequently asked questions (FAQ)](https://clerk.com/docs/guides/billing/overview\#frequently-asked-questions-faq)

### [Can I use an existing Stripe account with Clerk Billing?](https://clerk.com/docs/guides/billing/overview\#can-i-use-an-existing-stripe-account-with-clerk-billing)

Yes, you can use an existing Stripe account, as long as it isn't controlled by another platform.

Disconnect accounts created under a platform's Stripe Connect setup from that platform before linking them to Clerk.

In general, if you created your Stripe account yourself via Stripe, it's independent; if it was created through another service, it may be platform-controlled.

### [Can I see Subscriptions in my Stripe account?](https://clerk.com/docs/guides/billing/overview\#can-i-see-subscriptions-in-my-stripe-account)

Clerk Billing only uses Stripe for payment processing. You can see payment and customer information in Stripe. However, Clerk Billing is a separate product from Stripe Billing; Plans and Subscriptions made in Clerk are not synced to Stripe.

### [Can I use the same Stripe account for both dev and prod environments?](https://clerk.com/docs/guides/billing/overview\#can-i-use-the-same-stripe-account-for-both-dev-and-prod-environments)

No. Stripe accounts created for development instances are sandbox/test accounts and cannot be used for production. For a production environment, you must create a separate Stripe account.

### [Does Clerk Billing support refunds?](https://clerk.com/docs/guides/billing/overview\#does-clerk-billing-support-refunds)

No, Clerk Billing does not support refunds at this time. You can still issue a refund through your Stripe account. Please note that refunds performed in Stripe will not be reflected in income/MRR calculations.

### [Is Clerk a Merchant of Record (MoR) for transactions?](https://clerk.com/docs/guides/billing/overview\#is-clerk-a-merchant-of-record-mo-r-for-transactions)

No, Clerk does not provide this service.

### [Does Clerk Billing support non-USD currencies?](https://clerk.com/docs/guides/billing/overview\#does-clerk-billing-support-non-usd-currencies)

Clerk Billing currently supports only USD as the billing currency. While you can connect both US and non-US Stripe accounts, all payments will be processed in USD regardless of your Stripe account's local currency. For information about Stripe's supported countries and currencies, see [Stripe Global⁠](https://stripe.com/global). Support for additional currencies is on our roadmap.

### [What third-party tools does Clerk Billing integrate with?](https://clerk.com/docs/guides/billing/overview\#what-third-party-tools-does-clerk-billing-integrate-with)

None directly, but since payments are processed through Stripe, you can use any third-party tool that integrates with Stripe for analytics, reporting, invoicing, or tax compliance.

### [Can I offer custom pricing plans to specific customers?](https://clerk.com/docs/guides/billing/overview\#can-i-offer-custom-pricing-plans-to-specific-customers)

Yes, Clerk Billing supports custom pricing plans. See [Custom Plans and prices](https://clerk.com/docs/guides/billing/custom-plans) for more information.

### [Can I let users upgrade or downgrade their plans mid-cycle?](https://clerk.com/docs/guides/billing/overview\#can-i-let-users-upgrade-or-downgrade-their-plans-mid-cycle)

Yes. Plan upgrades will take effect immediately, while downgrades take effect at the end of the current billing cycle.

### [Does Clerk Billing support annual Subscriptions?](https://clerk.com/docs/guides/billing/overview\#does-clerk-billing-support-annual-subscriptions)

Yes, you can offer subscribers the option to pay annually, at a discounted monthly price. Annual pricing for your plans can be configured from the [**Subscription plans**⁠](https://dashboard.clerk.com/~/billing/plans) page in the Clerk Dashboard. Customers can choose between monthly or annual billing when subscribing.

### [How does Clerk handle taxes and VAT for international billing?](https://clerk.com/docs/guides/billing/overview\#how-does-clerk-handle-taxes-and-vat-for-international-billing)

Clerk Billing does not currently support tax or VAT, but these are planned for future releases.

### [How can I test failure scenarios like expired cards or canceled Subscriptions?](https://clerk.com/docs/guides/billing/overview\#how-can-i-test-failure-scenarios-like-expired-cards-or-canceled-subscriptions)

You can simulate failures in Stripe test mode using test cards that trigger specific behaviors. See [Stripe Testing⁠](https://docs.stripe.com/testing) for a list of test cards and behaviors.

### [Which countries is Clerk Billing not supported in?](https://clerk.com/docs/guides/billing/overview\#which-countries-is-clerk-billing-not-supported-in)

Clerk Billing is not supported in Brazil, India, Malaysia, Mexico, Singapore, and Thailand due to [payment processing restrictions⁠](https://stripe.com/legal/restricted-businesses). Support may be added in the future. For all other regions, availability depends on Stripe - see [Stripe Global⁠](https://stripe.com/global) for the full list.

### [Does Clerk Billing support additional factor authentication like 3D Secure?](https://clerk.com/docs/guides/billing/overview\#does-clerk-billing-support-additional-factor-authentication-like-3-d-secure)

Clerk Billing does not currently support additional factor authentication. Users will receive an error indicating that the provided payment method requires additional confirmation, which Clerk Billing does not support, and will be asked to use a different payment method.

## Feedback

What did you think of this content?

It was helpfulIt was not helpfulI have feedback

Last updated onApr 17, 2026

[GitHubEdit on GitHub](https://github.com/clerk/clerk-docs/edit/main/docs/guides/billing/overview.mdx)

Support