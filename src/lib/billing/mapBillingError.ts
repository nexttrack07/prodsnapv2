export type BillingErrorInfo = {
  title: string
  message: string
  action?: { label: string; href: string }
}

// Codes match `BillingErrorCode` in convex/lib/billing/errors.ts. Duplicated
// here (not imported) to avoid pulling Convex server modules into the client
// bundle just for the type.
type StructuredError = {
  data?: {
    code?:
      | 'NO_SUBSCRIPTION'
      | 'MISSING_CAPABILITY'
      | 'PRODUCT_LIMIT'
      | 'CREDITS_EXHAUSTED'
      | 'CREDITS_INSUFFICIENT'
      | 'RATE_LIMIT'
    message?: string
  }
}

function readStructured(err: unknown): StructuredError['data'] | undefined {
  if (!err || typeof err !== 'object') return undefined
  const data = (err as StructuredError).data
  if (data && typeof data === 'object' && typeof data.code === 'string') {
    return data
  }
  return undefined
}

export function mapBillingError(err: unknown): BillingErrorInfo {
  const structured = readStructured(err)
  const fallbackMsg = err instanceof Error ? err.message : String(err)

  if (structured) {
    const msg = structured.message ?? fallbackMsg
    switch (structured.code) {
      case 'CREDITS_EXHAUSTED':
        return {
          title: 'Credits exhausted',
          message: msg,
          action: { label: 'Upgrade plan', href: '/pricing' },
        }
      case 'CREDITS_INSUFFICIENT':
        return {
          title: 'Not enough credits',
          message: msg,
          action: { label: 'Upgrade plan', href: '/pricing' },
        }
      case 'NO_SUBSCRIPTION':
        return {
          title: 'Subscription required',
          message: msg,
          action: { label: 'View plans', href: '/pricing' },
        }
      case 'PRODUCT_LIMIT':
        return {
          title: 'Product limit reached',
          message: msg,
          action: { label: 'Upgrade plan', href: '/pricing' },
        }
      case 'MISSING_CAPABILITY':
        return {
          title: 'Upgrade required',
          message: msg,
          action: { label: 'View plans', href: '/pricing' },
        }
      case 'RATE_LIMIT':
        return { title: 'Slow down', message: 'Please wait a moment.' }
    }
  }

  // Legacy substring fallback for non-billing errors and any pre-migration
  // throw site that hasn't been upgraded to billingError() yet.
  const msg = fallbackMsg
  if (msg.includes('used all') && msg.includes('credits')) {
    return {
      title: 'Credits exhausted',
      message: msg,
      action: { label: 'Upgrade plan', href: '/pricing' },
    }
  }
  if (msg.includes('Not enough credits')) {
    return {
      title: 'Not enough credits',
      message: msg,
      action: { label: 'Upgrade plan', href: '/pricing' },
    }
  }
  if (msg.includes('No active subscription')) {
    return {
      title: 'Subscription required',
      message: msg,
      action: { label: 'View plans', href: '/pricing' },
    }
  }
  if (msg.includes('product limit')) {
    return {
      title: 'Product limit reached',
      message: msg,
      action: { label: 'Upgrade plan', href: '/pricing' },
    }
  }
  if (msg.includes('Too many requests')) {
    return {
      title: 'Slow down',
      message: 'Please wait a moment.',
    }
  }
  return {
    title: 'Something went wrong',
    message: msg,
  }
}

export function mapGenerationError(err: unknown): BillingErrorInfo {
  const msg = err instanceof Error ? err.message : String(err)

  if (/image model rejected|safety|blocked|rejected/i.test(msg)) {
    return {
      title: 'Generation blocked by safety filter',
      message:
        'The AI model flagged your prompt or template. Try a different template, soften the wording, or upload a cleaner product image.',
    }
  }

  if (/timeout|timed out/i.test(msg)) {
    return {
      title: 'Generation timed out',
      message: 'The image model took too long to respond. Please try again.',
    }
  }

  if (/model did not return/i.test(msg)) {
    return {
      title: 'No image generated',
      message: 'The AI model returned no image. Please retry.',
    }
  }

  return mapBillingError(err)
}
