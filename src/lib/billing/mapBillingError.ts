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

  if (/image model rejected|safety|blocked|rejected|moderation|content policy/i.test(msg)) {
    return {
      title: 'Generation blocked',
      message: 'The image model could not generate this request. Try a different template or soften the prompt.',
    }
  }

  if (/timed out|timeout|stuck/i.test(msg)) {
    return {
      title: 'Generation timed out',
      message: 'This generation took too long. Retry it or pick a different template.',
    }
  }

  return mapBillingError(err)
}
