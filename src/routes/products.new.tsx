/**
 * /products/new — Full-page product creation form.
 *
 * URL-import flow:
 *   - Calling `api.urlImports.createUrlImport` scrapes the page, distils
 *     product fields + uploads images to R2, and stores the results on the
 *     urlImports row (status='done'). NO product row is created yet.
 *   - The form autofills from the distilled fields on the import row.
 *   - Clicking Save calls `createProductRich` with the current form state
 *     (including any edits). Clicking Cancel navigates back without writing
 *     anything to the products table.
 *
 * Direct-upload flow:
 *   - User uploads images via `api.r2.uploadProductImage`, fills the form, and
 *     clicks Save → calls `createProductRich` → navigates to studio.
 */

import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useCallback, useRef } from 'react'
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
  Modal,
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
import { PRODUCT_CATEGORIES } from '../utils/categories'
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
const URL_IMPORT_TIMEOUT_MS = 90_000

function NewProductPage() {
  const navigate = useNavigate()
  const uploadAction = useAction(api.r2.uploadProductImage)

  // ── URL import state ──────────────────────────────────────────────────────
  const [importUrl, setImportUrl] = useState('')
  const [importId, setImportId] = useState<Id<'urlImports'> | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const createUrlImportMutation = useConvexMutation(api.urlImports.createUrlImport)
  const discardUrlImportMutation = useConvexMutation(api.urlImports.discardUrlImport)

  const importRow = useQuery(
    api.urlImports.getUrlImport,
    importId ? { importId } : 'skip',
  )

  const isImporting =
    importId !== null &&
    importRow !== undefined &&
    importRow !== null &&
    IN_FLIGHT_STATUSES.has(importRow.status)

  useEffect(() => {
    if (!importId) return
    if (importRow?.status === 'done' || importRow?.status === 'failed') return
    const t = setTimeout(() => {
      setImportError('Import timed out — try again or upload images manually.')
      setImportId(null)
      notifications.show({
        title: "Couldn't finish import",
        message: 'That page took too long to read. You can try again or upload product images manually.',
        color: 'orange',
        autoClose: 7000,
      })
    }, URL_IMPORT_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [importId, importRow?.status])

  // ── Form state ────────────────────────────────────────────────────────────
  const [name, setName] = useState('')
  // imageUrls = the images attached to the product (what Save commits).
  // candidateUrls = every image scraped from the import; the ones not in
  // imageUrls are offered in the "More photos" strip for the user to opt into.
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [candidateUrls, setCandidateUrls] = useState<string[]>([])
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [price, setPrice] = useState<number | string>('')
  const [currency, setCurrency] = useState<string | null>('USD')
  const [tags, setTags] = useState<string[]>([])
  const [aiNotes, setAiNotes] = useState('')
  // Brand assignment — an explicit choice (incl. "none") is required at
  // creation when the user has brands. null = not yet chosen.
  const [brandChoice, setBrandChoice] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  // URL of the image being shown in the lightbox; null = closed.
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  const createProductRichMutation = useConvexMutation(api.products.createProductRich)
  const createProduct = useMutation({ mutationFn: createProductRichMutation })

  // Brands available to assign at creation. The select is only shown when the
  // user has at least one brand.
  const brands = useQuery(api.brandKits.listBrandKits, {})
  const hasBrands = (brands?.length ?? 0) > 0
  const brandOptions = [
    { value: 'none', label: 'No brand' },
    ...(brands ?? []).map((b) => ({
      value: b._id as string,
      label: (b.name || b.websiteUrl || 'Unnamed brand') + (b.isPrimary ? ' (primary)' : ''),
    })),
  ]

  // ── React to URL import status + autofill form from distilled fields ──────
  // The autofill runs exactly once (autofilledRef) so it never clobbers edits
  // the user makes afterwards (removing an image, adding one from the "More
  // photos" strip) when the import row re-queries.
  const autofilledRef = useRef(false)
  useEffect(() => {
    if (!importRow) return

    if (importRow.status === 'failed') {
      setImportError(importRow.error || importRow.currentStep || 'Import failed')
      setImportId(null) // re-enable input
      return
    }

    if (importRow.status !== 'done') return
    if (autofilledRef.current) return
    autofilledRef.current = true

    // Autofill form from distilled fields stored on the import row
    if (importRow.distilledName) setName(importRow.distilledName)
    if (importRow.distilledDescription) setDescription(importRow.distilledDescription)
    if (importRow.distilledCategory) setCategory(importRow.distilledCategory)
    if (typeof importRow.distilledPrice === 'number') setPrice(importRow.distilledPrice)
    if (importRow.distilledCurrency) setCurrency(importRow.distilledCurrency)
    if (Array.isArray(importRow.distilledTags) && importRow.distilledTags.length > 0) {
      setTags(importRow.distilledTags)
    }
    if (importRow.distilledAiNotes) setAiNotes(importRow.distilledAiNotes)
    if (Array.isArray(importRow.uploadedImageUrls) && importRow.uploadedImageUrls.length > 0) {
      const all = importRow.uploadedImageUrls
      setCandidateUrls(all)
      // Pre-select only the high-trust images (gallery JSON / LLM / og:image).
      // Recall-firehose candidates stay unselected in the "More photos" strip
      // so unrelated images are opt-in, not auto-attached. When the backend
      // didn't record a count (older imports), fall back to keeping all.
      const trusted = importRow.trustedImageCount ?? all.length
      setImageUrls(all.slice(0, Math.max(0, Math.min(trusted, all.length))))
    }
  }, [importRow])

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
        ...(brandChoice && brandChoice !== 'none'
          ? { brandKitId: brandChoice as Id<'brandKits'> }
          : {}),
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

  // When the user has brands, an explicit brand choice (incl. "No brand") is
  // required before saving.
  const brandChosen = !hasBrands || brandChoice !== null
  const canSubmit = name.trim().length > 0 && imageUrls.length > 0 && brandChosen
  const fieldsDisabled = isImporting

  // Scraped images we deliberately left unselected (recall-firehose candidates
  // on non-marketplace pages). Offered as opt-in tiles below the main grid.
  const moreCandidates = candidateUrls.filter((u) => !imageUrls.includes(u))

  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <Group justify="space-between" align="center">
          <Title order={2} fw={700} c="dark.0">
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
            backgroundColor: 'var(--mantine-color-dark-8)',
            borderColor: 'var(--mantine-color-dark-5)',
          }}
        >
          <Stack gap="sm">
            <Group gap="xs" align="center">
              <IconLink size={16} color="var(--mantine-color-brand-4)" />
              <Text size="sm" fw={600} c="dark.0">
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
                disabled={isImporting}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleUrlImport()
                }}
                style={{ flex: 1 }}
                styles={{
                  input: {
                    backgroundColor: 'var(--mantine-color-dark-7)',
                    borderColor: 'var(--mantine-color-dark-5)',
                  },
                }}
              />
              <Button
                color="brand"
                variant="light"
                onClick={handleUrlImport}
                disabled={isImporting || !importUrl.trim()}
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

            {importRow?.status === 'done' && (
              <Alert color="green" title="Import complete" radius="md">
                <Text size="sm">
                  Fields filled from the imported page. We pre-selected the product
                  photos we're confident about — review them, remove any you don't
                  want, and add more below if needed.
                </Text>
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
                backgroundColor: 'var(--mantine-color-dark-7)',
                borderColor: 'var(--mantine-color-dark-5)',
              },
              label: { color: 'var(--mantine-color-dark-0)' },
            }}
          />

          {/* Multi-image section */}
          <Stack gap="xs">
            <Text size="sm" fw={500} c="dark.0">
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
                      : '2px solid var(--mantine-color-dark-5)',
                  }}
                >
                  <Image
                    src={url}
                    alt={`Product image ${idx + 1}`}
                    w={120}
                    h={120}
                    fit="cover"
                    onClick={() => setLightboxUrl(url)}
                    style={{ cursor: 'zoom-in' }}
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
                        color="dark.0"
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
                      <ThemeIcon size={20} radius="sm" color="dark.0" variant="filled" style={{ opacity: 0.8 }}>
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
                  border: '2px dashed var(--mantine-color-dark-5)',
                  borderRadius: 'var(--mantine-radius-md)',
                  background: 'var(--mantine-color-dark-7)',
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

          {/* More photos from this page — recall candidates we left out to
              avoid pulling in unrelated images. Tap to add to the product. */}
          {moreCandidates.length > 0 && (
            <Stack gap="xs">
              <Text size="sm" fw={500} c="dark.0">
                More photos from this page{' '}
                <Text span size="xs" c="dark.2">
                  (we left these out to avoid unrelated images — tap to add)
                </Text>
              </Text>
              <Group gap="sm" wrap="wrap" align="flex-start">
                {moreCandidates.map((url) => (
                  <Box
                    key={url}
                    onClick={() => setImageUrls((prev) => [...prev, url])}
                    style={{
                      position: 'relative',
                      width: 88,
                      height: 88,
                      borderRadius: 'var(--mantine-radius-md)',
                      overflow: 'hidden',
                      border: '2px dashed var(--mantine-color-dark-5)',
                      cursor: 'pointer',
                    }}
                  >
                    <Image
                      src={url}
                      alt="Additional scraped image"
                      w={88}
                      h={88}
                      fit="cover"
                      style={{ opacity: 0.55 }}
                    />
                    <Box style={{ position: 'absolute', top: 4, right: 4 }}>
                      <ThemeIcon size={20} radius="sm" color="brand" variant="filled" style={{ opacity: 0.9 }}>
                        <IconPlus size={11} />
                      </ThemeIcon>
                    </Box>
                  </Box>
                ))}
              </Group>
            </Stack>
          )}

          {/* Brand — explicit choice required at creation when the user has
              brands. Determines whose colors / voice every ad for this product
              uses. */}
          {hasBrands && (
            <Select
              label="Brand"
              description="Which brand's theme & voice should this product's ads use?"
              placeholder="Choose a brand"
              required
              value={brandChoice}
              onChange={setBrandChoice}
              disabled={fieldsDisabled}
              data={brandOptions}
              styles={{
                input: {
                  backgroundColor: 'var(--mantine-color-dark-7)',
                  borderColor: 'var(--mantine-color-dark-5)',
                },
                label: { color: 'var(--mantine-color-dark-0)' },
                description: { color: 'var(--mantine-color-dark-2)' },
                dropdown: {
                  backgroundColor: 'var(--mantine-color-dark-7)',
                  borderColor: 'var(--mantine-color-dark-5)',
                },
              }}
            />
          )}

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
                backgroundColor: 'var(--mantine-color-dark-7)',
                borderColor: 'var(--mantine-color-dark-5)',
              },
              label: { color: 'var(--mantine-color-dark-0)' },
            }}
          />

          {/* Category — restricted to the canonical PRODUCT_CATEGORIES list.
              The URL-import LLM is instructed to pick one of these values,
              and any off-list result gets dropped before reaching the form. */}
          <Select
            label="Category"
            placeholder="Pick a category"
            value={category}
            onChange={setCategory}
            disabled={fieldsDisabled}
            data={[...PRODUCT_CATEGORIES]}
            searchable
            clearable
            allowDeselect
            styles={{
              input: {
                backgroundColor: 'var(--mantine-color-dark-7)',
                borderColor: 'var(--mantine-color-dark-5)',
              },
              label: { color: 'var(--mantine-color-dark-0)' },
              dropdown: {
                backgroundColor: 'var(--mantine-color-dark-7)',
                borderColor: 'var(--mantine-color-dark-5)',
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
                  backgroundColor: 'var(--mantine-color-dark-7)',
                  borderColor: 'var(--mantine-color-dark-5)',
                },
                label: { color: 'var(--mantine-color-dark-0)' },
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
                  backgroundColor: 'var(--mantine-color-dark-7)',
                  borderColor: 'var(--mantine-color-dark-5)',
                },
                label: { color: 'var(--mantine-color-dark-0)' },
                dropdown: {
                  backgroundColor: 'var(--mantine-color-dark-7)',
                  borderColor: 'var(--mantine-color-dark-5)',
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
                backgroundColor: 'var(--mantine-color-dark-7)',
                borderColor: 'var(--mantine-color-dark-5)',
              },
              label: { color: 'var(--mantine-color-dark-0)' },
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
                backgroundColor: 'var(--mantine-color-dark-7)',
                borderColor: 'var(--mantine-color-dark-5)',
              },
              label: { color: 'var(--mantine-color-dark-0)' },
              description: { color: 'var(--mantine-color-dark-2)' },
            }}
          />
        </Stack>

        {/* Footer */}
        <Group justify="flex-end" pt="md" wrap="wrap" gap="sm">
          <Button
            variant="subtle"
            color="dark"
            size="md"
            fullWidth={false}
            onClick={async () => {
              // If a URL import populated the form but the user hasn't
              // saved, clean up the import row + its R2 objects before
              // leaving. Best-effort: errors are silent so cancel never
              // blocks navigation.
              if (importId) {
                try {
                  await discardUrlImportMutation({ importId })
                } catch {
                  /* user is leaving; don't block on cleanup failure */
                }
              }
              navigate({ to: '/home' })
            }}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            color="brand"
            size="md"
            leftSection={<IconUpload size={16} />}
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting || isUploading || isImporting}
            loading={isSubmitting}
          >
            Save product
          </Button>
        </Group>
      </Stack>

      {/* Image lightbox — click any product image thumbnail to open. */}
      <Modal
        opened={lightboxUrl !== null}
        onClose={() => setLightboxUrl(null)}
        size="auto"
        centered
        withCloseButton
        padding={0}
        styles={{
          content: { backgroundColor: 'transparent' },
          body: { padding: 0 },
          close: {
            color: 'white',
            backgroundColor: 'rgba(0,0,0,0.6)',
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 2,
          },
        }}
        overlayProps={{ backgroundOpacity: 0.85, blur: 6 }}
      >
        {lightboxUrl && (
          <Image
            src={lightboxUrl}
            alt="Product image preview"
            fit="contain"
            mah="85vh"
            maw="90vw"
            radius="md"
          />
        )}
      </Modal>
    </Container>
  )
}
