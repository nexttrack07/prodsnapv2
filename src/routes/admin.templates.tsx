import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useAction } from 'convex/react'
import { useConvexMutation, convexQuery } from '@convex-dev/react-query'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

export const Route = createFileRoute('/admin/templates')({
  component: AdminTemplatesPage,
})

interface TemplateRow {
  _id: Id<'adTemplates'>
  _creationTime: number
  imageUrl: string
  thumbnailUrl: string
  aspectRatio: string
  width: number
  height: number
  status: 'pending' | 'ingesting' | 'published' | 'failed'
  category?: string
  subcategory?: string
  sceneTypes?: string[]
  moods?: string[]
  ingestError?: string
}

function AdminTemplatesPage() {
  const { data: templates } = useQuery(
    convexQuery(api.templates.listAll, {}),
  ) as { data: TemplateRow[] | undefined }

  const rows = templates ?? []
  const counts = {
    total: rows.length,
    published: rows.filter((r) => r.status === 'published').length,
    pending: rows.filter((r) => r.status === 'pending' || r.status === 'ingesting').length,
    failed: rows.filter((r) => r.status === 'failed').length,
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Link to="/admin" className="hover:text-slate-700">Admin</Link>
            <span>/</span>
            <span>Templates</span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Templates</h1>
          <p className="mt-1 text-slate-500">
            Upload ad templates. The system auto-computes a CLIP embedding and visual tags for each.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <StatPill label="Total" value={counts.total} />
          <StatPill label="Published" value={counts.published} tone="emerald" />
          <StatPill label="Ingesting" value={counts.pending} tone="blue" />
          <StatPill label="Failed" value={counts.failed} tone="red" />
        </div>
      </div>

      <UploadArea />

      <TemplatesTable rows={rows} />
    </div>
  )
}

// ─── Upload ───────────────────────────────────────────────────────────────
function UploadArea() {
  const uploadTemplate = useAction(api.r2.uploadTemplateImage)
  const createTemplate = useConvexMutation(api.templates.createTemplate)
  const [inFlight, setInFlight] = useState(0)
  const [dragging, setDragging] = useState(false)

  async function handleFiles(files: FileList | File[] | null) {
    if (!files) return
    const list = Array.from(files)
    if (list.length === 0) return

    setInFlight((n) => n + list.length)
    let ok = 0
    let failed = 0

    await Promise.all(
      list.map(async (file) => {
        try {
          if (!file.type.startsWith('image/')) throw new Error('Not an image')
          if (file.size > 20 * 1024 * 1024) throw new Error('Over 20 MB')
          const { width, height } = await measureImage(file)
          const base64 = await fileToBase64(file)
          const upload = await uploadTemplate({
            name: file.name,
            contentType: file.type,
            base64,
            width,
            height,
          })
          await createTemplate({
            imageUrl: upload.imageUrl,
            thumbnailUrl: upload.thumbnailUrl,
            aspectRatio: upload.aspectRatio,
            width: upload.width,
            height: upload.height,
          })
          ok++
        } catch (err) {
          failed++
          toast.error(
            `${file.name}: ${err instanceof Error ? err.message : 'Upload failed'}`,
          )
        } finally {
          setInFlight((n) => n - 1)
        }
      }),
    )

    if (ok > 0) toast.success(`Uploaded ${ok} file${ok === 1 ? '' : 's'}`)
    if (failed === 0 && ok === 0) toast.error('No files uploaded')
  }

  return (
    <div>
      <label
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          handleFiles(e.dataTransfer.files)
        }}
        className={`block cursor-pointer rounded-2xl border-2 border-dashed transition p-10 text-center ${
          dragging
            ? 'border-blue-500 bg-blue-50/60'
            : 'border-slate-300 bg-white hover:border-slate-400'
        }`}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.currentTarget.files)}
        />
        <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center mb-3">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-500">
            <path d="M12 15V3m0 0l-4 4m4-4l4 4M3 15v4a2 2 0 002 2h14a2 2 0 002-2v-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="font-semibold text-slate-800">
          {inFlight > 0
            ? `Uploading ${inFlight} file${inFlight === 1 ? '' : 's'}…`
            : (
                <>
                  Drop ad templates or <span className="text-blue-600">browse</span>
                </>
              )}
        </div>
        <div className="mt-1 text-sm text-slate-500">
          Multiple images OK. 1:1, 4:5, 9:16, or 16:9 (±5%). Up to 20 MB each.
        </div>
      </label>
    </div>
  )
}

function measureImage(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
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

// ─── Templates table ──────────────────────────────────────────────────────
function TemplatesTable({ rows }: { rows: TemplateRow[] }) {
  const retryMutation = useMutation({ mutationFn: useConvexMutation(api.templates.retryTemplateIngest) })
  const deleteMutation = useMutation({ mutationFn: useConvexMutation(api.templates.deleteTemplate) })

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center text-slate-500">
        No templates yet. Drop some images above to seed the library.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">Library</h2>
      <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 [column-fill:_balance]">
        {rows
          .slice()
          .sort((a, b) => b._creationTime - a._creationTime)
          .map((t) => (
            <div
              key={t._id}
              className="mb-4 break-inside-avoid rounded-2xl border border-slate-200 bg-white overflow-hidden"
            >
              <div
                className="relative bg-slate-50"
                style={{ aspectRatio: aspectRatioCss(t.aspectRatio) }}
              >
                <img src={t.thumbnailUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                <StatusBadge status={t.status} />
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  {t.category && (
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                      {t.category}
                    </span>
                  )}
                  {t.subcategory && (
                    <span className="text-[10px] tracking-wider text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                      {t.subcategory}
                    </span>
                  )}
                  <span className="text-[10px] tracking-wider text-slate-500">
                    {t.aspectRatio} · {t.width}×{t.height}
                  </span>
                </div>
                {(t.sceneTypes?.length || t.moods?.length) && (
                  <div className="flex flex-wrap gap-1">
                    {t.sceneTypes?.map((s) => (
                      <span key={`s-${s}`} className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                        {s}
                      </span>
                    ))}
                    {t.moods?.map((m) => (
                      <span key={`m-${m}`} className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">
                        {m}
                      </span>
                    ))}
                  </div>
                )}
                {t.status === 'failed' && t.ingestError && (
                  <div className="text-xs text-red-700 line-clamp-2">{t.ingestError}</div>
                )}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => retryMutation.mutate({ id: t._id })}
                    disabled={retryMutation.isPending}
                    className="text-xs px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 transition disabled:opacity-50"
                  >
                    Re-tag
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('Delete this template?')) deleteMutation.mutate({ id: t._id })
                    }}
                    disabled={deleteMutation.isPending}
                    className="text-xs px-2.5 py-1 rounded-md bg-red-50 text-red-700 hover:bg-red-100 transition disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: TemplateRow['status'] }) {
  const styles: Record<TemplateRow['status'], string> = {
    pending: 'bg-amber-100 text-amber-800',
    ingesting: 'bg-blue-100 text-blue-800',
    published: 'bg-emerald-100 text-emerald-800',
    failed: 'bg-red-100 text-red-800',
  }
  const label: Record<TemplateRow['status'], string> = {
    pending: 'Pending',
    ingesting: 'Ingesting',
    published: 'Published',
    failed: 'Failed',
  }
  return (
    <span
      className={`absolute top-2 right-2 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${styles[status]}`}
    >
      {label[status]}
    </span>
  )
}

function StatPill({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'emerald' | 'blue' | 'red'
}) {
  const cls = tone === 'emerald'
    ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
    : tone === 'blue'
      ? 'bg-blue-50 text-blue-800 ring-blue-200'
      : tone === 'red'
        ? 'bg-red-50 text-red-800 ring-red-200'
        : 'bg-slate-50 text-slate-700 ring-slate-200'
  return (
    <span className={`inline-flex items-center gap-1.5 ring-1 rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>
      <span className="text-slate-500">{label}</span>
      <span className="font-bold">{value}</span>
    </span>
  )
}

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      className="inline-block rounded-full border-2 border-slate-200 border-t-slate-600 animate-spin"
      style={{ width: size, height: size }}
    />
  )
}

function aspectRatioCss(ar: string) {
  switch (ar) {
    case '1:1': return '1 / 1'
    case '4:5': return '4 / 5'
    case '9:16': return '9 / 16'
    case '16:9': return '16 / 9'
    default: return '1 / 1'
  }
}
