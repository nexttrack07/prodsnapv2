/**
 * Client helper for Ad Test "test set" export (issue #38).
 *
 * The zip is built and stored server-side by the `adTestExport.exportTestSet`
 * Convex action, which returns a single R2 URL. This helper only pulls that
 * finished zip to the browser — it never fetches R2 assets or builds a zip
 * client-side (that's the server's job, to avoid CORS + memory limits).
 *
 * It reuses `fetchDownloadAsset` (the same trusted server fn single-image
 * download uses) so the cross-origin fetch happens server-side.
 */
import { fetchDownloadAsset } from './downloads'

function triggerBlobDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

/** Pulls the server-built zip at `url` and saves it to the browser as `filename`. */
export async function downloadZipFromUrl(
  url: string,
  filename: string,
): Promise<void> {
  const { base64 } = await fetchDownloadAsset({ data: { url } })
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  const blob = new Blob([bytes], { type: 'application/zip' })
  triggerBlobDownload(blob, filename)
}
