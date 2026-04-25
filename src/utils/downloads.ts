import { createServerFn } from '@tanstack/react-start'

export const fetchDownloadAsset = createServerFn({ method: 'POST' })
  .inputValidator((data: { url: string }) => data)
  .handler(async ({ data }) => {
    let parsedUrl: URL

    try {
      parsedUrl = new URL(data.url)
    } catch {
      throw new Error('Invalid download URL')
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Invalid download URL')
    }

    const response = await fetch(parsedUrl.toString())
    if (!response.ok) {
      throw new Error(`Download failed (${response.status})`)
    }

    const arrayBuffer = await response.arrayBuffer()

    return {
      base64: Buffer.from(arrayBuffer).toString('base64'),
      contentType: response.headers.get('content-type'),
    }
  })
