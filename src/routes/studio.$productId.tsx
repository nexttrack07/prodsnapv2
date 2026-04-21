import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useInfiniteQuery } from '@tanstack/react-query'
import { useConvexMutation, convexQuery } from '@convex-dev/react-query'
import { useState, useRef, useCallback, useEffect } from 'react'
import toast from 'react-hot-toast'
import { useConvex } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

export const Route = createFileRoute('/studio/$productId')({
  component: ProductWorkspacePage,
})

type AspectRatio = '1:1' | '4:5' | '9:16'
type Mode = 'exact' | 'remix'
type View = 'gallery' | 'generate'

interface MatchedTemplate {
  _id: Id<'adTemplates'>
  _score: number
  imageUrl: string
  thumbnailUrl: string
  aspectRatio: string
  category?: string
  subcategory?: string
}

function ProductWorkspacePage() {
  const { productId } = Route.useParams()
  const [view, setView] = useState<View>('gallery')

  const { data: product, isLoading: productLoading } = useQuery(
    convexQuery(api.products.getProductWithStats, { productId: productId as Id<'products'> }),
  )

  const { data: generations } = useQuery(
    convexQuery(api.products.getProductGenerations, { productId: productId as Id<'products'> }),
  )

  if (productLoading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900" />
        </div>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="text-center py-20">
          <h2 className="text-xl font-medium text-slate-900 mb-2">Product not found</h2>
          <Link to="/studio" className="text-blue-600 hover:underline">
            Back to products
          </Link>
        </div>
      </div>
    )
  }

  const completedGenerations = generations?.filter((g) => g.status === 'complete') || []
  const pendingGenerations = generations?.filter((g) => g.status !== 'complete' && g.status !== 'failed') || []

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link to="/studio" className="text-sm text-slate-500 hover:text-blue-600 flex items-center gap-1">
          <ChevronLeftIcon />
          Back to products
        </Link>
      </div>

      {/* Product Header */}
      <ProductHeader product={product} />

      {/* View Toggle */}
      {view === 'gallery' ? (
        <GalleryView
          product={product}
          productId={productId as Id<'products'>}
          completedGenerations={completedGenerations}
          pendingGenerations={pendingGenerations}
          onGenerateMore={() => setView('generate')}
        />
      ) : (
        <GenerateWizard
          productId={productId as Id<'products'>}
          product={product}
          onBack={() => setView('gallery')}
          onComplete={() => setView('gallery')}
        />
      )}
    </div>
  )
}

function ProductHeader({
  product,
}: {
  product: {
    _id: Id<'products'>
    name: string
    imageUrl: string
    status: 'analyzing' | 'ready' | 'failed'
    category?: string
    productDescription?: string
    generationCount: number
  }
}) {
  const [isEditingName, setIsEditingName] = useState(false)
  const [editedName, setEditedName] = useState('')

  const updateProduct = useConvexMutation(api.products.updateProduct)
  const updateMutation = useMutation({ mutationFn: updateProduct })

  async function handleSaveName() {
    if (!editedName.trim()) return
    try {
      await updateMutation.mutateAsync({
        productId: product._id,
        name: editedName.trim(),
      })
      setIsEditingName(false)
      toast.success('Name updated')
    } catch {
      toast.error('Failed to update name')
    }
  }

  return (
    <div className="flex items-start gap-6 mb-8 pb-8 border-b border-slate-200">
      <div className="w-24 h-24 rounded-lg overflow-hidden bg-slate-100 flex-shrink-0 border border-slate-200">
        <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
      </div>
      <div className="flex-1 min-w-0">
        {isEditingName ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              className="text-2xl font-semibold border-b-2 border-blue-600 outline-none bg-transparent"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
            />
            <button onClick={handleSaveName} className="text-blue-600 hover:text-blue-800 text-sm">
              Save
            </button>
            <button onClick={() => setIsEditingName(false)} className="text-slate-400 hover:text-slate-600 text-sm">
              Cancel
            </button>
          </div>
        ) : (
          <h1
            className="text-2xl font-semibold text-slate-900 cursor-pointer hover:text-slate-700"
            onClick={() => {
              setEditedName(product.name)
              setIsEditingName(true)
            }}
            title="Click to edit"
          >
            {product.name}
          </h1>
        )}
        <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
          {product.category && <span>{product.category}</span>}
          <span>{product.generationCount} generations</span>
          <StatusBadge status={product.status} />
        </div>
        {product.productDescription && (
          <p className="mt-2 text-slate-600 text-sm line-clamp-2">{product.productDescription}</p>
        )}
      </div>
    </div>
  )
}

function GalleryView({
  product,
  productId,
  completedGenerations,
  pendingGenerations,
  onGenerateMore,
}: {
  product: { status: string; imageUrl: string }
  productId: Id<'products'>
  completedGenerations: Array<{
    _id: Id<'templateGenerations'>
    status: string
    outputUrl?: string
    currentStep?: string
    error?: string
    aspectRatio?: string
  }>
  pendingGenerations: Array<{
    _id: Id<'templateGenerations'>
    status: string
    outputUrl?: string
    currentStep?: string
    error?: string
    aspectRatio?: string
  }>
  onGenerateMore: () => void
}) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [variationTarget, setVariationTarget] = useState<{ _id: Id<'templateGenerations'>; outputUrl: string } | null>(null)
  const hasAny = completedGenerations.length > 0 || pendingGenerations.length > 0

  const deleteGeneration = useConvexMutation(api.products.deleteGeneration)
  const deleteMutation = useMutation({ mutationFn: deleteGeneration })

  async function handleDelete(id: Id<'templateGenerations'>) {
    if (!confirm('Delete this generation?')) return
    try {
      await deleteMutation.mutateAsync({ generationId: id })
      toast.success('Deleted')
    } catch {
      toast.error('Failed to delete')
    }
  }

  return (
    <div>
      {/* Action bar */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-medium text-slate-900">Generations</h2>
        <button
          onClick={onGenerateMore}
          disabled={product.status !== 'ready'}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Generate More
          <ArrowRightIcon />
        </button>
      </div>

      {/* Pending generations */}
      {pendingGenerations.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-medium text-slate-500 mb-3">In Progress</h3>
          <div className="columns-2 sm:columns-3 md:columns-4 [column-gap:1rem]">
            {pendingGenerations.map((gen) => (
              <GenerationCard
                key={gen._id}
                generation={gen}
                onExpand={setLightboxUrl}
                onDelete={handleDelete}
                onCreateVariations={setVariationTarget}
              />
            ))}
          </div>
        </div>
      )}

      {/* Completed generations or empty state */}
      {!hasAny ? (
        <div className="border-2 border-dashed border-slate-200 rounded-xl p-12 text-center">
          <p className="text-slate-500 mb-4">No generations yet. Click "Generate More" to create ad variations.</p>
          <button
            onClick={onGenerateMore}
            disabled={product.status !== 'ready'}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition disabled:opacity-50"
          >
            Generate Ads
            <ArrowRightIcon />
          </button>
        </div>
      ) : completedGenerations.length > 0 ? (
        <div className="columns-2 sm:columns-3 md:columns-4 [column-gap:1rem]">
          {completedGenerations.map((gen) => (
            <GenerationCard
              key={gen._id}
              generation={gen}
              onExpand={setLightboxUrl}
              onDelete={handleDelete}
              onCreateVariations={setVariationTarget}
            />
          ))}
        </div>
      ) : null}

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white"
            onClick={() => setLightboxUrl(null)}
          >
            <XIcon />
          </button>
          <img
            src={lightboxUrl}
            alt="Full size"
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <a
            href={lightboxUrl}
            download
            className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-white text-slate-900 rounded-lg font-medium hover:bg-slate-100 transition"
            onClick={(e) => e.stopPropagation()}
          >
            Download
          </a>
        </div>
      )}

      {/* Variation Panel */}
      {variationTarget && (
        <VariationPanel
          generation={variationTarget}
          productId={productId}
          productImageUrl={product.imageUrl}
          onClose={() => setVariationTarget(null)}
          onComplete={() => setVariationTarget(null)}
        />
      )}
    </div>
  )
}

function VariationPanel({
  generation,
  productId,
  productImageUrl,
  onClose,
  onComplete,
}: {
  generation: { _id: Id<'templateGenerations'>; outputUrl: string }
  productId: Id<'products'>
  productImageUrl: string
  onClose: () => void
  onComplete: () => void
}) {
  const [changeText, setChangeText] = useState(false)
  const [changeIcons, setChangeIcons] = useState(false)
  const [changeColors, setChangeColors] = useState(false)
  const [variationCount, setVariationCount] = useState(2)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const generateVariations = useConvexMutation(api.products.generateVariations)
  const generateMutation = useMutation({ mutationFn: generateVariations })

  const hasSelection = changeText || changeIcons || changeColors

  async function handleGenerate() {
    if (!hasSelection) {
      toast.error('Select at least one thing to change')
      return
    }
    setIsSubmitting(true)
    try {
      await generateMutation.mutateAsync({
        generationId: generation._id,
        productId,
        sourceImageUrl: generation.outputUrl,
        productImageUrl,
        changeText,
        changeIcons,
        changeColors,
        variationCount,
      })
      toast.success('Variations started!')
      onComplete()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-md bg-white h-full shadow-xl overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-slate-900">Create Variations</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <XIcon />
            </button>
          </div>

          {/* Source image preview */}
          <div className="mb-6">
            <p className="text-sm text-slate-500 mb-2">Source image</p>
            <img
              src={generation.outputUrl}
              alt="Source"
              className="w-full rounded-lg border border-slate-200"
            />
          </div>

          {/* What to change */}
          <div className="mb-6">
            <p className="text-sm font-medium text-slate-700 mb-3">What would you like to change?</p>
            <div className="space-y-3">
              <CheckboxCard
                checked={changeText}
                onChange={setChangeText}
                icon={<TextIcon />}
                title="Text"
                description="Generate new headlines, copy, and messaging"
              />
              <CheckboxCard
                checked={changeIcons}
                onChange={setChangeIcons}
                icon={<IconsIcon />}
                title="Icons & Graphics"
                description="Replace icons, badges, and decorative elements"
              />
              <CheckboxCard
                checked={changeColors}
                onChange={setChangeColors}
                icon={<PaletteIcon />}
                title="Colors"
                description="Adjust color scheme and tones"
              />
            </div>
          </div>

          {/* Variation count */}
          <div className="mb-8">
            <p className="text-sm font-medium text-slate-700 mb-3">Number of variations</p>
            <div className="flex gap-2">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  onClick={() => setVariationCount(n)}
                  className={`flex-1 py-2 rounded-lg border font-medium transition ${
                    variationCount === n
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={!hasSelection || isSubmitting}
            className="w-full py-3 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                Starting...
              </>
            ) : (
              <>
                <SparklesIcon />
                Generate {variationCount} Variation{variationCount > 1 ? 's' : ''}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

function CheckboxCard({
  checked,
  onChange,
  icon,
  title,
  description,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`w-full flex items-start gap-3 p-4 rounded-lg border-2 text-left transition ${
        checked
          ? 'border-slate-900 bg-slate-50'
          : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition ${
        checked ? 'border-slate-900 bg-slate-900' : 'border-slate-300'
      }`}>
        {checked && <CheckIcon className="w-3 h-3 text-white" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-slate-600">{icon}</span>
          <span className="font-medium text-slate-900">{title}</span>
        </div>
        <p className="text-sm text-slate-500 mt-0.5">{description}</p>
      </div>
    </button>
  )
}

function GenerationCard({
  generation,
  onExpand,
  onDelete,
  onCreateVariations,
}: {
  generation: {
    _id: Id<'templateGenerations'>
    status: string
    outputUrl?: string
    currentStep?: string
    error?: string
    aspectRatio?: string
  }
  onExpand: (url: string) => void
  onDelete: (id: Id<'templateGenerations'>) => void
  onCreateVariations: (generation: { _id: Id<'templateGenerations'>; outputUrl: string }) => void
}) {
  const isComplete = generation.status === 'complete' && generation.outputUrl
  const isFailed = generation.status === 'failed'
  const isPending = !isComplete && !isFailed

  // Get aspect ratio style for skeleton (only used when not complete)
  const getAspectRatioStyle = (): React.CSSProperties => {
    switch (generation.aspectRatio) {
      case '4:5':
        return { aspectRatio: '4/5' }
      case '9:16':
        return { aspectRatio: '9/16' }
      default:
        return { aspectRatio: '1/1' }
    }
  }

  return (
    <div className="group bg-white border border-slate-200 rounded-lg overflow-hidden break-inside-avoid mb-4">
      {/* Complete: let image display naturally */}
      {isComplete && generation.outputUrl && (
        <div className="relative">
          <img src={generation.outputUrl} alt="Generated ad" className="w-full h-auto block" />
          {/* Hover overlay with action icons */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
            <button
              onClick={() => onExpand(generation.outputUrl!)}
              className="w-9 h-9 rounded-full bg-white/90 hover:bg-white flex items-center justify-center text-slate-700 hover:text-slate-900 transition shadow-sm"
              title="View full size"
            >
              <ExpandIcon />
            </button>
            <button
              onClick={() => onCreateVariations({ _id: generation._id, outputUrl: generation.outputUrl! })}
              className="w-9 h-9 rounded-full bg-white/90 hover:bg-white flex items-center justify-center text-slate-700 hover:text-purple-600 transition shadow-sm"
              title="Create variations"
            >
              <SparklesIcon />
            </button>
            <a
              href={generation.outputUrl}
              download
              className="w-9 h-9 rounded-full bg-white/90 hover:bg-white flex items-center justify-center text-slate-700 hover:text-slate-900 transition shadow-sm"
              title="Download"
            >
              <DownloadIcon />
            </a>
            <button
              onClick={() => onDelete(generation._id)}
              className="w-9 h-9 rounded-full bg-white/90 hover:bg-white flex items-center justify-center text-slate-700 hover:text-red-600 transition shadow-sm"
              title="Delete"
            >
              <TrashIcon />
            </button>
          </div>
        </div>
      )}

      {/* Pending: skeleton with correct aspect ratio */}
      {isPending && (
        <div className="bg-slate-100 animate-pulse flex flex-col items-center justify-center" style={getAspectRatioStyle()}>
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-400 border-t-transparent mb-2" />
          <span className="text-xs text-slate-500">{generation.currentStep || 'Processing...'}</span>
        </div>
      )}

      {/* Failed: skeleton with correct aspect ratio */}
      {isFailed && (
        <div className="bg-red-50 flex flex-col items-center justify-center" style={getAspectRatioStyle()}>
          <span className="text-red-600 text-sm font-medium">Failed</span>
          {generation.error && (
            <span className="text-red-500 text-xs mt-1 px-2 text-center line-clamp-2">{generation.error}</span>
          )}
        </div>
      )}
    </div>
  )
}

function GenerateWizard({
  productId,
  product,
  onBack,
  onComplete,
}: {
  productId: Id<'products'>
  product: { imageUrl: string; name: string }
  onBack: () => void
  onComplete: () => void
}) {
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1')
  const [mode, setMode] = useState<Mode>('exact')
  const [colorAdapt, setColorAdapt] = useState(false)
  const [variationsPerTemplate, setVariationsPerTemplate] = useState(2)
  const [pickedIds, setPickedIds] = useState<Id<'adTemplates'>[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  const convex = useConvex()
  const generateFromProduct = useConvexMutation(api.products.generateFromProduct)
  const generateMutation = useMutation({ mutationFn: generateFromProduct })

  // Infinite scroll for templates
  const {
    data: templatesData,
    isLoading: templatesLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['listTemplates'],
    queryFn: async ({ pageParam }) => {
      return convex.query(api.products.listTemplates, {
        cursor: pageParam,
        limit: 24,
      })
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined as string | undefined,
  })

  const templates = templatesData?.pages.flatMap((page) => page.items) || []

  // Infinite scroll observer
  const observerRef = useRef<IntersectionObserver | null>(null)
  const loadMoreRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (isFetchingNextPage) return
      if (observerRef.current) observerRef.current.disconnect()
      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasNextPage) {
          fetchNextPage()
        }
      })
      if (node) observerRef.current.observe(node)
    },
    [isFetchingNextPage, hasNextPage, fetchNextPage],
  )

  function toggleTemplate(id: Id<'adTemplates'>) {
    setPickedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 3) {
        toast.error('Max 3 templates')
        return prev
      }
      return [...prev, id]
    })
  }

  async function handleGenerate() {
    if (pickedIds.length === 0) {
      toast.error('Pick at least one template')
      return
    }
    setIsSubmitting(true)
    try {
      await generateMutation.mutateAsync({
        productId,
        templateIds: pickedIds,
        mode,
        colorAdapt,
        variationsPerTemplate,
        aspectRatio,
      })
      toast.success('Generation started!')
      onComplete()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  const totalCount = pickedIds.length * variationsPerTemplate

  return (
    <div>
      {/* Wizard Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="text-slate-500 hover:text-slate-700 flex items-center gap-1"
          >
            <ChevronLeftIcon />
            Back to gallery
          </button>
          <span className="text-slate-300">|</span>
          <h2 className="text-lg font-medium text-slate-900">Pick Templates</h2>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-8">
        {/* Template Grid */}
        <div className="max-h-[70vh] overflow-y-auto pr-2">
          <p className="text-sm text-slate-500 mb-4">
            {templates.length} templates · Pick up to 3
          </p>

          {/* Templates */}
          {templatesLoading && templates.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-900 border-t-transparent" />
            </div>
          ) : templates.length === 0 ? (
            <p className="text-slate-500 text-center py-12">No templates available.</p>
          ) : (
            <>
              <div className="columns-3 sm:columns-4 [column-gap:0.75rem]">
                {templates.map((tpl) => {
                  const picked = pickedIds.includes(tpl._id)
                  // Get aspect ratio style
                  const getAspectStyle = (): React.CSSProperties => {
                    switch (tpl.aspectRatio) {
                      case '4:5': return { aspectRatio: '4/5' }
                      case '9:16': return { aspectRatio: '9/16' }
                      default: return { aspectRatio: '1/1' }
                    }
                  }
                  return (
                    <button
                      key={tpl._id}
                      onClick={() => toggleTemplate(tpl._id)}
                      className={`relative rounded-lg overflow-hidden border-2 transition mb-3 break-inside-avoid block w-full ${
                        picked ? 'border-slate-900 ring-2 ring-slate-200' : 'border-transparent hover:border-slate-300'
                      }`}
                    >
                      <div style={getAspectStyle()}>
                        <img src={tpl.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                      </div>
                      {/* Aspect ratio badge */}
                      <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 bg-black/60 text-white text-[10px] font-medium rounded">
                        {tpl.aspectRatio}
                      </div>
                      {picked && (
                        <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-slate-900 rounded-full flex items-center justify-center">
                          <CheckIcon className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
              {/* Infinite scroll trigger */}
              {hasNextPage && (
                <div ref={loadMoreRef} className="flex justify-center py-6">
                  {isFetchingNextPage ? (
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-900 border-t-transparent" />
                  ) : (
                    <span className="text-sm text-slate-400">Scroll for more</span>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Sidebar - Settings */}
        <div className="lg:border-l lg:pl-8 border-slate-200">
          {/* Product preview */}
          <div className="mb-6 p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-3">
              <img src={product.imageUrl} alt="" className="w-12 h-12 rounded object-cover" />
              <div>
                <div className="text-sm font-medium text-slate-900">{product.name}</div>
                <div className="text-xs text-slate-500">Your product</div>
              </div>
            </div>
          </div>

          {/* Output Aspect Ratio */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">Output size</label>
            <div className="flex gap-2">
              {(['1:1', '4:5', '9:16'] as AspectRatio[]).map((ar) => (
                <button
                  key={ar}
                  onClick={() => setAspectRatio(ar)}
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition ${
                    aspectRatio === ar
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {ar}
                </button>
              ))}
            </div>
          </div>

          {/* Mode */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">Mode</label>
            <div className="space-y-2">
              <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === 'exact'}
                  onChange={() => setMode('exact')}
                  className="mt-0.5"
                />
                <div>
                  <div className="font-medium text-slate-900">Exact</div>
                  <div className="text-sm text-slate-500">Swap the product into the template scene</div>
                </div>
              </label>
              <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === 'remix'}
                  onChange={() => setMode('remix')}
                  className="mt-0.5"
                />
                <div>
                  <div className="font-medium text-slate-900">Remix</div>
                  <div className="text-sm text-slate-500">Generate a new scene inspired by the template</div>
                </div>
              </label>
            </div>
            {mode === 'exact' && (
              <label className="flex items-center gap-2 mt-3 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={colorAdapt}
                  onChange={(e) => setColorAdapt(e.target.checked)}
                />
                Adapt colors to product
              </label>
            )}
          </div>

          {/* Variations */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Variations per template
            </label>
            <div className="flex items-center gap-3">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  onClick={() => setVariationsPerTemplate(n)}
                  className={`w-10 h-10 rounded-lg border font-medium ${
                    variationsPerTemplate === n
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Summary & Submit */}
          <div className="pt-6 border-t border-slate-200">
            <div className="text-sm text-slate-600 mb-4">
              {pickedIds.length === 0 ? (
                'Select templates to continue'
              ) : (
                <>
                  <span className="font-medium text-slate-900">{pickedIds.length}</span> template
                  {pickedIds.length > 1 ? 's' : ''} ×{' '}
                  <span className="font-medium text-slate-900">{variationsPerTemplate}</span> variation
                  {variationsPerTemplate > 1 ? 's' : ''} ={' '}
                  <span className="font-medium text-slate-900">{totalCount}</span> image
                  {totalCount > 1 ? 's' : ''}
                </>
              )}
            </div>
            <button
              onClick={handleGenerate}
              disabled={pickedIds.length === 0 || isSubmitting}
              className="w-full px-4 py-3 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {isSubmitting ? 'Starting...' : 'Generate'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: 'analyzing' | 'ready' | 'failed' }) {
  const styles = {
    analyzing: 'bg-amber-100 text-amber-700',
    ready: 'bg-emerald-100 text-emerald-700',
    failed: 'bg-red-100 text-red-700',
  }
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  )
}

// Icons
function ChevronLeftIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  )
}

function ArrowRightIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  )
}

function CheckIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
    </svg>
  )
}

function ExpandIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  )
}

function SparklesIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  )
}

function TextIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
    </svg>
  )
}

function IconsIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
}

function PaletteIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
