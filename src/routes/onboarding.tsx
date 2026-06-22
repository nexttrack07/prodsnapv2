import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useAuth, SignInButton } from '@clerk/react'
import { useAction, useMutation, useQuery } from 'convex/react'
import { notifications } from '@mantine/notifications'
import {
  ActionIcon,
  Box,
  Button,
  Center,
  Container,
  FileButton,
  Group,
  Image,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
  ThemeIcon,
  List,
} from '@mantine/core'
import {
  IconSparkles,
  IconStar,
  IconStarFilled,
  IconUpload,
  IconCheck,
  IconPhoto,
} from '@tabler/icons-react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { StepRole } from '~/components/onboarding/StepRole'
import { StepBusiness } from '~/components/onboarding/StepBusiness'
import { StepPlan } from '~/components/onboarding/StepPlan'

// sessionStorage key set when a user enters via the no-card starter flow.
// The OnboardingGuard reads this to allow access to /home and /studio
// without a paid plan.
export const STARTER_MODE_KEY = 'prodsnap_activation_mode'

// sessionStorage key holding the product URL the visitor pasted in the landing
// hero. Persisted across sign-up; the starter flow reads it to import THEIR
// product (rather than cloning the sample) before generating the free test.
export const PENDING_PRODUCT_URL_KEY = 'prodsnap_pending_product_url'

type OnboardingSearch = { step?: number; subscribed?: boolean; starter?: boolean }

export const Route = createFileRoute('/onboarding')({
  validateSearch: (search: Record<string, unknown>): OnboardingSearch => {
    const raw = Number(search.step)
    const step = Number.isFinite(raw) ? raw : undefined
    const subscribed =
      search.subscribed === '1' || search.subscribed === 1 || search.subscribed === true
    const starter =
      search.starter === '1' || search.starter === 1 || search.starter === true
    return {
      ...(step && step >= 1 && step <= 3 ? { step } : {}),
      ...(subscribed ? { subscribed: true } : {}),
      ...(starter ? { starter: true } : {}),
    }
  },
  component: OnboardingPage,
})

function OnboardingPage() {
  const { isLoaded, isSignedIn } = useAuth()
  const status = useQuery(
    api.onboardingProfiles.getOnboardingStatus,
    isSignedIn ? {} : 'skip',
  )
  const profile = useQuery(
    api.onboardingProfiles.getMyProfile,
    isSignedIn ? {} : 'skip',
  )
  const search = Route.useSearch()
  const navigate = useNavigate()
  const finalizeOnboardingAfterCheckout = useAction(
    api.onboardingProfiles.finalizeOnboardingAfterCheckout,
  )
  const finalizedRef = useRef(false)
  const [finalizeError, setFinalizeError] = useState<string | null>(null)

  const runFinalize = () => {
    finalizedRef.current = true
    setFinalizeError(null)
    void finalizeOnboardingAfterCheckout().catch((err) => {
      finalizedRef.current = false
      setFinalizeError(err instanceof Error ? err.message : 'Could not finish setup')
    })
  }

  // The embedded PricingTable redirects here with ?subscribed=1 after checkout.
  // Treat the param as a UI hint only: the server action verifies Clerk has an
  // active paid subscription before syncing the plan, granting credits, and
  // marking onboarding complete.
  useEffect(() => {
    if (!isSignedIn || !search.subscribed || finalizedRef.current) return
    runFinalize()
  }, [isSignedIn, search.subscribed, finalizeOnboardingAfterCheckout])

  // Loading
  if (!isLoaded || (isSignedIn && (status === undefined || profile === undefined))) {
    return (
      <Center mih="60vh">
        <Loader size="md" color="brand" />
      </Center>
    )
  }

  // Not signed in — gate with Clerk modal
  if (!isSignedIn) {
    return (
      <Container size="sm" py="xl">
        <Stack align="center" gap="md">
          <Title order={2}>Sign in to get started</Title>
          <Text c="dark.2" ta="center">
            Create your account to begin onboarding.
          </Text>
          <SignInButton mode="modal">
            <Button color="brand">Sign in or create account</Button>
          </SignInButton>
        </Stack>
      </Container>
    )
  }

  // The no-card starter (import → pick photos → generate) is always reachable
  // via ?starter=1, even for already-onboarded users — otherwise the
  // completed-redirect below would bounce them to /home before they ever see
  // it. (Re-running needs fresh data; the dev reset button clears it.)
  if (search.starter) {
    return <StarterActivation />
  }

  // Already onboarded (explicit completedAt, paid-plan rescue, or legacy
  // user with products) → bounce to studio.
  if (status && status.state !== 'pending') {
    return <RedirectTo to="/home" />
  }

  // Post-subscribe finalize in progress (see effect above): show a brief
  // loader instead of re-rendering the plan picker while completeOnboarding
  // resolves and flips status → complete (which then redirects to /home).
  if (search.subscribed) {
    return (
      <Center mih="60vh">
        <Stack align="center" gap="md">
          {finalizeError ? (
            <>
              <Title order={2} ta="center">We couldn't finish setup</Title>
              <Text c="dark.2" ta="center" maw={420}>
                {finalizeError}. If your payment completed, retry in a moment;
                otherwise choose a plan to continue.
              </Text>
              <Group>
                <Button
                  variant="default"
                  onClick={runFinalize}
                >
                  Retry
                </Button>
                <Button color="brand" onClick={() => navigate({ to: '/pricing' })}>
                  View plans
                </Button>
              </Group>
            </>
          ) : (
            <>
              <Loader size="md" color="brand" />
              <Text c="dark.2">Finishing setup…</Text>
            </>
          )}
        </Stack>
      </Center>
    )
  }

  // Free-credits model: the no-card starter is the DEFAULT path. The plan
  // wizard is only shown when the user explicitly enters it (e.g. tapping
  // "Pick a plan" → ?step=N). Plain /onboarding now provisions the free test.
  if (search.starter || search.step === undefined) {
    return <StarterActivation />
  }

  const profileStep = profile?.currentStep ?? 1
  const requestedStep = search.step ?? profileStep
  const activeStep = Math.min(requestedStep, profileStep)

  const goToStep = (step: number) =>
    navigate({ to: '/onboarding', search: { step } })

  return (
    <Container size="sm" py={48}>
      <StepIndicator current={activeStep} />
      <Box mt="xl">
        {activeStep === 1 && <StepRole onNext={() => goToStep(2)} />}
        {activeStep === 2 && (
          <StepBusiness
            onNext={() => goToStep(3)}
            onBack={() => goToStep(1)}
          />
        )}
        {activeStep === 3 && <StepPlan onBack={() => goToStep(2)} />}
      </Box>
    </Container>
  )
}

function StepIndicator({ current }: { current: number }) {
  const steps = [
    { num: 1, label: 'About you' },
    { num: 2, label: 'Your business' },
    { num: 3, label: 'Pick a plan' },
  ]
  return (
    <Group justify="center" gap="xs" wrap="nowrap">
      {steps.map((s, idx) => {
        const isDone = current > s.num
        const isActive = current === s.num
        return (
          <Group key={s.num} gap="xs" wrap="nowrap">
            <Box
              w={28}
              h={28}
              style={{
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                fontWeight: 600,
                backgroundColor: isActive
                  ? 'var(--mantine-color-brand-6)'
                  : isDone
                  ? 'var(--mantine-color-brand-9)'
                  : 'var(--mantine-color-dark-5)',
                color: isActive || isDone ? 'white' : 'var(--mantine-color-dark-2)',
              }}
            >
              {isDone ? '✓' : s.num}
            </Box>
            <Text
              size="sm"
              fw={isActive ? 600 : 400}
              c={isActive ? 'white' : 'dark.2'}
              visibleFrom="sm"
            >
              {s.label}
            </Text>
            {idx < steps.length - 1 && (
              <Box
                w={32}
                h={2}
                bg={current > s.num ? 'brand.9' : 'dark.5'}
                style={{ borderRadius: 1 }}
              />
            )}
          </Group>
        )
      })}
    </Group>
  )
}

function RedirectTo({ to }: { to: string }) {
  const navigate = useNavigate()
  useEffect(() => {
    navigate({ to })
  }, [navigate, to])
  return (
    <Center mih="60vh">
      <Loader size="md" color="brand" />
    </Center>
  )
}

function StarterActivation() {
  // Read the product URL the visitor pasted on the landing hero (if any),
  // exactly once, then clear it so a refresh doesn't re-import.
  const [pendingUrl] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const u = sessionStorage.getItem(PENDING_PRODUCT_URL_KEY)
      if (u) sessionStorage.removeItem(PENDING_PRODUCT_URL_KEY)
      return u
    } catch {
      return null
    }
  })
  const [forceSample, setForceSample] = useState(false)

  if (pendingUrl && !forceSample) {
    return <StarterFromUrl url={pendingUrl} onUseSample={() => setForceSample(true)} />
  }
  return <StarterFromSample />
}

// ─── URL-first starter: import the visitor's product → free test on it ─────────

type StarterPhase =
  | 'importing'
  | 'choosing'
  | 'creating'
  | 'analyzing'
  | 'generating'
  | 'error'

const PHASE_LABEL: Record<
  'importing' | 'creating' | 'analyzing' | 'generating',
  string
> = {
  importing: 'Finding your product photos…',
  creating: 'Setting up your product…',
  analyzing: 'Analyzing your product…',
  generating: 'Generating your free ad test…',
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

function StarterFromUrl({ url, onUseSample }: { url: string; onUseSample: () => void }) {
  const navigate = useNavigate()
  const createUrlImport = useMutation(api.urlImports.createUrlImport)
  const createStarterProduct = useMutation(api.activation.createStarterProductFromImages)
  const activateForProduct = useAction(api.activation.activateStarterForProduct)

  const [importId, setImportId] = useState<Id<'urlImports'> | null>(null)
  const [productId, setProductId] = useState<Id<'products'> | null>(null)
  const [phase, setPhase] = useState<StarterPhase>('importing')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<string[]>([])
  const [scrapeFailed, setScrapeFailed] = useState(false)

  const startedRef = useRef(false)
  const handledImportRef = useRef(false)
  const activatedRef = useRef(false)

  const fail = (msg: string) => {
    setErrorMsg(msg)
    setPhase('error')
  }

  // 1. Kick off the URL import once.
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    try {
      sessionStorage.setItem(STARTER_MODE_KEY, 'starter')
    } catch {
      /* ignore */
    }
    createUrlImport({ url, mode: 'product-and-brand' })
      .then((id) => setImportId(id))
      .catch((err) =>
        fail(err instanceof Error ? err.message : 'Could not start the import.'),
      )
  }, [url, createUrlImport])

  // 2. Import settled → show the image picker (we no longer auto-pick). Even a
  // failed scrape lands here so the user can upload their own photo instead.
  const imp = useQuery(api.urlImports.getUrlImport, importId ? { importId } : 'skip')
  useEffect(() => {
    if (!imp || handledImportRef.current) return
    if (imp.status === 'failed') {
      handledImportRef.current = true
      setScrapeFailed(true)
      setCandidates([])
      setPhase('choosing')
      return
    }
    if (imp.status === 'done') {
      handledImportRef.current = true
      const found = imp.uploadedImageUrls ?? []
      setCandidates(found)
      setScrapeFailed(found.length === 0)
      setPhase('choosing')
    }
  }, [imp])

  // From the picker → create the product from the chosen photos, then proceed.
  const handleConfirm = async (imageUrls: string[]) => {
    setPhase('creating')
    try {
      const pid = await createStarterProduct({
        imageUrls,
        importId: importId ?? undefined, // carries distilled metadata if any
      })
      setProductId(pid)
      setPhase('analyzing')
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Could not set up your product.')
    }
  }

  // 3. Analysis ready → activate the starter Ad Test and go to Studio.
  const product = useQuery(
    api.products.getProductWithStats,
    productId ? { productId } : 'skip',
  )
  useEffect(() => {
    if (!product || activatedRef.current) return
    if (product.status === 'failed') {
      fail('We could not analyze your product. Try a different photo.')
      return
    }
    if (product.status === 'ready') {
      activatedRef.current = true
      setPhase('generating')
      activateForProduct({ productId: product._id })
        .then(({ adTestId, productId: pid }) => {
          navigate({
            to: '/studio/$productId',
            params: { productId: pid },
            search: { adTestId },
          })
        })
        .catch((err) =>
          fail(err instanceof Error ? err.message : 'Could not start your ad test.'),
        )
    }
  }, [product, activateForProduct, navigate])

  if (phase === 'error') {
    return (
      <Center mih="60vh">
        <Container size="xs">
          <Stack align="center" gap="md" ta="center">
            <Title order={2}>We hit a snag</Title>
            <Text c="dark.2" maw={420}>
              {errorMsg ?? 'Something went wrong importing your product.'}
            </Text>
            <Group>
              <Button variant="default" onClick={onUseSample}>
                Start with a sample instead
              </Button>
              <Button color="brand" onClick={() => navigate({ to: '/home' })}>
                Go to dashboard
              </Button>
            </Group>
          </Stack>
        </Container>
      </Center>
    )
  }

  if (phase === 'choosing') {
    return (
      <StarterImagePicker
        candidates={candidates}
        scrapeFailed={scrapeFailed}
        onConfirm={handleConfirm}
        onUseSample={onUseSample}
      />
    )
  }

  const label = PHASE_LABEL[phase]
  return (
    <Center mih="60vh">
      <Container size="xs">
        <Stack align="center" gap="lg" ta="center">
          <ThemeIcon size={56} radius="xl" color="brand" variant="light">
            <IconSparkles size={28} />
          </ThemeIcon>
          <div>
            <Title order={2} mb={8}>Building your free ad test</Title>
            <Text c="dark.2" maw={400} mx="auto">
              We're turning your product into 3 ready-to-run ads. This takes about
              a minute — no card needed.
            </Text>
          </div>
          <Group gap="sm">
            <Loader size="sm" color="brand" />
            <Text c="dark.1" size="sm">
              {imp?.currentStep && phase === 'importing' ? imp.currentStep : label}
            </Text>
          </Group>
        </Stack>
      </Container>
    </Center>
  )
}

// ─── Image picker: surface candidates, let the user choose + set the hero ──────

function StarterImagePicker({
  candidates,
  scrapeFailed,
  onConfirm,
  onUseSample,
}: {
  candidates: string[]
  scrapeFailed: boolean
  onConfirm: (imageUrls: string[]) => void
  onUseSample: () => void
}) {
  const uploadImage = useAction(api.r2.uploadProductImage)

  const [images, setImages] = useState<string[]>(candidates)
  // Pre-select the first few candidates so the common case is one tap.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(candidates.slice(0, 6)),
  )
  const [hero, setHero] = useState<string | null>(candidates[0] ?? null)
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const toggle = (u: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(u)) {
        next.delete(u)
        if (hero === u) setHero(null)
      } else {
        next.add(u)
        if (!hero) setHero(u)
      }
      return next
    })
  }

  const makeHero = (u: string) => {
    setHero(u)
    setSelected((prev) => new Set(prev).add(u))
  }

  const handleUpload = async (file: File | null) => {
    if (!file) return
    if (file.size > MAX_UPLOAD_BYTES) {
      notifications.show({ color: 'red', message: 'Image must be under 10 MB.' })
      return
    }
    setUploading(true)
    try {
      const buf = await file.arrayBuffer()
      const base64 = btoa(
        new Uint8Array(buf).reduce((d, b) => d + String.fromCharCode(b), ''),
      )
      const { url } = await uploadImage({
        name: file.name,
        base64,
        contentType: file.type,
      })
      setImages((prev) => [url, ...prev])
      setSelected((prev) => new Set(prev).add(url))
      setHero((prev) => prev ?? url)
    } catch (err) {
      notifications.show({
        color: 'red',
        message: err instanceof Error ? err.message : 'Upload failed.',
      })
    } finally {
      setUploading(false)
    }
  }

  const handleGenerate = () => {
    const chosen = images.filter((u) => selected.has(u))
    const ordered =
      hero && selected.has(hero)
        ? [hero, ...chosen.filter((u) => u !== hero)]
        : chosen
    if (ordered.length === 0) return
    setSubmitting(true)
    onConfirm(ordered)
  }

  const chosenCount = images.filter((u) => selected.has(u)).length
  const showEmptyState = images.length === 0

  return (
    <Container size="sm" py={40}>
      <Stack gap="lg">
        <div>
          <Title order={2} fz={26} fw={600}>
            Pick your product photos
          </Title>
          <Text c="dark.2" mt={4}>
            {showEmptyState
              ? "We couldn't grab your photos automatically — some sites block us. Upload your product photo and we'll generate from it."
              : 'Choose the photos to generate ads from. Tap ★ to set your hero — it leads every ad.'}
          </Text>
          {scrapeFailed && !showEmptyState && (
            <Text c="yellow.5" size="sm" mt={6}>
              Heads up: some images couldn't be pulled from that site. Upload your
              own if the right shot is missing.
            </Text>
          )}
        </div>

        {showEmptyState ? (
          <Paper
            withBorder
            radius="lg"
            p="xl"
            style={{ borderColor: 'var(--mantine-color-dark-5)', borderStyle: 'dashed' }}
          >
            <Stack align="center" gap="sm">
              <ThemeIcon size={48} radius="xl" variant="light" color="brand">
                <IconPhoto size={24} />
              </ThemeIcon>
              <FileButton onChange={handleUpload} accept="image/png,image/jpeg,image/webp">
                {(props) => (
                  <Button {...props} loading={uploading} leftSection={<IconUpload size={16} />}>
                    Upload a product photo
                  </Button>
                )}
              </FileButton>
            </Stack>
          </Paper>
        ) : (
          <SimpleGrid cols={{ base: 3, sm: 4 }} spacing="sm">
            {images.map((u) => {
              const isSelected = selected.has(u)
              const isHero = hero === u
              return (
                <Box
                  key={u}
                  pos="relative"
                  onClick={() => toggle(u)}
                  style={{
                    cursor: 'pointer',
                    borderRadius: 'var(--mantine-radius-md)',
                    overflow: 'hidden',
                    outline: isSelected
                      ? '2px solid var(--mantine-color-brand-5)'
                      : '1px solid var(--mantine-color-dark-5)',
                    outlineOffset: isSelected ? -2 : -1,
                  }}
                >
                  <Image src={u} alt="" w="100%" style={{ aspectRatio: '1', objectFit: 'cover', display: 'block', opacity: isSelected ? 1 : 0.55 }} />
                  {isSelected && (
                    <ThemeIcon
                      size="sm"
                      radius="xl"
                      color="brand"
                      pos="absolute"
                      style={{ top: 4, right: 4 }}
                    >
                      <IconCheck size={12} />
                    </ThemeIcon>
                  )}
                  <ActionIcon
                    size="sm"
                    radius="xl"
                    variant={isHero ? 'filled' : 'default'}
                    color="yellow"
                    pos="absolute"
                    style={{ top: 4, left: 4 }}
                    aria-label="Set as hero"
                    onClick={(e) => {
                      e.stopPropagation()
                      makeHero(u)
                    }}
                  >
                    {isHero ? <IconStarFilled size={12} /> : <IconStar size={12} />}
                  </ActionIcon>
                </Box>
              )
            })}

            {/* Upload-your-own tile */}
            <FileButton onChange={handleUpload} accept="image/png,image/jpeg,image/webp">
              {(props) => (
                <Box
                  {...props}
                  style={{
                    cursor: 'pointer',
                    borderRadius: 'var(--mantine-radius-md)',
                    border: '1px dashed var(--mantine-color-dark-4)',
                    aspectRatio: '1',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    color: 'var(--mantine-color-dark-2)',
                  }}
                >
                  {uploading ? <Loader size="xs" color="brand" /> : <IconUpload size={18} />}
                  <Text size="xs">Upload</Text>
                </Box>
              )}
            </FileButton>
          </SimpleGrid>
        )}

        <Group justify="space-between" mt="sm">
          <Button variant="subtle" color="gray" size="sm" onClick={onUseSample}>
            Use a sample instead
          </Button>
          <Button
            color="brand"
            size="md"
            loading={submitting}
            disabled={chosenCount === 0}
            onClick={handleGenerate}
          >
            Generate my free ad test →
          </Button>
        </Group>
      </Stack>
    </Container>
  )
}

// ─── Sample starter (no URL pasted): clone the demo product ────────────────────

function StarterFromSample() {
  const navigate = useNavigate()
  const activateStarterFlow = useAction(api.activation.activateStarterFlow)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleActivate() {
    setLoading(true)
    setError(null)
    try {
      sessionStorage.setItem(STARTER_MODE_KEY, 'starter')
      const { adTestId, productId } = await activateStarterFlow({})
      navigate({
        to: '/studio/$productId',
        params: { productId },
        search: { adTestId },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not activate free test. Try again.')
      setLoading(false)
    }
  }

  return (
    <Center mih="60vh">
      <Container size="xs">
        <Stack align="center" gap="lg" ta="center">
          <ThemeIcon size={56} radius="xl" color="brand" variant="light">
            <IconSparkles size={28} />
          </ThemeIcon>
          <div>
            <Title order={2} mb={8}>100 free credits — no card</Title>
            <Text c="dark.2" maw={380} mx="auto">
              We'll generate your first ad test — one concept across three
              placements — and you'll keep the rest of your free credits to
              explore.
            </Text>
          </div>
          <List size="sm" c="dark.1" spacing={6} withPadding>
            <List.Item>100 free credits (~10 ads) · no credit card</List.Item>
            <List.Item>Starter test: 1 concept × 3 placements (1:1, 4:5, 9:16)</List.Item>
            <List.Item>Preview & mark winners · Export needs a paid plan</List.Item>
          </List>
          {error && (
            <Text size="sm" c="red.4">{error}</Text>
          )}
          <Button
            color="brand"
            size="md"
            loading={loading}
            onClick={handleActivate}
          >
            Activate free test →
          </Button>
          <Text size="xs" c="dark.4">
            Want full access?{' '}
            <Button
              variant="transparent"
              size="xs"
              p={0}
              c="brand.4"
              onClick={() => navigate({ to: '/onboarding', search: { step: 3 } })}
            >
              Pick a plan instead
            </Button>
          </Text>
        </Stack>
      </Container>
    </Center>
  )
}
