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
  completedGenerations,
  pendingGenerations,
  onGenerateMore,
}: {
  product: { status: string }
  completedGenerations: Array<{
    _id: Id<'templateGenerations'>
    status: string
    outputUrl?: string
    currentStep?: string
    error?: string
  }>
  pendingGenerations: Array<{
    _id: Id<'templateGenerations'>
    status: string
    outputUrl?: string
    currentStep?: string
    error?: string
  }>
  onGenerateMore: () => void
}) {
  const hasAny = completedGenerations.length > 0 || pendingGenerations.length > 0

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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {pendingGenerations.map((gen) => (
              <GenerationCard key={gen._id} generation={gen} />
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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {completedGenerations.map((gen) => (
            <GenerationCard key={gen._id} generation={gen} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function GenerationCard({
  generation,
}: {
  generation: {
    _id: Id<'templateGenerations'>
    status: string
    outputUrl?: string
    currentStep?: string
    error?: string
  }
}) {
  const isComplete = generation.status === 'complete' && generation.outputUrl
  const isFailed = generation.status === 'failed'
  const isPending = !isComplete && !isFailed

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="aspect-square bg-slate-50 relative">
        {isComplete && generation.outputUrl && (
          <img src={generation.outputUrl} alt="Generated ad" className="w-full h-full object-cover" />
        )}
        {isPending && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-900 border-t-transparent mb-2" />
            <span className="text-xs text-slate-500">{generation.currentStep || 'Processing...'}</span>
          </div>
        )}
        {isFailed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-50">
            <span className="text-red-600 text-sm font-medium">Failed</span>
            {generation.error && (
              <span className="text-red-500 text-xs mt-1 px-2 text-center line-clamp-2">{generation.error}</span>
            )}
          </div>
        )}
      </div>
      {isComplete && generation.outputUrl && (
        <div className="p-2 flex justify-end border-t border-slate-100">
          <a
            href={generation.outputUrl}
            download
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            Download
          </a>
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
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {templates.map((tpl) => {
                  const picked = pickedIds.includes(tpl._id)
                  return (
                    <button
                      key={tpl._id}
                      onClick={() => toggleTemplate(tpl._id)}
                      className={`relative rounded-lg overflow-hidden border-2 transition ${
                        picked ? 'border-slate-900 ring-2 ring-slate-200' : 'border-transparent hover:border-slate-300'
                      }`}
                    >
                      <div className="aspect-square">
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
