'use node'

/**
 * Server-side Ad Test "test set" export (issue #38).
 *
 * The browser must NOT build the zip (CORS + memory limits on R2 fetches), so
 * this authenticated Convex action does it server-side:
 *   1. prepareExportInternal — verify ownership + ENTITLEMENT (paid only), and
 *      resolve each creative's paired copy. Free users are denied here, before
 *      any asset work.
 *   2. fetch each completed creative from R2.
 *   3. build manifest.csv (one row per creative) + copy_bank.csv (all copy).
 *   4. zip everything (fflate), upload the zip to R2, mark the test exported.
 *   5. return a single downloadable URL.
 *
 * Source of truth: docs/specs/ad-test-ux-overhaul.md (Export Contract).
 */
import { v } from 'convex/values'
import { zipSync, strToU8 } from 'fflate'
import { nanoid } from 'nanoid'
import { action } from './_generated/server'
import { api, internal } from './_generated/api'
import { uploadToR2 } from './r2'
import {
  buildCopyBankCsv,
  buildManifestCsv,
  type ExportPackage,
} from './lib/adTestExportCsv'

export const exportTestSet = action({
  args: { adTestId: v.id('adTests') },
  handler: async (
    ctx,
    { adTestId },
  ): Promise<{ url: string; filename: string; imageCount: number }> => {
    // Ownership + entitlement gate + resolved copy. Throws for free/non-owner.
    const pkg = await ctx.runQuery(internal.adTests.prepareExportInternal, {
      adTestId,
    })

    if (pkg.items.length === 0 && pkg.copySets.length === 0) {
      throw new Error('Nothing to export yet — generate creatives or copy first.')
    }

    // Fetch each completed creative. A single failed asset is skipped (and
    // logged) rather than failing the whole export — the manifest still lists
    // every row, and a partial zip beats no zip.
    const files: Record<string, Uint8Array> = {}
    let imageCount = 0
    for (const item of pkg.items) {
      try {
        const res = await fetch(item.outputUrl)
        if (!res.ok) {
          console.warn(`[exportTestSet] asset ${res.status} for ${item.filename}`)
          continue
        }
        files[`images/${item.filename}`] = new Uint8Array(await res.arrayBuffer())
        imageCount++
      } catch (err) {
        console.error(`[exportTestSet] fetch failed for ${item.filename}`, err)
      }
    }

    // CSVs are built from the package; pass only the ExportItem fields the
    // builder reads (outputUrl is extra and ignored).
    const csvPackage: ExportPackage = {
      testName: pkg.testName,
      productName: pkg.productName,
      items: pkg.items,
      copySets: pkg.copySets,
    }
    files['manifest.csv'] = strToU8(buildManifestCsv(csvPackage))
    files['copy_bank.csv'] = strToU8(buildCopyBankCsv(csvPackage))

    const zipped = zipSync(files, { level: 6 })

    const key = `exports/${adTestId}/${pkg.testSlug}-${nanoid(6)}.zip`
    const url = await uploadToR2(
      Buffer.from(zipped.buffer, zipped.byteOffset, zipped.byteLength),
      key,
      'application/zip',
    )

    // Stamp exported lifecycle only after the zip is durably uploaded.
    await ctx.runMutation(api.adTests.markExported, { adTestId })

    return { url, filename: `${pkg.productSlug}_${pkg.testSlug}.zip`, imageCount }
  },
})
