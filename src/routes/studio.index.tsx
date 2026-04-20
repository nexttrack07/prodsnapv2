import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useAction } from 'convex/react'
import { useConvexMutation, convexQuery } from '@convex-dev/react-query'
import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

export const Route = createFileRoute('/studio/')({
  component: ProductGridPage,
})

function ProductGridPage() {
  const navigate = useNavigate()
  const { data: products, isLoading } = useQuery(convexQuery(api.products.listProducts, {}))

  const uploadAction = useAction(api.r2.uploadProductImage)
  const createProduct = useConvexMutation(api.products.createProduct)
  const createProductMutation = useMutation({ mutationFn: createProduct })

  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be under 10 MB')
      return
    }

    setIsUploading(true)
    try {
      const arrayBuffer = await file.arrayBuffer()
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''),
      )

      const fileName = file.name.replace(/\.[^.]+$/, '')
      const { url } = await uploadAction({
        name: file.name,
        base64,
        contentType: file.type,
      })

      const productId = await createProductMutation.mutateAsync({
        imageUrl: url,
        name: fileName.replace(/[-_]/g, ' '),
      })

      toast.success('Product created!')
      navigate({ to: '/studio/$productId', params: { productId } })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const hasProducts = products && products.length > 0

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900">My Products</h1>
          <p className="mt-2 text-slate-500 text-lg">
            Upload product photos and generate ad creatives.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition cursor-pointer disabled:opacity-50">
          <UploadIcon />
          {isUploading ? 'Uploading...' : 'New Product'}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            disabled={isUploading}
            className="sr-only"
          />
        </label>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600" />
        </div>
      ) : !hasProducts ? (
        <EmptyState onUpload={() => fileInputRef.current?.click()} isUploading={isUploading} />
      ) : (
        <ProductGrid products={products} />
      )}
    </div>
  )
}

function EmptyState({ onUpload, isUploading }: { onUpload: () => void; isUploading: boolean }) {
  return (
    <div className="border-2 border-dashed border-slate-200 rounded-xl p-12 text-center">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
        <PackageIcon className="w-8 h-8 text-slate-700" />
      </div>
      <h3 className="text-lg font-medium text-slate-900 mb-2">No products yet</h3>
      <p className="text-slate-500 mb-6 max-w-md mx-auto">
        Upload your first product photo to get started. We'll analyze it and help you generate
        stunning ad creatives.
      </p>
      <button
        onClick={onUpload}
        disabled={isUploading}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition disabled:opacity-50"
      >
        <UploadIcon />
        {isUploading ? 'Uploading...' : 'Upload Product'}
      </button>
    </div>
  )
}

function ProductGrid({
  products,
}: {
  products: Array<{
    _id: Id<'products'>
    name: string
    imageUrl: string
    status: 'analyzing' | 'ready' | 'failed'
    category?: string
    _creationTime: number
  }>
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {products.map((product) => (
        <ProductCard key={product._id} product={product} />
      ))}
    </div>
  )
}

function ProductCard({
  product,
}: {
  product: {
    _id: Id<'products'>
    name: string
    imageUrl: string
    status: 'analyzing' | 'ready' | 'failed'
    category?: string
    _creationTime: number
  }
}) {
  return (
    <Link
      to="/studio/$productId"
      params={{ productId: product._id }}
      className="group block bg-white border border-slate-200 rounded-lg overflow-hidden hover:border-slate-300 hover:shadow-md transition"
    >
      <div className="aspect-square bg-slate-50 relative overflow-hidden">
        <img
          src={product.imageUrl}
          alt={product.name}
          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
        />
        {product.status === 'analyzing' && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent" />
          </div>
        )}
        {product.status === 'failed' && (
          <div className="absolute top-2 right-2 px-2 py-1 bg-red-500 text-white text-xs rounded">
            Failed
          </div>
        )}
      </div>
      <div className="p-3">
        <h3 className="font-medium text-slate-900 truncate">{product.name}</h3>
        {product.category && (
          <p className="text-sm text-slate-500 truncate">{product.category}</p>
        )}
      </div>
    </Link>
  )
}

function UploadIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
      />
    </svg>
  )
}

function PackageIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
      />
    </svg>
  )
}
