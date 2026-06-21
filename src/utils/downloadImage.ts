/**
 * Client-side image download with on-the-fly format conversion.
 *
 * Generated ads are stored as PNG. Rather than re-render them server-side in
 * another format, we fetch the PNG once and re-encode it in the browser via
 * canvas at download time — so the user can grab the same creative as PNG,
 * JPG, or WebP without changing anything about how it's stored.
 */
import { fetchDownloadAsset } from './downloads'

export type DownloadFormat = 'png' | 'jpeg' | 'webp'

/** Menu options, in display order. `ext` is the saved-file extension. */
export const DOWNLOAD_FORMATS: { value: DownloadFormat; label: string; ext: string }[] = [
  { value: 'png', label: 'PNG', ext: 'png' },
  { value: 'jpeg', label: 'JPG', ext: 'jpg' },
  { value: 'webp', label: 'WebP', ext: 'webp' },
]

const MIME: Record<DownloadFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

const EXT: Record<DownloadFormat, string> = {
  png: 'png',
  jpeg: 'jpg',
  webp: 'webp',
}

function slugifyFilePart(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'image'
  )
}

/** True when the stored asset is already the format the user asked for. */
function sourceMatchesFormat(format: DownloadFormat, contentType?: string | null): boolean {
  const ct = contentType ?? ''
  if (format === 'png') return ct.includes('png') || ct === ''
  if (format === 'jpeg') return ct.includes('jpeg') || ct.includes('jpg')
  return ct.includes('webp')
}

/** Re-encode an image blob to `format` in the browser via canvas. */
async function reencode(srcBlob: Blob, format: DownloadFormat): Promise<Blob> {
  const bitmap = await createImageBitmap(srcBlob)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is not supported in this browser')
    // JPEG has no alpha channel — paint white first so transparent PNGs don't
    // export with a black background.
    if (format === 'jpeg') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    ctx.drawImage(bitmap, 0, 0)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Image encoding failed'))),
        MIME[format],
        format === 'png' ? undefined : 0.92,
      )
    })
  } finally {
    bitmap.close()
  }
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

/**
 * Download a generated image as `format` (default PNG). When the stored asset
 * already matches the requested format, it's downloaded as-is with no re-encode.
 */
export async function downloadGeneratedImage(
  url: string,
  fileBaseName: string,
  format: DownloadFormat = 'png',
): Promise<void> {
  const { base64, contentType } = await fetchDownloadAsset({ data: { url } })
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  const sourceBlob = new Blob([bytes], { type: contentType || 'image/png' })

  const blob = sourceMatchesFormat(format, contentType)
    ? sourceBlob
    : await reencode(sourceBlob, format)

  triggerBlobDownload(blob, `${slugifyFilePart(fileBaseName)}.${EXT[format]}`)
}
