/**
 * /products/new — Full-page product creation form.
 *
 * URL-import flow:
 *   - Calling `api.urlImports.createUrlImport` creates a product end-to-end
 *     (scrape → upload → analysis). Once the import row reaches `done`, the
 *     product already exists in the DB.
 *   - We auto-fill form fields from the resulting product row but DO NOT call
 *     `createProductRich` again. Instead, "Create product" just navigates to
 *     `/studio/$productId` so the user lands directly on the product that was
 *     already created by the import pipeline.
 *
 * Direct-upload flow:
 *   - User uploads images via `api.r2.uploadProductImage`, fills the form, and
 *     clicks "Create product" → calls `createProductRich` → navigates to studio.
 */

import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { useAction, useQuery } from 'convex/react'
import { useConvexMutation } from '@convex-dev/react-query'
import { useMutation } from '@tanstack/react-query'
import { Dropzone, IMAGE_MIME_TYPE } from '@mantine/dropzone'
import { notifications } from '@mantine/notifications'
import {
  Alert,
  Anchor,
  Box,
  Button,
  Container,
  Group,
  Image,
  Loader,
  NumberInput,
  Paper,
  Select,
  Stack,
  TagsInput,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core'
import {
  IconLink,
  IconPhoto,
  IconPlus,
  IconUpload,
  IconX,
  IconStar,
  IconStarFilled,
} from '@tabler/icons-react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { mapBillingError } from '../lib/billing/mapBillingError'
import { MAX_PRODUCT_IMAGE_SIZE } from '../utils/constants'

export const Route = createFileRoute('/products/new')({
  component: NewProductPage,
})

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'GBP', label: 'GBP — British Pound' },
  { value: 'CAD', label: 'CAD — Canadian Dollar' },
  { value: 'AUD', label: 'AUD — Australian Dollar' },
]

const IN_FLIGHT_STATUSES = new Set(['pending', 'scraping', 'extracting', 'uploading'])

function NewProductPage() {
  const navigate = useNavigate()
  const uploadAction = useAction(api.r2.uploadProductImage)

  // ── URL import state ──────────────────────────────────────────────────────
  const [importUrl, setImportUrl] = useState('')
  const [importId, setImportId] = useState<Id<'urlImports'> | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  // productId from a completed URL import (used to skip createProductRich)
  const [importedProductId, setImportedProductId] = useState<Id<'products'> | null>(null)

  const createUrlImportMutation = useConvexMutation(api.urlImports.createUrlImport)

  const importRow = useQuery(
    api.urlImports.getUrlImport,
    importId ? { importId } : 'skip',
  )

  // Fetch product data once the import is done so we can auto-fill
  const importedProduct = useQuery(
    api.products.getProduct,
    importedProductId ? { productId: importedProductId } : 'skip',
  )

  // Fetch images for the imported product
  const importedImages = useQuery(
    api.productImages.getProductImagesList,
    importedProductId ? { productId: importedProductId } : 'skip',
  )

  const isImporting =
    importId !== null &&
    importRow !== undefined &&
    importRow !== null &&
    IN_FLIGHT_STATUSES.has(importRow.status)

  // ── Form state ────────────────────────────────────────────────────────────
  const [name, setName] = useState('')
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [price, setPrice] = useState<number | string>('')
  const [currency, setCurrency] = useState<string | null>('USD')
  const [tags, setTags] = useState<string[]>([])
  const [aiNotes, setAiNotes] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const createProductRichMutation = useConvexMutation(api.products.createProductRich)
  const createProduct = useMutation({ mutationFn: createProductRichMutation })

  // ── React to URL import status ────────────────────────────────────────────
  useEffect(() => {
    if (!importRow) return

    if (importRow.status === 'done' && importRow.productId) {
      setImportedProductId(importRow.productId as Id<'products'>)
      setImportError(null)
    }

    if (importRow.status === 'failed') {
      setImportError(importRow.error || importRow.currentStep || 'Import failed')
      setImportId(null) // re-enable input
    }
  }, [importRow])

  // ── Auto-fill form from imported product ─────────────────────────────────
  useEffect(() => {
    if (!importedProduct) return

    if (importedProduct.name) setName(importedProduct.name)
    if (importedProduct.productDescription) setDescription(importedProduct.productDescription)
    if (importedProduct.category) setCategory(importedProduct.category)
  }, [importedProduct])

  useEffect(() => {
    if (!importedImages || importedImages.length === 0) return
    const originals = importedImages
      .filter((img) => img.type === 'original')
      .map((img) => img.imageUrl)
    if (originals.length > 0) setImageUrls(originals)
  }, [importedImages])

  // ── Handlers ──────────────────────────────────────────────────────────────
  async function handleUrlImport() {
    const trimmed = importUrl.trim()
    if (!trimmed) return
    setImportError(null)
    try {
      const id = await createUrlImportMutation({ url: trimmed, mode: 'product-and-brand' })
      setImportId(id as Id<'urlImports'>)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  const handleFileDrop = useCallback(
    async (files: File[]) => {
      const file = files[0]
      if (!file) return
      if (file.size > MAX_PRODUCT_IMAGE_SIZE) {
        notifications.show({
          title: 'File too large',
          message: 'Image must be under 10 MB',
          color: 'red',
        })
        return
      }
      setIsUploading(true)
      try {
        const arrayBuffer = await file.arrayBuffer()
        const base64 = btoa(
          new Uint8Array(arrayBuffer).reduce(
            (d, b) => d + String.fromCharCode(b),
            '',
          ),
        )
        const { url } = await uploadAction({
          name: file.name,
          base64,
          contentType: file.type,
        })
        setImageUrls((prev) => [...prev, url])
        // default name from first image
        if (imageUrls.length === 0 && !name) {
          const cleaned = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ')
          setName(cleaned)
        }
      } catch (err) {
        notifications.show({
          title: 'Upload failed',
          message: err instanceof Error ? err.message : 'Something went wrong',
          color: 'red',
        })
      } finally {
        setIsUploading(false)
      }
    },
    [uploadAction, imageUrls.length, name],
  )

  function removeImage(idx: number) {
    setImageUrls((prev) => prev.filter((_, i) => i !== idx))
  }

  function moveImageUp(idx: number) {
    if (idx === 0) return
    setImageUrls((prev) => {
      const next = [...prev]
      ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
      return next
    })
  }

  async function handleSubmit() {
    // URL-import path: product already exists — just navigate
    if (importedProductId) {
      navigate({ to: '/studio/$productId', params: { productId: importedProductId } })
      return
    }

    // Direct-upload path
    if (imageUrls.length === 0 || !name.trim()) return
    setIsSubmitting(true)
    try {
      const productId = await createProduct.mutateAsync({
        name: name.trim(),
        imageUrls,
        ...(description.trim() ? { productDescription: description.trim() } : {}),
        ...(category ? { category } : {}),
        ...(price !== '' && price != null ? { price: Number(price) } : {}),
        ...(currency ? { currency } : {}),
        ...(tags.length > 0 ? { tags } : {}),
        ...(aiNotes.trim() ? { aiNotes: aiNotes.trim() } : {}),
      })
      notifications.show({
        title: 'Product created',
        message: 'Analysis started — opening your product now.',
        color: 'green',
      })
      navigate({ to: '/studio/$productId', params: { productId: productId as Id<'products'> } })
    } catch (err) {
      const info = mapBillingError(err)
      notifications.show({
        title: info.title,
        message: info.message,
        color: 'red',
        autoClose: 8000,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const canSubmit = (name.trim().length > 0 && imageUrls.length > 0) || !!importedProductId
  const fieldsDisabled = isImporting

  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <Group justify="space-between" align="center">
          <Title order={2} fw={700} c="white">
            New product
          </Title>
          <Anchor component={Link} to="/home" c="dark.2" size="sm" underline="never">
            Cancel
          </Anchor>
        </Group>

        {/* URL import card */}
        <Paper
          radius="lg"
          withBorder
          p="lg"
          style={{
            backgroundColor: 'var(--mantine-color-dark-7)',
            borderColor: 'var(--mantine-color-dark-5)',
          }}
        >
          <Stack gap="sm">
            <Group gap="xs" align="center">
              <IconLink size={16} color="var(--mantine-color-brand-4)" />
              <Text size="sm" fw={600} c="white">
                Import from a product URL
              </Text>
            </Group>
            <Text size="xs" c="dark.2">
              Paste a product page — we'll scrape images, title, and description automatically.
            </Text>
            <Group gap="sm" align="flex-end">
              <TextInput
                placeholder="https://yoursite.com/products/your-product"
                value={importUrl}
                onChange={(e) => setImportUrl(e.currentTarget.value)}
                disabled={isImporting || !!importedProductId}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleUrlImport()
                }}
                style={{ flex: 1 }}
                styles={{
                  input: {
                    backgroundColor: 'var(--mantine-color-dark-6)',
                    borderColor: 'var(--mantine-color-dark-4)',
                  },
                }}
              />
              <Button
                color="brand"
                variant="light"
                onClick={handleUrlImport}
                disabled={isImporting || !!importedProductId || !importUrl.trim()}
                loading={isImporting}
              >
                Import
              </Button>
            </Group>

            {isImporting && importRow && (
              <Group gap="xs">
                <Loader size="xs" color="brand" />
                <Text size="xs" c="dark.2">
                  {importRow.currentStep || 'Starting…'}
                </Text>
              </Group>
            )}

            {importError && (
              <Alert color="red" title="Import failed" radius="md">
                <Stack gap="xs">
                  <Text size="sm">{importError}</Text>
                  <Button
                    size="xs"
                    color="red"
                    variant="subtle"
                    onClick={() => {
                      setImportError(null)
                      handleUrlImport()
                    }}
                  >
                    Try again
                  </Button>
                </Stack>
              </Alert>
            )}

            {importedProductId && (
              <Alert color="green" title="Import complete" radius="md">
                <Text size="sm">Fields filled from the imported product.</Text>
              </Alert>
            )}
          </Stack>
        </Paper>

        {/* Form */}
        <Stack gap="md">
          {/* Product title */}
          <TextInput
            label="Product title"
            placeholder="e.g. Wireless Noise-Cancelling Headphones"
            required
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            disabled={fieldsDisabled}
            autoFocus={!isImporting}
            styles={{
              input: {
                backgroundColor: 'var(--mantine-color-dark-6)',
                borderColor: 'var(--mantine-color-dark-4)',
              },
              label: { color: 'var(--mantine-color-white)' },
            }}
          />

          {/* Multi-image section */}
          <Stack gap="xs">
            <Text size="sm" fw={500} c="white">
              Product images{' '}
              <Text span size="xs" c="dark.2">
                (at least 1 required)
              </Text>
            </Text>

            <Group gap="sm" wrap="wrap" align="flex-start">
              {imageUrls.map((url, idx) => (
                <Box
                  key={url}
                  style={{
                    position: 'relative',
                    width: 120,
                    height: 120,
                    borderRadius: 'var(--mantine-radius-md)',
                    overflow: 'hidden',
                    border: idx === 0
                      ? '2px solid var(--mantine-color-brand-5)'
                      : '2px solid var(--mantine-color-dark-4)',
                  }}
                >
                  <Image
                    src={url}
                    alt={`Product image ${idx + 1}`}
                    w={120}
                    h={120}
                    fit="cover"
                  />
                  {/* Primary star badge */}
                  <Box
                    style={{
                      position: 'absolute',
                      top: 4,
                      left: 4,
                    }}
                  >
                    {idx === 0 ? (
                      <ThemeIcon size={20} radius="sm" color="brand" variant="filled">
                        <IconStarFilled size={11} />
                      </ThemeIcon>
                    ) : (
                      <ThemeIcon
                        size={20}
                        radius="sm"
                        color="dark"
                        variant="filled"
                        style={{ cursor: 'pointer', opacity: 0.7 }}
                        onClick={() => {
                          // Make this image primary by moving it to front
                          setImageUrls((prev) => {
                            const next = [...prev]
                            const [item] = next.splice(idx, 1)
                            next.unshift(item)
                            return next
                          })
                        }}
                      >
                        <IconStar size={11} />
                      </ThemeIcon>
                    )}
                  </Box>
                  {/* Up arrow (reorder) */}
                  {idx > 0 && (
                    <Box
                      style={{
                        position: 'absolute',
                        bottom: 4,
                        left: 4,
                        cursor: 'pointer',
                      }}
                      onClick={() => moveImageUp(idx)}
                    >
                      <ThemeIcon size={20} radius="sm" color="dark" variant="filled" style={{ opacity: 0.8 }}>
                        <Text size="xs" fw={700} c="white">↑</Text>
                      </ThemeIcon>
                    </Box>
                  )}
                  {/* Remove button */}
                  <Box
                    style={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      cursor: 'pointer',
                    }}
                    onClick={() => removeImage(idx)}
                  >
                    <ThemeIcon size={20} radius="sm" color="red" variant="filled" style={{ opacity: 0.85 }}>
                      <IconX size={11} />
                    </ThemeIcon>
                  </Box>
                </Box>
              ))}

              {/* Dropzone tile */}
              <Dropzone
                onDrop={handleFileDrop}
                accept={IMAGE_MIME_TYPE}
                maxSize={MAX_PRODUCT_IMAGE_SIZE}
                multiple={false}
                disabled={isUploading || fieldsDisabled}
                style={{
                  width: 120,
                  height: 120,
                  border: '2px dashed var(--mantine-color-dark-4)',
                  borderRadius: 'var(--mantine-radius-md)',
                  background: 'var(--mantine-color-dark-6)',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: isUploading || fieldsDisabled ? 'not-allowed' : 'pointer',
                }}
              >
                <Stack align="center" gap={4}>
                  {isUploading ? (
                    <Loader size="sm" color="brand" />
                  ) : (
                    <>
                      <ThemeIcon size={32} radius="md" variant="gradient" gradient={{ from: 'brand.7', to: 'brand.5', deg: 135 }}>
                        <IconPlus size={18} />
                      </ThemeIcon>
                      <Text size="xs" c="dark.2" ta="center">
                        Add image
                      </Text>
                    </>
                  )}
                </Stack>
              </Dropzone>
            </Group>
          </Stack>

          {/* Description */}
          <Textarea
            label="Description"
            placeholder="What is this product? What problem does it solve?"
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            disabled={fieldsDisabled}
            autosize
            minRows={3}
            styles={{
              input: {
                backgroundColor: 'var(--mantine-color-dark-6)',
                borderColor: 'var(--mantine-color-dark-4)',
              },
              label: { color: 'var(--mantine-color-white)' },
            }}
          />

          {/* Category */}
          <Select
            label="Category"
            placeholder="e.g. Electronics, Apparel, Beauty"
            value={category}
            onChange={setCategory}
            disabled={fieldsDisabled}
            data={[
              'Electronics',
              'Apparel',
              'Beauty',
              'Food & Beverage',
              'Home & Garden',
              'Sports & Outdoors',
              'Health & Wellness',
              'Toys & Games',
              'Books & Media',
              'Software',
            ]}
            searchable
            clearable
            allowDeselect
            styles={{
              input: {
                backgroundColor: 'var(--mantine-color-dark-6)',
                borderColor: 'var(--mantine-color-dark-4)',
              },
              label: { color: 'var(--mantine-color-white)' },
              dropdown: {
                backgroundColor: 'var(--mantine-color-dark-6)',
                borderColor: 'var(--mantine-color-dark-4)',
              },
            }}
          />

          {/* Price + Currency */}
          <Group gap="sm" align="flex-end">
            <NumberInput
              label="Price"
              placeholder="29.99"
              value={price}
              onChange={setPrice}
              disabled={fieldsDisabled}
              min={0}
              decimalScale={2}
              style={{ flex: 1 }}
              styles={{
                input: {
                  backgroundColor: 'var(--mantine-color-dark-6)',
                  borderColor: 'var(--mantine-color-dark-4)',
                },
                label: { color: 'var(--mantine-color-white)' },
              }}
            />
            <Select
              label="Currency"
              value={currency}
              onChange={setCurrency}
              disabled={fieldsDisabled}
              data={CURRENCY_OPTIONS}
              w={160}
              styles={{
                input: {
                  backgroundColor: 'var(--mantine-color-dark-6)',
                  borderColor: 'var(--mantine-color-dark-4)',
                },
                label: { color: 'var(--mantine-color-white)' },
                dropdown: {
                  backgroundColor: 'var(--mantine-color-dark-6)',
                  borderColor: 'var(--mantine-color-dark-4)',
                },
              }}
            />
          </Group>

          {/* Tags */}
          <TagsInput
            label="Tags"
            placeholder="Type a tag and press Enter"
            value={tags}
            onChange={(v) => setTags(v.slice(0, 20))}
            disabled={fieldsDisabled}
            maxTags={20}
            styles={{
              input: {
                backgroundColor: 'var(--mantine-color-dark-6)',
                borderColor: 'var(--mantine-color-dark-4)',
              },
              label: { color: 'var(--mantine-color-white)' },
            }}
          />

          {/* AI notes */}
          <Textarea
            label="Notes for the AI"
            description="Anything you'd want a designer to know — quirks, key features, audience hints."
            placeholder='e.g. "This is a premium product aimed at remote workers. Emphasize comfort and productivity."'
            value={aiNotes}
            onChange={(e) => setAiNotes(e.currentTarget.value)}
            disabled={fieldsDisabled}
            autosize
            minRows={2}
            styles={{
              input: {
                backgroundColor: 'var(--mantine-color-dark-6)',
                borderColor: 'var(--mantine-color-dark-4)',
              },
              label: { color: 'var(--mantine-color-white)' },
              description: { color: 'var(--mantine-color-dark-2)' },
            }}
          />
        </Stack>

        {/* Footer */}
        <Group justify="flex-end" pt="md">
          <Button
            color="brand"
            size="md"
            leftSection={<IconUpload size={16} />}
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting || isUploading || isImporting}
            loading={isSubmitting}
          >
            {importedProductId ? 'Open product' : 'Create product'}
          </Button>
        </Group>
      </Stack>
    </Container>
  )
}
