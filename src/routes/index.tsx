import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import {
  Badge,
  Box,
  Button,
  Container,
  Group,
  Image,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core'
import {
  IconArrowRight,
  IconBlockquote,
  IconBolt,
  IconBookmark,
  IconBrain,
  IconDownload,
  IconEqual,
  IconEraser,
  IconLayersIntersect,
  IconLibrary,
  IconPalette,
  IconPhotoSpark,
  IconPhotoUp,
  IconShape3,
  IconSparkles,
  IconStack2,
  IconStarFilled,
  IconTemplate,
  IconTextSize,
  IconWand,
  IconX,
} from '@tabler/icons-react'
import { api } from '../../convex/_generated/api'
import { HeroMediaFlow } from '~/components/landing/HeroMediaFlow'
import { seo } from '~/utils/seo'

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      ...seo({
        title: 'ProdSnap — Three paths to Meta-ready Facebook ads',
        description:
          'Browse proven templates, write a custom prompt, or generate against a marketing angle. ProdSnap turns one product photo into Meta-ready ad creative in 1:1, 4:5, and 9:16.',
        image: '/prodsnap_logo.png',
      }),
    ],
  }),
  component: Home,
})

const templateLibraryShot = '/landing/shots/template-library.png'
const generatedResultsShot = '/landing/shots/generated-results.png'
const variationDrawerShot = '/landing/shots/variation-drawer-controls.png'
const heroProductShot = '/landing/shots/hero-product-toiletry-bag-no-bg.png'
const heroTemplateShot = '/landing/shots/hero-template-selection.png'
const heroVariationShots = [
  '/landing/shots/hero-variation-exact-a.png',
  '/landing/shots/hero-variation-exact-b.png',
  '/landing/shots/hero-variation-variation.png',
]

const aspectRatios = [
  { label: '1:1', meaning: 'Feed' },
  { label: '4:5', meaning: 'Feed vertical' },
  { label: '9:16', meaning: 'Stories & Reels' },
]

const generationPaths = [
  {
    title: 'Templates',
    description:
      'Browse a curated, searchable library of proven Facebook ads. Pick up to 3 templates and drop your product in.',
    icon: IconTemplate,
  },
  {
    title: 'Custom prompt',
    description:
      'Build a prompt with smart chips — or get AI prompt suggestions tailored to your product.',
    icon: IconWand,
  },
  {
    title: 'Marketing angle',
    description:
      'We extract Comparison, Curiosity, Social Proof, and Problem-Callout angles from your product. Pick one, generate.',
    icon: IconBrain,
  },
]

const iterationAxes = [
  {
    title: 'Just the text',
    description: 'New headlines, body copy, and messaging. Keep the visual identical.',
    icon: IconTextSize,
  },
  {
    title: 'Just the icons',
    description: 'Replace badges, callouts, and decorative graphics. Preserve the layout.',
    icon: IconShape3,
  },
  {
    title: 'Just the colors',
    description: 'Adjust palette and tone. Keep the composition you already approved.',
    icon: IconPalette,
  },
]

const includedFeatures = [
  {
    title: 'Background removal',
    description:
      'Upload any product photo. We strip the background automatically — no Photoshop, no extra tool, no extra credit.',
    icon: IconEraser,
  },
  {
    title: 'Multiple product photos',
    description:
      'Front, side, lifestyle. Upload as many angles as you want and pick which one drives each generation.',
    icon: IconPhotoUp,
  },
  {
    title: 'Per-product brand kits',
    description:
      "Colors, fonts, voice — per product. Useful when you're running multiple brands or running ads for clients.",
    icon: IconPalette,
  },
  {
    title: 'Native ad formats',
    description:
      'Download every output as PNG, WebP, or JPG — ready for Meta Ads Manager out of the box.',
    icon: IconDownload,
  },
  {
    title: 'Two AI models',
    description:
      'Pick nano-banana-2 (fast, default) or gpt-image-2 (higher quality, slower) per generation.',
    icon: IconBolt,
  },
]

const workflowSteps = [
  {
    title: 'Add your product',
    description:
      'Paste a URL or upload a photo. Background gets removed automatically. We analyze the product.',
    icon: IconPhotoSpark,
  },
  {
    title: 'Pick your path',
    description:
      'Browse templates, write a custom prompt, or pick a marketing angle. Mix and match across batches.',
    icon: IconStack2,
  },
  {
    title: 'Generate',
    description:
      'Choose your aspect ratio (1:1, 4:5, 9:16). Up to 12 distinct ads from a single batch.',
    icon: IconSparkles,
  },
  {
    title: 'Star winners and iterate',
    description:
      'Mark the ads that work. Vary just the text, icons, or colors on the winners. Ship.',
    icon: IconStarFilled,
  },
]

const faqs = [
  {
    question: 'Will my product actually look right?',
    answer:
      'We analyze your product before generating. Then you pick: Exact mode places your real product photo into the template scene (best for fidelity), or Remix mode creates a new scene in the same style. Use Exact when accuracy matters most.',
  },
  {
    question: 'What about my brand colors?',
    answer:
      'Each product has its own brand kit — colors, fonts, and voice. Exact mode also has an "adapt product colors" toggle that lets the product blend tonally with the template. Either way, the iteration step lets you adjust colors after the fact.',
  },
  {
    question: 'What aspect ratios do you support?',
    answer:
      'Every generation outputs in 1:1 (feed), 4:5 (feed vertical), or 9:16 (Stories & Reels). Pick before you generate. No resizing needed.',
  },
  {
    question: 'How many ads can I generate at once?',
    answer:
      'Up to 12 distinct ad concepts in a single batch — whether you use templates (up to 3 templates × 1–4 variations), a custom prompt, or a marketing angle. Each path produces Meta-ready output in your chosen aspect ratio.',
  },
  {
    question: 'What does "iterate" actually do?',
    answer:
      "Pick any generated ad and tell us exactly what to change: just the text, just the icons, just the colors, or any combination. The rest stays locked. It's surgical, not regenerate-everything-and-pray.",
  },
  {
    question: 'Do you handle multiple products?',
    answer:
      'Yes. Manage as many products as your plan allows, each with multiple photos. Set a primary image per product and switch between them anytime.',
  },
  {
    question: 'How do marketing angles work?',
    answer:
      'We analyze your product and surface 3–5 distinct angles a media buyer would test (Comparison, Curiosity, Social Proof, Problem Callout). Pick one and generate ads tuned for that angle.',
  },
  {
    question: 'Can I write my own prompts?',
    answer:
      'Yes. Pick Custom in the wizard. Build a prompt with smart chips, or use our AI suggestions — both tailored to your product.',
  },
  {
    question: "What's the inspiration / swipe file?",
    answer:
      "Save reference ads per product (from our template library or any URL). When you generate, we use them as visual references so output rhymes with what's already winning.",
  },
  {
    question: 'Can ProdSnap learn how my customers talk?',
    answer:
      'Yes. Paste customer phrases per product (reviews, testimonials). The generator uses that voice when writing copy.',
  },
  {
    question: 'Do you support multiple brands?',
    answer:
      'Yes. Each product can have its own brand kit (colors, fonts, voice). Useful for agencies or anyone running two or more brands.',
  },
  {
    question: 'Which AI image model do you use?',
    answer:
      'We support both nano-banana-2 (fast, default) and gpt-image-2 (higher quality, slower). Pick per-generation.',
  },
  {
    question: 'Is there a free trial?',
    answer:
      "Yes — 7 days with full access on every paid plan. We do require a card upfront to prevent abuse, but you won't be charged if you cancel before day 7. You can cancel from your account page in two clicks.",
  },
]

const fallbackTemplateCarouselItems = [
  { title: 'UGC Hook', meta: 'Winning template', image: templateLibraryShot },
  { title: 'Before / After', meta: 'Curated ad', image: templateLibraryShot },
  { title: 'Product Demo', meta: 'Top performer', image: templateLibraryShot },
  { title: 'Founder Story', meta: 'Facebook ad', image: templateLibraryShot },
  { title: 'Benefit Stack', meta: 'Handpicked creative', image: templateLibraryShot },
  { title: 'Visual Comparison', meta: 'Proven concept', image: templateLibraryShot },
]

interface PlaceholderShotProps {
  label: string
  ratio?: string
}

function PlaceholderShot({ label, ratio = '4 / 3' }: PlaceholderShotProps) {
  return (
    <Box
      style={{
        aspectRatio: ratio,
        border: '2px dashed var(--mantine-color-dark-4)',
        borderRadius: 'var(--mantine-radius-md)',
        background: 'linear-gradient(135deg, var(--mantine-color-dark-7) 0%, var(--mantine-color-dark-8) 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 24,
      }}
    >
      <Text size="xs" tt="uppercase" fw={700} c="dark.3" ta="center">
        Screenshot placeholder
      </Text>
      <Text size="sm" c="dark.2" ta="center">
        {label}
      </Text>
    </Box>
  )
}

function Home() {
  const { data: templatePage } = useQuery(convexQuery(api.products.listTemplates, { limit: 8 }))
  const { data: templateCount } = useQuery(convexQuery(api.products.countPublishedTemplates, {}))

  const templateCarouselItems =
    templatePage?.items.length
      ? templatePage.items.map((template) => ({
          key: template._id,
          title: [template.imageStyle, template.setting].filter(Boolean).join(' · ') || 'Ad template',
          meta: template.productCategory || 'Published template',
          image: template.thumbnailUrl || template.imageUrl,
        }))
      : fallbackTemplateCarouselItems.map((item) => ({
          key: `${item.title}-${item.meta}`,
          ...item,
        }))

  return (
    <Box className="landing-page">
      {/* Hero */}
      <Box component="section" className="landing-shell landing-hero-shell">
        <Container size="xl">
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing={48} verticalSpacing={48} className="landing-hero-grid">
            <Stack gap="xl" maw={720}>
              <Badge variant="light" color="lime" radius="xl" size="lg" w="fit-content">
                7-day free trial
              </Badge>

              <Stack gap="md">
                <Title order={1} className="landing-title">
                  Three paths to a winning ad. One product photo. One click.
                </Title>
                <Text className="landing-subtitle">
                  Templates. Custom prompts. Marketing angles. Pick your path, drop your product in, and ship
                  Meta-ready creative in 1:1, 4:5, 9:16 — without leaving the tab.
                </Text>
              </Stack>

              <Stack gap="xs">
                <Group gap="md">
                  <Button
                    component={Link}
                    to="/home"
                    color="brand"
                    size="xl"
                    fz="sm"
                    rightSection={<IconArrowRight size={18} />}
                  >
                    Start your 7-day free trial
                  </Button>
                  <Button component={Link} to="/pricing" variant="default" size="xl" fz="sm">
                    See pricing
                  </Button>
                </Group>
                <Text size="xs" c="dark.2">
                  Full access for 7 days. Cancel before day 7 and you won't be charged.
                </Text>
              </Stack>
            </Stack>

            <HeroMediaFlow
              productShot={heroProductShot}
              templateShot={heroTemplateShot}
              variationShots={heroVariationShots}
            />
          </SimpleGrid>
        </Container>
      </Box>

      {/* Three paths section */}
      <Box component="section" className="landing-shell landing-band-alt">
        <Container size="xl">
          <Stack gap="md" mb="xl" maw={760}>
            <Badge variant="light" color="teal" radius="xl" w="fit-content">
              Three ways to generate
            </Badge>
            <Title order={2} className="landing-section-title">
              Pick a path. Any path. They all ship Meta-ready creative.
            </Title>
            <Text className="landing-section-copy">
              Most tools give you one generation mode. ProdSnap gives you three — each built for a different
              job. Start with the one that fits how you think today.
            </Text>
          </Stack>

          <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
            {generationPaths.map(({ title, description, icon: Icon }) => (
              <Paper key={title} className="landing-feature-card" withBorder radius="md" p="xl">
                <ThemeIcon size={44} radius="md" color="teal" variant="light">
                  <Icon size={20} />
                </ThemeIcon>
                <Text mt="lg" size="lg" fw={600} c="white">
                  {title}
                </Text>
                <Text mt="sm" size="sm" c="dark.2">
                  {description}
                </Text>
              </Paper>
            ))}
          </SimpleGrid>
        </Container>
      </Box>

      {/* Strategy / angles section */}
      <Box component="section" className="landing-shell">
        <Container size="xl">
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing={48} verticalSpacing={48}>
            <Stack gap="lg">
              <Badge variant="light" color="grape" radius="xl" w="fit-content">
                Marketing strategy
              </Badge>
              <Title order={2} className="landing-section-title">
                Generate against a media buyer's angle.
              </Title>
              <Text className="landing-section-copy">
                We analyze your product and surface 3–5 distinct angles a media buyer would test. Pick one
                and generate ads tuned for that angle — without writing a single brief.
              </Text>
              <Stack gap="md" mt="xs">
                <Box>
                  <Text size="sm" fw={700} c="white">Comparison</Text>
                  <Text mt={4} size="sm" c="dark.1">Position your product against the category norm or a named alternative.</Text>
                </Box>
                <Box>
                  <Text size="sm" fw={700} c="white">Curiosity</Text>
                  <Text mt={4} size="sm" c="dark.1">Lead with an intriguing hook that makes the scroll stop.</Text>
                </Box>
                <Box>
                  <Text size="sm" fw={700} c="white">Social Proof</Text>
                  <Text mt={4} size="sm" c="dark.1">Lead with results, numbers, and customer language.</Text>
                </Box>
                <Box>
                  <Text size="sm" fw={700} c="white">Problem Callout</Text>
                  <Text mt={4} size="sm" c="dark.1">Name the pain, then frame your product as the obvious fix.</Text>
                </Box>
              </Stack>
            </Stack>

            <PlaceholderShot label="Strategy panel: extracted angles for a product" />
          </SimpleGrid>
        </Container>
      </Box>

      {/* Voice of customer section */}
      <Box component="section" className="landing-shell landing-band-alt">
        <Container size="xl">
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing={48} verticalSpacing={48}>
            <Stack gap="lg">
              <Badge variant="light" color="orange" radius="xl" w="fit-content">
                Voice of customer
              </Badge>
              <Title order={2} className="landing-section-title">
                Ad copy that sounds like your customer, not like an AI.
              </Title>
              <Text className="landing-section-copy">
                Paste reviews. Type the phrases your customers actually use. ProdSnap captures them per
                product and turns them into ad copy that speaks the language your buyer already trusts.
              </Text>
              <Stack gap="xs">
                <Group gap="xs" align="center">
                  <IconBlockquote size={16} color="var(--mantine-color-orange-4)" />
                  <Text size="sm" c="dark.1">"Works better than anything I've tried"</Text>
                </Group>
                <Group gap="xs" align="center">
                  <IconBlockquote size={16} color="var(--mantine-color-orange-4)" />
                  <Text size="sm" c="dark.1">"Finally doesn't smell like chemicals"</Text>
                </Group>
                <Group gap="xs" align="center">
                  <IconBlockquote size={16} color="var(--mantine-color-orange-4)" />
                  <Text size="sm" c="dark.1">"My kids actually eat it"</Text>
                </Group>
                <Text size="xs" c="dark.3" mt="xs">
                  Real phrases captured per product → fed into every generation.
                </Text>
              </Stack>
            </Stack>

            <PlaceholderShot label="Customer voice: real phrases captured per product" />
          </SimpleGrid>
        </Container>
      </Box>

      {/* Inspiration / swipe file section */}
      <Box component="section" className="landing-shell">
        <Container size="xl">
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing={48} verticalSpacing={48}>
            <Stack gap="lg">
              <Badge variant="light" color="cyan" radius="xl" w="fit-content">
                Swipe file
              </Badge>
              <Title order={2} className="landing-section-title">
                Save what's winning. Generate in that direction.
              </Title>
              <Text className="landing-section-copy">
                Save the ads that work — from our template library or any URL. We use them as visual
                references when you generate, so the output rhymes with what's already winning in
                your category.
              </Text>
              <Stack gap="sm">
                <Group gap="sm" align="center">
                  <ThemeIcon size={32} radius="md" color="cyan" variant="light">
                    <IconBookmark size={16} />
                  </ThemeIcon>
                  <Text size="sm" c="dark.1">Save templates directly from the library</Text>
                </Group>
                <Group gap="sm" align="center">
                  <ThemeIcon size={32} radius="md" color="cyan" variant="light">
                    <IconBookmark size={16} />
                  </ThemeIcon>
                  <Text size="sm" c="dark.1">Paste any competitor or reference URL</Text>
                </Group>
                <Group gap="sm" align="center">
                  <ThemeIcon size={32} radius="md" color="cyan" variant="light">
                    <IconBookmark size={16} />
                  </ThemeIcon>
                  <Text size="sm" c="dark.1">Per-product — each product has its own swipe file</Text>
                </Group>
              </Stack>
            </Stack>

            <PlaceholderShot label="Inspiration: saved templates and competitor URLs" />
          </SimpleGrid>
        </Container>
      </Box>

      {/* Template feed marquee */}
      <Box component="section" className="landing-shell landing-rail-shell">
        <Container size="xl">
          <Stack gap="md" mb="xl" maw={760}>
            <Group gap="sm">
              <Badge variant="light" color="teal" radius="xl" w="fit-content">
                Template feed
              </Badge>
              {templateCount?.count ? (
                <Badge variant="outline" color="gray" radius="xl">
                  {templateCount.count} proven templates · growing weekly
                </Badge>
              ) : null}
            </Group>
            <Title order={2} className="landing-section-title">
              A curated wall of proven ad directions.
            </Title>
            <Text className="landing-section-copy">
              Skip the guesswork. Every template is hand-picked from Facebook ads that have already proven themselves
              in the wild. Search and filter by category, style, setting, or aspect ratio — then pick up to three
              templates per batch and generate.
            </Text>
          </Stack>

          <Box className="landing-marquee">
            <Box className="landing-marquee-track">
              {[...templateCarouselItems, ...templateCarouselItems].map(({ key, title, meta, image }, index) => (
                <Paper key={`${key}-${index}`} className="landing-rail-card" withBorder radius="md" p="sm">
                  <Image src={image} alt={`${title} placeholder`} radius="md" />
                  <Text mt="md" size="xs" tt="uppercase" fw={700} c="dark.2">
                    {meta}
                  </Text>
                  <Text mt={6} size="sm" fw={600} c="white">
                    {title}
                  </Text>
                </Paper>
              ))}
            </Box>
          </Box>
        </Container>
      </Box>

      {/* One photo. Three templates. Twelve ads. */}
      <Box component="section" className="landing-shell landing-band-alt">
        <Container size="xl">
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing={48} verticalSpacing={48}>
            <Stack gap="lg">
              <Badge variant="light" color="lime" radius="xl" w="fit-content">
                One click
              </Badge>
              <Title order={2} className="landing-section-title">
                One photo. Three templates. Twelve ads.
              </Title>
              <Text className="landing-section-copy">
                Pick up to three templates per batch and choose 1–4 variations per template. That's up to twelve
                distinct ad concepts in a single generation — without rebuilding the creative direction once.
              </Text>

              <Group gap="sm" wrap="nowrap" align="center">
                <Paper
                  className="landing-proof-card"
                  withBorder
                  radius="md"
                  p="sm"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    minHeight: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text size="xl" fw={700} c="white">3</Text>
                  <Text size="xs" tt="uppercase" fw={700} c="dark.2" mt={4}>
                    Templates
                  </Text>
                </Paper>
                <IconX size={20} stroke={2.5} color="var(--mantine-color-dark-2)" />
                <Paper
                  className="landing-proof-card"
                  withBorder
                  radius="md"
                  p="sm"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    minHeight: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text size="xl" fw={700} c="white">4</Text>
                  <Text size="xs" tt="uppercase" fw={700} c="dark.2" mt={4}>
                    Variants
                  </Text>
                </Paper>
                <IconEqual size={20} stroke={2.5} color="var(--mantine-color-dark-2)" />
                <Paper
                  className="landing-proof-card"
                  withBorder
                  radius="md"
                  p="sm"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    minHeight: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text size="xl" fw={700} c="white">12</Text>
                  <Text size="xs" tt="uppercase" fw={700} c="dark.2" mt={4}>
                    Ads
                  </Text>
                </Paper>
              </Group>
            </Stack>

            <Image
              src={generatedResultsShot}
              alt="Twelve ad variations generated from one product photo and three templates"
              radius="md"
            />
          </SimpleGrid>
        </Container>
      </Box>

      {/* Surgical iteration */}
      <Box component="section" className="landing-shell">
        <Container size="xl">
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing={48} verticalSpacing={48}>
            <Stack gap="lg">
              <Badge variant="outline" color="gray" radius="xl" w="fit-content">
                Surgical iteration
              </Badge>
              <Title order={2} className="landing-section-title">
                Change what's not working. Keep what is.
              </Title>
              <Text className="landing-section-copy">
                Found an output that's almost right? Tell us exactly what to vary — and we preserve everything else.
                No "regenerate everything and pray" loop.
              </Text>
              <Stack gap="md" mt="xs">
                {iterationAxes.map(({ title, description }) => (
                  <Box key={title}>
                    <Text size="sm" fw={700} c="white">
                      {title}
                    </Text>
                    <Text mt={4} size="sm" c="dark.1">
                      {description}
                    </Text>
                  </Box>
                ))}
              </Stack>
            </Stack>

            <Box mx="auto" maw={320}>
              <Image
                src={variationDrawerShot}
                alt="ProdSnap variation drawer showing text, icons, and colors as independent change options"
                radius="md"
              />
            </Box>
          </SimpleGrid>
        </Container>
      </Box>

      {/* Library + Winners section */}
      <Box component="section" className="landing-shell landing-band-alt">
        <Container size="xl">
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing={48} verticalSpacing={48}>
            <Stack gap="lg">
              <Badge variant="light" color="yellow" radius="xl" w="fit-content">
                Library
              </Badge>
              <Title order={2} className="landing-section-title">
                Star winners. Filter by them. Iterate on what works.
              </Title>
              <Text className="landing-section-copy">
                Every generation lands in your cross-product library. Star the winners, filter by winners,
                iterate on what works. The full ship→tag→iterate loop — in one place.
              </Text>
              <Stack gap="sm">
                <Group gap="sm" align="center">
                  <ThemeIcon size={32} radius="md" color="yellow" variant="light">
                    <IconLibrary size={16} />
                  </ThemeIcon>
                  <Text size="sm" c="dark.1">All generations across all products in one view</Text>
                </Group>
                <Group gap="sm" align="center">
                  <ThemeIcon size={32} radius="md" color="yellow" variant="light">
                    <IconStarFilled size={16} />
                  </ThemeIcon>
                  <Text size="sm" c="dark.1">Star winners and filter to only see them</Text>
                </Group>
                <Group gap="sm" align="center">
                  <ThemeIcon size={32} radius="md" color="yellow" variant="light">
                    <IconLayersIntersect size={16} />
                  </ThemeIcon>
                  <Text size="sm" c="dark.1">Iterate on any starred ad without starting from scratch</Text>
                </Group>
              </Stack>
            </Stack>

            <PlaceholderShot label="Generation library with starred winners" ratio="16 / 10" />
          </SimpleGrid>
        </Container>
      </Box>

      {/* Included */}
      <Box component="section" className="landing-shell">
        <Container size="xl">
          <Stack gap="md" mb="xl" maw={760}>
            <Badge variant="light" color="lime" radius="xl" w="fit-content">
              Included
            </Badge>
            <Title order={2} className="landing-section-title">
              The little things that usually cost extra.
            </Title>
            <Text className="landing-section-copy">
              No upsells, no separate tools. Background removal, brand kits, multi-image management,
              and Meta-ready exports come with every plan.
            </Text>
          </Stack>

          <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
            {includedFeatures.map(({ title, description, icon: Icon }) => (
              <Paper key={title} className="landing-feature-card" withBorder radius="md" p="xl">
                <ThemeIcon size={44} radius="md" color="teal" variant="light">
                  <Icon size={20} />
                </ThemeIcon>
                <Text mt="lg" size="lg" fw={600} c="white">
                  {title}
                </Text>
                <Text mt="sm" size="sm" c="dark.2">
                  {description}
                </Text>
              </Paper>
            ))}
          </SimpleGrid>
        </Container>
      </Box>

      {/* How it works */}
      <Box component="section" className="landing-shell landing-band-alt">
        <Container size="xl">
          <Stack gap="md" mb="xl" maw={760}>
            <Badge variant="outline" color="gray" radius="xl" w="fit-content">
              How it works
            </Badge>
            <Title order={2} className="landing-section-title">
              From product photo to ad variations in under a minute.
            </Title>
          </Stack>

          <SimpleGrid cols={{ base: 1, md: 2, xl: 4 }} spacing="lg">
            {workflowSteps.map(({ title, description, icon: Icon }, index) => (
              <Paper key={title} className="landing-process-card" withBorder radius="md" p="lg">
                <Group gap="sm">
                  <ThemeIcon size={40} radius="md" color="teal" variant="light">
                    <Icon size={18} />
                  </ThemeIcon>
                  <Text size="xs" tt="uppercase" fw={700} c="dark.2">
                    Step {index + 1}
                  </Text>
                </Group>
                <Text mt="lg" size="md" fw={600} c="white">
                  {title}
                </Text>
                <Text mt="sm" size="sm" c="dark.2">
                  {description}
                </Text>
              </Paper>
            ))}
          </SimpleGrid>
        </Container>
      </Box>

      {/* FAQs */}
      <Box component="section" className="landing-shell">
        <Container size="md">
          <Stack gap="md" mb="xl">
            <Badge variant="outline" color="gray" radius="xl" w="fit-content">
              Questions
            </Badge>
            <Title order={2} className="landing-section-title">
              Things people ask before signing up.
            </Title>
          </Stack>

          <Stack gap="md">
            {faqs.map(({ question, answer }) => (
              <Paper key={question} className="landing-note-card" withBorder radius="md" p="lg">
                <Text size="md" fw={600} c="white">
                  {question}
                </Text>
                <Text mt="sm" size="sm" c="dark.1">
                  {answer}
                </Text>
              </Paper>
            ))}
          </Stack>
        </Container>
      </Box>

      {/* Final CTA */}
      <Box component="section" className="landing-shell landing-cta-band">
        <Container size="lg">
          <Stack align="center" ta="center" gap="lg">
            <Badge variant="light" color="teal" radius="xl">
              Ready to ship
            </Badge>
            <Title order={2} className="landing-cta-title">
              Stop staring at the blank page. Start with what's already winning.
            </Title>
            <Text className="landing-section-copy" maw={680}>
              Pick a path — templates, custom prompt, or marketing angle. Drop your product in, generate
              up to twelve ad variants, star the winners, and iterate. All in one tab.
            </Text>
            <Stack align="center" gap="xs">
              <Group gap="md">
                <Button
                  component={Link}
                  to="/home"
                  color="brand"
                  size="xl"
                  fz="sm"
                  rightSection={<IconArrowRight size={18} />}
                >
                  Start your 7-day free trial
                </Button>
                <Button component={Link} to="/pricing" variant="default" size="xl" fz="sm">
                  See pricing
                </Button>
              </Group>
              <Text size="xs" c="dark.2">
                Card required to start. Cancel before day 7 and you won't be charged.
              </Text>
            </Stack>
          </Stack>
        </Container>
      </Box>
    </Box>
  )
}
