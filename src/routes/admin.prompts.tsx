import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useAction } from 'convex/react'
import { useConvexMutation, convexQuery } from '@convex-dev/react-query'
import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { api } from '../../convex/_generated/api'

export const Route = createFileRoute('/admin/prompts')({
  component: AdminPromptsPage,
})

function AdminPromptsPage() {
  const { data: cfg } = useQuery(convexQuery(api.prompts.getPromptConfig, {}))
  const saveMutation = useMutation({ mutationFn: useConvexMutation(api.prompts.updatePromptConfig) })
  const resetMutation = useMutation({ mutationFn: useConvexMutation(api.prompts.resetPromptConfig) })

  const [coreInstructions, setCoreInstructions] = useState('')
  const [exactPrompt, setExactPrompt] = useState('')
  const [remixPrompt, setRemixPrompt] = useState('')
  const [colorAdaptSuffix, setColorAdaptSuffix] = useState('')
  const lastSyncedRef = useRef<{ core: string; e: string; r: string; c: string }>({
    core: '',
    e: '',
    r: '',
    c: '',
  })

  useEffect(() => {
    if (!cfg) return
    if (cfg.coreInstructions !== lastSyncedRef.current.core) {
      lastSyncedRef.current.core = cfg.coreInstructions
      setCoreInstructions(cfg.coreInstructions)
    }
    if (cfg.exactPrompt !== lastSyncedRef.current.e) {
      lastSyncedRef.current.e = cfg.exactPrompt
      setExactPrompt(cfg.exactPrompt)
    }
    if (cfg.remixPrompt !== lastSyncedRef.current.r) {
      lastSyncedRef.current.r = cfg.remixPrompt
      setRemixPrompt(cfg.remixPrompt)
    }
    if (cfg.colorAdaptSuffix !== lastSyncedRef.current.c) {
      lastSyncedRef.current.c = cfg.colorAdaptSuffix
      setColorAdaptSuffix(cfg.colorAdaptSuffix)
    }
  }, [cfg])

  const dirty =
    cfg !== undefined &&
    (coreInstructions !== cfg.coreInstructions ||
      exactPrompt !== cfg.exactPrompt ||
      remixPrompt !== cfg.remixPrompt ||
      colorAdaptSuffix !== cfg.colorAdaptSuffix)

  async function handleSave() {
    try {
      await saveMutation.mutateAsync({
        coreInstructions,
        exactPrompt,
        remixPrompt,
        colorAdaptSuffix,
      })
      toast.success('Composer settings saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    }
  }

  async function handleReset() {
    if (!confirm('Reset composer settings to defaults?')) return
    try {
      await resetMutation.mutateAsync({})
      toast.success('Reset to defaults')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reset failed')
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Link to="/admin" className="hover:text-slate-700">Admin</Link>
          <span>/</span>
          <span>Prompt composer</span>
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
          Prompt composer settings
        </h1>
        <p className="mt-1 text-slate-500">
          The composer LLM crafts a fresh prompt for every (product × template) pair using these
          instructions. Tweak these to change how aggressive the text / icon rewrite is, or how
          faithful the scene reproduction should be.
        </p>
        <div className="mt-3 rounded-lg bg-amber-50/70 border border-amber-200 px-3 py-2 text-xs text-amber-900">
          The composer sees both images plus the user's product analysis. Reference the template
          as <em>"the first image"</em> and the product as <em>"the second image"</em>.
        </div>
      </div>

      <PromptField
        label="Core instructions"
        description="Always applied. Defines what the composer LLM is for and what constraints always hold."
        value={coreInstructions}
        onChange={setCoreInstructions}
        rows={10}
      />

      <PromptField
        label="Exact-mode addendum"
        description="Appended when the user selects Exact mode. Keep it short — just the mode-specific hint."
        value={exactPrompt}
        onChange={setExactPrompt}
        rows={3}
      />

      <PromptField
        label="Remix-mode addendum"
        description="Appended when the user selects Remix mode."
        value={remixPrompt}
        onChange={setRemixPrompt}
        rows={3}
      />

      <PromptField
        label="Color-adapt addendum"
        description="Appended when the user enables Adapt Palette."
        value={colorAdaptSuffix}
        onChange={setColorAdaptSuffix}
        rows={3}
      />

      <div className="flex items-center justify-between pt-4 border-t border-slate-100">
        <button
          type="button"
          onClick={handleReset}
          disabled={resetMutation.isPending}
          className="text-sm font-medium text-slate-500 hover:text-slate-800 transition disabled:opacity-50"
        >
          Reset to defaults
        </button>
        <div className="flex items-center gap-3">
          {cfg?.updatedAt ? (
            <span className="text-xs text-slate-400">
              Last saved {new Date(cfg.updatedAt).toLocaleString()}
            </span>
          ) : (
            <span className="text-xs text-slate-400">Using built-in defaults</span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saveMutation.isPending}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saveMutation.isPending && <Spinner size={14} light />}
            Save settings
          </button>
        </div>
      </div>
    </div>
  )
}

function PromptField({
  label,
  description,
  value,
  onChange,
  rows,
}: {
  label: string
  description: string
  value: string
  onChange: (v: string) => void
  rows: number
}) {
  const enhance = useAction(api.ai.enhancePrompt)
  const [enhanceOpen, setEnhanceOpen] = useState(false)
  const [instructions, setInstructions] = useState('')
  const [enhancing, setEnhancing] = useState(false)
  const [previous, setPrevious] = useState<string | null>(null)

  async function handleEnhance() {
    const trimmed = instructions.trim()
    if (!trimmed) {
      toast.error('Describe what to change')
      return
    }
    setEnhancing(true)
    try {
      const { enhanced } = await enhance({ original: value, instructions: trimmed })
      setPrevious(value)
      onChange(enhanced)
      toast.success('Prompt updated — review and save')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI enhance failed')
    } finally {
      setEnhancing(false)
    }
  }

  function handleUndo() {
    if (previous === null) return
    onChange(previous)
    setPrevious(null)
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <div className="flex items-center gap-2">
          <label className="text-sm font-semibold text-slate-900">{label}</label>
          <button
            type="button"
            onClick={() => setEnhanceOpen((v) => !v)}
            aria-expanded={enhanceOpen}
            aria-label="Enhance with AI"
            className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full transition ${
              enhanceOpen
                ? 'bg-indigo-100 text-indigo-800'
                : 'bg-gradient-to-br from-blue-50 to-indigo-100 text-indigo-700 hover:from-blue-100 hover:to-indigo-200'
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l1.9 5.7 5.7 1.9-5.7 1.9L12 17.2l-1.9-5.7-5.7-1.9 5.7-1.9L12 2zm6 12l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3zM5 14l.7 2.3 2.3.7-2.3.7L5 20l-.7-2.3L2 17l2.3-.7L5 14z" />
            </svg>
            Enhance with AI
          </button>
          {previous !== null && !enhancing && (
            <button
              type="button"
              onClick={handleUndo}
              className="text-[11px] font-medium text-slate-500 hover:text-slate-800 transition"
            >
              Undo
            </button>
          )}
        </div>
        <span className="text-xs text-slate-400">{value.length} chars</span>
      </div>
      <p className="text-xs text-slate-500 mb-2">{description}</p>
      <textarea
        value={value}
        onChange={(e) => {
          onChange(e.currentTarget.value)
          if (previous !== null) setPrevious(null)
        }}
        rows={rows}
        className="w-full rounded-lg border border-slate-200 p-3 text-sm text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-400 transition resize-y"
      />

      {enhanceOpen && (
        <div className="mt-2 rounded-lg border border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-blue-50/50 p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-indigo-900">Enhance with AI</div>
              <div className="text-[11px] text-indigo-700/80">
                Describe what to change — e.g. "make it more specific about lighting" or "add an instruction to preserve the logo".
              </div>
            </div>
            <button
              type="button"
              onClick={() => setEnhanceOpen(false)}
              className="text-indigo-400 hover:text-indigo-700"
              aria-label="Close"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.currentTarget.value)}
            placeholder="What would you like to change?"
            rows={2}
            disabled={enhancing}
            className="w-full rounded-lg border border-indigo-200 bg-white p-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition disabled:opacity-60 resize-y"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                handleEnhance()
              }
            }}
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-indigo-600">⌘/Ctrl+Enter to submit</span>
            <button
              type="button"
              onClick={handleEnhance}
              disabled={enhancing || !instructions.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 transition disabled:opacity-50"
            >
              {enhancing && (
                <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              )}
              {enhancing ? 'Rewriting…' : 'Rewrite prompt'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Spinner({ size = 14, light }: { size?: number; light?: boolean }) {
  return (
    <span
      className={`inline-block rounded-full animate-spin border-2 ${
        light ? 'border-white/40 border-t-white' : 'border-slate-200 border-t-slate-600'
      }`}
      style={{ width: size, height: size }}
    />
  )
}
