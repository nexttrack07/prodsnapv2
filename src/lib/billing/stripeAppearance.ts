/**
 * Maps Mantine dark theme tokens to Clerk's flat Stripe appearance config.
 *
 * Clerk's <PaymentElementProvider stripeAppearance={...}/> expects a FLAT
 * object of CSS-variable values, not the wrapped Stripe Elements appearance
 * object ({theme, variables, rules}). See @clerk/shared
 * `internalStripeAppearance`. Wrapping caused IntegrationError:
 * "variables.variables should be a string".
 */
export type StripeElementsAppearance = {
  colorPrimary: string
  colorBackground: string
  colorText: string
  colorTextSecondary: string
  colorSuccess: string
  colorDanger: string
  colorWarning: string
  fontWeightNormal: string
  fontWeightMedium: string
  fontWeightBold: string
  fontSizeXl: string
  fontSizeLg: string
  fontSizeSm: string
  fontSizeXs: string
  borderRadius: string
  spacingUnit: string
}

export function stripeAppearance(): StripeElementsAppearance {
  return {
    // Brand blue matching Mantine `brand.6`
    colorPrimary: '#0063ff',
    colorBackground: '#1a1a1a', // Mantine dark.6
    colorText: '#e5e5e5',
    colorTextSecondary: '#a0a0a0',
    colorSuccess: '#37b24d',
    colorDanger: '#ff6b6b',
    colorWarning: '#f59f00',
    fontWeightNormal: '400',
    fontWeightMedium: '500',
    fontWeightBold: '600',
    fontSizeXl: '20px',
    fontSizeLg: '17px',
    fontSizeSm: '14px',
    fontSizeXs: '12px',
    borderRadius: '8px',
    spacingUnit: '4px',
  }
}
