/// <reference types="vite/client" />
/**
 * Tests for the pure CSV builders used by Ad Test export (issue #38):
 *   - escapeCsvCell: quoting, null handling, formula-injection defang
 *   - buildManifestCsv: header + one row per creative, paired copy included
 *   - buildCopyBankCsv: header + one row per generated suggestion
 */
import { expect, test } from 'vitest'
import {
  COPY_BANK_COLUMNS,
  MANIFEST_COLUMNS,
  type ExportPackage,
  buildCopyBankCsv,
  buildManifestCsv,
  escapeCsvCell,
} from './adTestExportCsv'

test('escapeCsvCell quotes special chars, blanks nullish, and defangs formulas', () => {
  expect(escapeCsvCell('plain')).toBe('plain')
  expect(escapeCsvCell(null)).toBe('')
  expect(escapeCsvCell(undefined)).toBe('')
  expect(escapeCsvCell(3)).toBe('3')
  // Comma / quote / newline force quoting; embedded quotes are doubled.
  expect(escapeCsvCell('a,b')).toBe('"a,b"')
  expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""')
  expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"')
  // Leading formula char is prefixed with a single quote (spreadsheet safety).
  expect(escapeCsvCell('=SUM(A1)')).toBe("'=SUM(A1)")
  expect(escapeCsvCell('-1+1')).toBe("'-1+1")
})

const pkg: ExportPackage = {
  testName: 'Benefit, Angles',
  productName: 'Hydration Mix',
  items: [
    {
      generationId: 'g1',
      angle: 'benefit',
      placement: 'feed_vertical',
      aspectRatio: '4:5',
      filename: 'hydration-mix_benefit-angles_benefit_feed-vertical_01.png',
      primaryText: 'Hydrate faster, recover sooner.',
      headline: 'Feel the difference',
      description: null,
      ctaButton: 'SHOP_NOW',
    },
    {
      generationId: 'g2',
      angle: 'social',
      placement: 'feed_square',
      aspectRatio: '1:1',
      filename: 'hydration-mix_benefit-angles_social_feed-square_02.png',
      primaryText: null,
      headline: null,
      description: null,
      ctaButton: null,
    },
  ],
  copySets: [
    {
      copySetId: 'cs1',
      angleKey: 'benefit',
      recommendedCtaButton: 'SHOP_NOW',
      headlines: [
        { variantIndex: 0, text: 'Feel the difference' },
        { variantIndex: 1, text: 'Hydration, upgraded' },
      ],
      primaryTexts: [{ variantIndex: 0, text: 'Hydrate faster, recover sooner.' }],
      descriptions: [],
    },
  ],
}

test('buildManifestCsv emits a header and one row per creative', () => {
  const csv = buildManifestCsv(pkg)
  const lines = csv.trimEnd().split('\r\n')

  expect(lines[0]).toBe(MANIFEST_COLUMNS.join(','))
  expect(lines).toHaveLength(3) // header + 2 items

  // Row 1: test name has a comma → quoted; paired copy populated.
  expect(lines[1]).toContain('"Benefit, Angles"')
  expect(lines[1]).toContain('Feel the difference')
  expect(lines[1]).toContain('SHOP_NOW')
  expect(lines[1]).toContain('g1')

  // Row 2: unpaired creative → primary_text/headline/description/cta_button are
  // all empty, so the row ends with the filename, four empty cells, then g2.
  // (Naive split(',') is unsafe here: test_name is quoted because of its comma.)
  expect(lines[2]).toContain(
    'hydration-mix_benefit-angles_social_feed-square_02.png',
  )
  expect(lines[2].endsWith('_feed-square_02.png,,,,,g2')).toBe(true)
})

test('buildCopyBankCsv emits one row per suggestion across all fields', () => {
  const csv = buildCopyBankCsv(pkg)
  const lines = csv.trimEnd().split('\r\n')

  expect(lines[0]).toBe(COPY_BANK_COLUMNS.join(','))
  // 2 headlines + 1 primary text + 0 descriptions = 3 rows.
  expect(lines).toHaveLength(4)
  expect(lines[1]).toContain('headline')
  expect(lines[1]).toContain('Feel the difference')
  expect(lines[3]).toContain('primary_text')
  expect(lines[3]).toContain('Hydrate faster, recover sooner.')
})

test('CSV builders end with a trailing newline', () => {
  expect(buildManifestCsv(pkg).endsWith('\r\n')).toBe(true)
  expect(buildCopyBankCsv(pkg).endsWith('\r\n')).toBe(true)
})
