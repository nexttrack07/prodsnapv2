'use node'

import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { nanoid } from 'nanoid'
import { v } from 'convex/values'
import { action, internalAction } from './_generated/server'

// ─── Security: Allowed image MIME types ──────────────────────────────────────
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

// Magic bytes signatures for image file types
const MAGIC_BYTES: Record<string, number[][]> = {
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  'image/gif': [
    [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], // GIF87a
    [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], // GIF89a
  ],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]], // RIFF (WebP starts with RIFF)
}

/**
 * Validates that the content-type is in the allowed list.
 * Throws if not allowed.
 */
function validateContentType(contentType: string): void {
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new Error(
      `Invalid file type: ${contentType}. Allowed types: ${[...ALLOWED_IMAGE_TYPES].join(', ')}`
    )
  }
}

/**
 * Validates that the file's magic bytes match the claimed content-type.
 * This prevents content-type spoofing attacks.
 */
function validateMagicBytes(buffer: Buffer, contentType: string): void {
  const signatures = MAGIC_BYTES[contentType]
  if (!signatures) {
    // If we don't have magic bytes for this type, skip validation
    // (content-type already validated by validateContentType)
    return
  }

  const matches = signatures.some((signature) => {
    if (buffer.length < signature.length) return false
    return signature.every((byte, i) => buffer[i] === byte)
  })

  if (!matches) {
    throw new Error(
      `File content does not match claimed type ${contentType}. Upload rejected.`
    )
  }
}

// ─── R2 Client Setup ─────────────────────────────────────────────────────────

// Lazy-initialized S3 client (env vars not available at module load time in Convex)
let s3Client: S3Client | null = null

function getR2Client(): S3Client {
  if (s3Client) return s3Client

  const endpoint = process.env.R2_ENDPOINT
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'Missing R2 configuration. Required: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY'
    )
  }

  s3Client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  })
  return s3Client
}

export async function uploadToR2(
  buffer: Buffer,
  key: string,
  contentType: string,
): Promise<string> {
  const bucket = process.env.R2_BUCKET_NAME!
  const publicUrl = process.env.R2_PUBLIC_URL!
  await getR2Client().send(
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
 *
 * Security: Validates content-type against allowlist and verifies magic bytes.
 */
export const uploadProductImage = action({
  args: {
    name: v.string(),
    contentType: v.string(),
    base64: v.string(),
  },
  handler: async (_ctx, { name, contentType, base64 }) => {
    // Security: Validate content-type is an allowed image type
    validateContentType(contentType)

    const buf = Buffer.from(base64, 'base64')
    if (buf.length === 0) throw new Error('Empty upload')
    if (buf.length > 10 * 1024 * 1024) throw new Error('Image exceeds 10 MB')

    // Security: Verify magic bytes match claimed content-type
    validateMagicBytes(buf, contentType)

    const safeName = name.replace(/[^\w.\-]/g, '_').slice(0, 80)
    const key = `uploads/${nanoid()}-${safeName}`
    const url = await uploadToR2(buf, key, contentType)
    return { url, key }
  },
})

/**
 * Generates a presigned URL for direct client-side upload to R2.
 * The client can PUT directly to this URL without base64 encoding.
 *
 * Security: Validates content-type against allowlist before generating URL.
 * Note: Magic byte validation happens in confirmUpload after the file is uploaded.
 */
export const getUploadUrl = action({
  args: {
    name: v.string(),
    contentType: v.string(),
  },
  handler: async (_ctx, { name, contentType }) => {
    try {
      // Security: Validate content-type is an allowed image type
      validateContentType(contentType)

    const bucket = process.env.R2_BUCKET_NAME!
    const publicUrl = process.env.R2_PUBLIC_URL!

    const safeName = name.replace(/[^\w.\-]/g, '_').slice(0, 80)
    const key = `uploads/${nanoid()}-${safeName}`

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    })

    // Generate presigned URL valid for 5 minutes
    const uploadUrl = await getSignedUrl(getR2Client(), command, { expiresIn: 300 })

      return {
        uploadUrl,
        key,
        publicUrl: `${publicUrl}/${key}`,
      }
    } catch (error) {
      console.error('getUploadUrl error:', error)
      throw error
    }
  },
})

/**
 * Admin upload — takes a base64 image + client-measured dimensions,
 * classifies the aspect ratio, uploads to R2, and returns everything
 * `templates.createTemplate` needs.
 *
 * Security: Validates content-type against allowlist and verifies magic bytes.
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
    // Security: Validate content-type is an allowed image type
    validateContentType(contentType)

    const buf = Buffer.from(base64, 'base64')
    if (buf.length === 0) throw new Error('Empty upload')
    if (buf.length > 20 * 1024 * 1024) throw new Error('Template exceeds 20 MB')

    // Security: Verify magic bytes match claimed content-type
    validateMagicBytes(buf, contentType)

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

export async function deleteFromR2(key: string): Promise<void> {
  const bucket = process.env.R2_BUCKET_NAME!
  await getR2Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}

export const clearBrandLogoStorage = internalAction({
  args: { key: v.string() },
  handler: async (_ctx, { key }) => {
    try {
      await deleteFromR2(key)
    } catch (err) {
      // best-effort; log and continue
      console.warn(`clearBrandLogoStorage: failed to delete R2 key ${key}:`, err)
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
