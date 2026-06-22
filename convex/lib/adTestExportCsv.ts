/**
 * Pure CSV builders for Ad Test "test set" export (issue #38).
 *
 * Kept free of Convex/node imports so the row/escaping logic is unit-testable
 * in isolation. The export action assembles an ExportPackage from the DB and
 * passes it here to produce `manifest.csv` and `copy_bank.csv`.
 *
 * Column contracts come from docs/specs/ad-test-ux-overhaul.md (Export
 * Contract). `manifest.csv` is one row per exported creative (with its paired
 * copy, if any); `copy_bank.csv` is one row per generated copy suggestion.
 */

/** One exported creative row, with copy resolved from its paired set (if any). */
export type ExportItem = {
  generationId: string
  angle: string | null
  placement: string | null
  aspectRatio: string | null
  filename: string
  primaryText: string | null
  headline: string | null
  description: string | null
  ctaButton: string | null
}

/** One generated copy suggestion, flattened for copy_bank.csv. */
export type ExportSuggestion = { variantIndex: number; text: string }

/** A test-level Copy Bank set, as exported. */
export type ExportCopySet = {
  copySetId: string
  angleKey: string | null
  recommendedCtaButton: string | null
  headlines: ExportSuggestion[]
  primaryTexts: ExportSuggestion[]
  descriptions: ExportSuggestion[]
}

export type ExportPackage = {
  testName: string
  productName: string | null
  items: ExportItem[]
  copySets: ExportCopySet[]
}

export const MANIFEST_COLUMNS = [
  'test_name',
  'product_name',
  'angle',
  'placement',
  'aspect_ratio',
  'filename',
  'primary_text',
  'headline',
  'description',
  'cta_button',
  'generation_id',
] as const

export const COPY_BANK_COLUMNS = [
  'copy_set_id',
  'field',
  'variant_index',
  'text',
  'angle_key',
  'recommended_cta_button',
] as const

/**
 * Escapes one CSV cell per RFC 4180: wrap in double quotes and double any
 * embedded quote when the value contains a quote, comma, or newline. null /
 * undefined become an empty cell. A leading =/+/-/@ is prefixed with a single
 * quote to defang spreadsheet formula injection.
 */
export function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  let str = String(value)
  if (/^[=+\-@]/.test(str)) str = `'${str}`
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function csvRow(cells: Array<string | number | null | undefined>): string {
  return cells.map(escapeCsvCell).join(',')
}

/** `manifest.csv`: header + one row per exported creative. */
export function buildManifestCsv(pkg: ExportPackage): string {
  const lines = [csvRow([...MANIFEST_COLUMNS])]
  for (const item of pkg.items) {
    lines.push(
      csvRow([
        pkg.testName,
        pkg.productName,
        item.angle,
        item.placement,
        item.aspectRatio,
        item.filename,
        item.primaryText,
        item.headline,
        item.description,
        item.ctaButton,
        item.generationId,
      ]),
    )
  }
  // Trailing newline so the file ends cleanly (POSIX text-file convention).
  return `${lines.join('\r\n')}\r\n`
}

/** `copy_bank.csv`: header + one row per generated copy suggestion. */
export function buildCopyBankCsv(pkg: ExportPackage): string {
  const lines = [csvRow([...COPY_BANK_COLUMNS])]
  for (const set of pkg.copySets) {
    const fields: Array<[string, ExportSuggestion[]]> = [
      ['headline', set.headlines],
      ['primary_text', set.primaryTexts],
      ['description', set.descriptions],
    ]
    for (const [field, suggestions] of fields) {
      for (const s of suggestions) {
        lines.push(
          csvRow([
            set.copySetId,
            field,
            s.variantIndex,
            s.text,
            set.angleKey,
            set.recommendedCtaButton,
          ]),
        )
      }
    }
  }
  return `${lines.join('\r\n')}\r\n`
}
