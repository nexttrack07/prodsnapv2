export type BillingErrorInfo = {
  title: string
  message: string
  action?: { label: string; href: string }
}

export function mapBillingError(err: unknown): BillingErrorInfo {
  const msg = err instanceof Error ? err.message : String(err)

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
