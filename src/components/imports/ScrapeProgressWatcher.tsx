/**
 * App-wide URL-import progress toast. Mounted once at the root (inside
 * <Authenticated>), it subscribes to the user's latest in-flight import and
 * shows a single persistent notification with a spinner that follows them
 * across pages while the scrape runs in the background — then resolves itself
 * (success or "upload your own" fallback) the moment the import settles.
 */
import { useEffect, useRef } from 'react'
import { useQuery } from 'convex/react'
import { notifications } from '@mantine/notifications'
import { IconCheck, IconAlertTriangle } from '@tabler/icons-react'
import { api } from '../../../convex/_generated/api'
import { scrapeStatusLabel } from './scrapeStatusLabel'

const NID = 'url-import-progress'
const IN_PROGRESS = ['pending', 'scraping', 'extracting', 'uploading']

export function ScrapeProgressWatcher() {
  const active = useQuery(api.urlImports.getActiveImport, {})
  // Whether the loading toast is currently on screen — so we only fire the
  // success/fallback finale for an import we actually watched start.
  const shownRef = useRef(false)

  useEffect(() => {
    if (active === undefined) return // query still loading

    if (active && IN_PROGRESS.includes(active.status)) {
      const payload = {
        id: NID,
        loading: true,
        autoClose: false as const,
        withCloseButton: false,
        color: 'brand',
        title: 'Importing your product',
        message: scrapeStatusLabel(active.status),
      }
      if (shownRef.current) notifications.update(payload)
      else notifications.show(payload)
      shownRef.current = true
      return
    }

    // Settled (or fell out of the window) while we were watching → finalize.
    if (shownRef.current) {
      if (active?.status === 'done' && active.imageCount > 0) {
        notifications.update({
          id: NID,
          loading: false,
          color: 'teal',
          icon: <IconCheck size={16} />,
          title: 'Product photos ready',
          message: `Found ${active.imageCount} photo${active.imageCount === 1 ? '' : 's'} — pick your favorites.`,
          autoClose: 5000,
          withCloseButton: true,
        })
      } else {
        notifications.update({
          id: NID,
          loading: false,
          color: 'orange',
          icon: <IconAlertTriangle size={16} />,
          title: active?.status === 'failed' ? 'Couldn’t import that page' : 'No photos found',
          message: 'No problem — you can upload your own product photos instead.',
          autoClose: 7000,
          withCloseButton: true,
        })
      }
      shownRef.current = false
    }
  }, [active])

  return null
}
