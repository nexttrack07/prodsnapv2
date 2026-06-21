/**
 * Shared client-side flow for uploading a user's own image as a custom
 * template. Used by both the /templates "My Templates" tab and the studio
 * generate wizard's "upload your own" tile.
 *
 * Mirrors the admin template uploader: measure dimensions (EXIF-aware),
 * generate a small webp thumbnail in-browser, then call the auth-gated
 * `r2.uploadCustomTemplateImage` action followed by
 * `customTemplates.createCustomTemplate`. The new row is private by default.
 */
import { useCallback, useState } from 'react'
import { useAction, useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { MAX_TEMPLATE_IMAGE_SIZE } from './constants'

const THUMBNAIL_MAX_EDGE = 512

async function measureImage(file: File): Promise<{ width: number; height: number }> {
  // createImageBitmap with imageOrientation: 'from-image' honors EXIF rotation
  // so phone-camera JPEGs report post-rotation dimensions.
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      const result = { width: bitmap.width, height: bitmap.height }
      bitmap.close()
      return result
    } catch {
      // Fall through to the legacy <img> path on browser quirks.
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read image dimensions'))
    }
    img.src = url
  })
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '')
    reader.onerror = reject
  })
}

/**
 * Max-512px-edge webp thumbnail via canvas. Returns null when the source is
 * already small enough or generation fails — the caller then reuses the full
 * image as the thumbnail.
 */
async function generateThumbnail(
  file: File,
  width: number,
  height: number,
): Promise<{ base64: string; contentType: string } | null> {
  const scale = Math.min(1, THUMBNAIL_MAX_EDGE / Math.max(width, height))
  if (scale === 1) return null
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))

  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new window.Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('Image decode failed'))
      i.src = url
    })

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, w, h)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.82),
    )
    if (!blob) return null

    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '')
      reader.onerror = () => reject(new Error('Thumbnail read failed'))
      reader.readAsDataURL(blob)
    })
    return { base64, contentType: blob.type || 'image/webp' }
  } catch (err) {
    console.warn('Thumbnail generation skipped:', err)
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Hook exposing a single `uploadCustomTemplate(file, name)` that runs the full
 * upload→create flow and returns the new template id. `isUploading` reflects an
 * in-flight upload for button/spinner state.
 */
export function useCustomTemplateUpload() {
  const uploadAction = useAction(api.r2.uploadCustomTemplateImage)
  const createCustomTemplate = useMutation(api.customTemplates.createCustomTemplate)
  const [isUploading, setIsUploading] = useState(false)

  const uploadCustomTemplate = useCallback(
    async (file: File, name: string): Promise<Id<'adTemplates'>> => {
      if (file.size > MAX_TEMPLATE_IMAGE_SIZE) {
        throw new Error('Image must be under 20 MB')
      }
      setIsUploading(true)
      try {
        const { width, height } = await measureImage(file)
        const base64 = await fileToBase64(file)
        const thumb = await generateThumbnail(file, width, height)
        const upload = await uploadAction({
          name: file.name,
          contentType: file.type || 'image/png',
          base64,
          width,
          height,
          ...(thumb
            ? { thumbnailBase64: thumb.base64, thumbnailContentType: thumb.contentType }
            : {}),
        })
        const fallbackName = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ')
        const id = await createCustomTemplate({
          name: name.trim() || fallbackName,
          imageUrl: upload.imageUrl,
          thumbnailUrl: upload.thumbnailUrl,
          imageStorageKey: upload.imageStorageKey,
          thumbnailStorageKey: upload.thumbnailStorageKey,
          aspectRatio: upload.aspectRatio,
          width: upload.width,
          height: upload.height,
        })
        return id as Id<'adTemplates'>
      } finally {
        setIsUploading(false)
      }
    },
    [uploadAction, createCustomTemplate],
  )

  return { uploadCustomTemplate, isUploading }
}
