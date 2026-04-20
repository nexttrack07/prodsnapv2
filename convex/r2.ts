'use node'

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { nanoid } from 'nanoid'
import { v } from 'convex/values'
import { action } from './_generated/server'

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

export async function uploadToR2(
  buffer: Buffer,
  key: string,
  contentType: string,
): Promise<string> {
  const bucket = process.env.R2_BUCKET_NAME!
  const publicUrl = process.env.R2_PUBLIC_URL!
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  )
  return `${publicUrl}/${key}`
}

export async function uploadFromUrl(
  sourceUrl: string,
  key: string,
  fallbackContentType = 'image/jpeg',
): Promise<string> {
  const res = await fetch(sourceUrl)
  if (!res.ok) throw new Error(`fetch ${sourceUrl} failed: ${res.status}`)
  const ct = res.headers.get('content-type') ?? fallbackContentType
  const buf = Buffer.from(await res.arrayBuffer())
  return uploadToR2(buf, key, ct)
}

/**
 * Accepts a base64-encoded image from the client and uploads to R2
 * under `uploads/{nanoid}-{name}`. Returns the public URL.
 */
export const uploadProductImage = action({
  args: {
    name: v.string(),
    contentType: v.string(),
    base64: v.string(),
  },
  handler: async (_ctx, { name, contentType, base64 }) => {
    const buf = Buffer.from(base64, 'base64')
    if (buf.length === 0) throw new Error('Empty upload')
    if (buf.length > 10 * 1024 * 1024) throw new Error('Image exceeds 10 MB')
    const safeName = name.replace(/[^\w.\-]/g, '_').slice(0, 80)
    const key = `uploads/${nanoid()}-${safeName}`
    const url = await uploadToR2(buf, key, contentType)
    return { url, key }
  },
})

/**
 * Admin upload — takes a base64 image + client-measured dimensions,
 * classifies the aspect ratio, uploads to R2, and returns everything
 * `templates.createTemplate` needs.
 */
export const uploadTemplateImage = action({
  args: {
    name: v.string(),
    contentType: v.string(),
    base64: v.string(),
    width: v.number(),
    height: v.number(),
  },
  handler: async (_ctx, { name, contentType, base64, width, height }) => {
    const buf = Buffer.from(base64, 'base64')
    if (buf.length === 0) throw new Error('Empty upload')
    if (buf.length > 20 * 1024 * 1024) throw new Error('Template exceeds 20 MB')

    const aspectRatio = classifyAspectRatio(width, height)
    if (aspectRatio === 'other') {
      throw new Error(
        `Unsupported aspect ratio ${width}x${height}. Use 1:1, 4:5, 9:16, or 16:9 (±5%).`,
      )
    }

    const safeName = name.replace(/[^\w.\-]/g, '_').slice(0, 80)
    const key = `templates/${nanoid()}-${safeName}`
    const url = await uploadToR2(buf, key, contentType)
    // POC: reuse the original URL as the thumbnail.  Upgrade to a proper
    // resize step later (sharp or a Cloudflare Image transform).
    return {
      imageUrl: url,
      thumbnailUrl: url,
      aspectRatio: aspectRatio as '1:1' | '4:5' | '9:16' | '16:9',
      width,
      height,
    }
  },
})

function classifyAspectRatio(
  width: number,
  height: number,
): '1:1' | '4:5' | '9:16' | '16:9' | 'other' {
  const ratio = width / height
  const candidates: Array<{ label: '1:1' | '4:5' | '9:16' | '16:9'; value: number }> = [
    { label: '1:1', value: 1 },
    { label: '4:5', value: 4 / 5 },
    { label: '9:16', value: 9 / 16 },
    { label: '16:9', value: 16 / 9 },
  ]
  // Snap to the closest candidate, accept if within 12% (real-world uploads
  // are often cropped slightly off the canonical ratio).
  let best: { label: (typeof candidates)[number]['label']; dist: number } | null = null
  for (const c of candidates) {
    const dist = Math.abs(ratio - c.value) / c.value
    if (best === null || dist < best.dist) best = { label: c.label, dist }
  }
  if (best && best.dist < 0.12) return best.label
  return 'other'
}
