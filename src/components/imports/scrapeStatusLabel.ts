/**
 * Friendly, user-facing copy for an in-flight URL import.
 *
 * The backend emits terse, technical progress steps ("Fetching the page",
 * "Distilling product details", "Uploading 5 images") that read as internal
 * jargon when surfaced in the UI. This maps the import's `status` enum to
 * warmer phrasing so the background toast (ScrapeProgressWatcher) and the
 * inline onboarding waiting screen stay consistent and human.
 */
export function scrapeStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
    case 'scraping':
      return 'Reading your product page…'
    case 'extracting':
      return 'Finding your best photos…'
    case 'uploading':
      return 'Getting your photos ready…'
    default:
      return 'Almost there…'
  }
}
