/**
 * Maps Mantine dark theme tokens to Stripe Elements appearance config.
 *
 * This is the only Stripe-owned piece of UI we can't DOM-control (PCI
 * requires the card input be an iframe). Stripe's appearance API lets us
 * match brand colors, fonts, and radii so the iframe reads as "our
 * checkout" rather than "a generic Stripe card input".
 */
export type StripeElementsAppearance = {
  theme?: 'stripe' | 'night' | 'flat'
  variables?: Record<string, string>
  rules?: Record<string, Record<string, string>>
}

export function stripeAppearance(): StripeElementsAppearance {
  return {
    theme: 'night',
    variables: {
      // Brand blue matching Mantine `brand.6` (primary)
      colorPrimary: '#0063ff',
      colorBackground: '#1a1a1a', // Mantine dark.6
      colorText: '#e5e5e5',
      colorDanger: '#ff6b6b',
      colorTextSecondary: '#a0a0a0',
      colorTextPlaceholder: '#6c6c6c',
      colorIcon: '#a0a0a0',
      fontFamily:
        'Poppins, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      fontSizeBase: '15px',
      spacingUnit: '4px',
      borderRadius: '8px',
    },
    rules: {
      '.Input': {
        backgroundColor: '#0d0d0d', // dark.7
        borderColor: '#373A40', // dark.4
      },
      '.Input:focus': {
        borderColor: '#0063ff',
        boxShadow: '0 0 0 1px #0063ff',
      },
      '.Label': {
        color: '#a0a0a0',
        fontWeight: '500',
      },
      '.Tab': {
        backgroundColor: '#0d0d0d',
        borderColor: '#373A40',
      },
      '.Tab--selected': {
        borderColor: '#0063ff',
      },
    },
  }
}
