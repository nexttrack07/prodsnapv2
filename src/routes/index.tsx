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
  IconBolt,
  IconBrain,
  IconDownload,
  IconEraser,
  IconLayersIntersect,
  IconPalette,
  IconPhotoSpark,
  IconPhotoUp,
  IconSparkles,
  IconStack2,
  IconStarFilled,
  IconTemplate,
  IconWand,
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
const variationDrawerShot = '/landing/shots/variation-drawer-controls.png'
const heroProductShot = '/landing/shots/hero-product-toiletry-bag-no-bg.png'
const heroTemplateShot = '/landing/shots/hero-template-selection.png'
const heroVariationShots = [
  '/landing/shots/hero-variation-exact-a.png',
  '/landing/shots/hero-variation-exact-b.png',
  '/landing/shots/hero-variation-variation.png',
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
    title: 'Native ad formats',
    description:
      'Download every output as PNG, WebP, or JPG — ready for Meta Ads Manager out of the box.',
    icon: IconDownload,
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

      {/* ── 1. Hero ──────────────────────────────────────────────────── */}
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
                  Templates, custom prompts, and marketing angles — all Meta-ready in 1:1, 4:5, and 9:16.
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

      {/* ── 2. Three paths cards ─────────────────────────────────────── */}
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
              Most tools give you one generation mode. ProdSnap gives you three — each built for a
              different job.
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

      {/* ── 3. Templates ─────────────────────────────────────────────── */}
      <Box component="section" className="landing-shell">
        <Container size="xl">
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing={48} verticalSpacing={48}>
            <Stack gap="lg" justify="center">
              <Title order={2} className="landing-section-title">
                Stop staring at the blank page.
              </Title>
              <Text size="lg" c="dark.1" mt={4}>
                Start with what's already winning.
              </Text>
              <Text className="landing-section-copy">
                Hundreds of curated Facebook ad templates, searchable by category, style, setting,
                and angle. Pick up to three per batch.
              </Text>
              <Box>
                <Button
                  component={Link}
                  to="/templates"
                  variant="default"
                  rightSection={<IconArrowRight size={16} />}
                >
                  Browse the library →
                </Button>
              </Box>
            </Stack>

            <Image
              src={templateLibraryShot}
              alt="ProdSnap template library"
              radius="md"
            />
          </SimpleGrid>
        </Container>
      </Box>

      {/* ── 4. Custom prompts ────────────────────────────────────────── */}
      <Box component="section" className="landing-shell landing-band-alt">
        <Container size="xl">
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing={48} verticalSpacing={48}>
            <Stack gap="lg" justify="center">
              <Title order={2} className="landing-section-title">
                Stop fighting prompt engineering.
              </Title>
              <Text size="lg" c="dark.1" mt={4}>
                Tell us what you want, in plain English.
              </Text>
              <Text className="landing-section-copy">
                Build a prompt with smart chips, or get AI suggestions tailored to your product.
                No prompt-tuning required.
              </Text>
              <Box>
                <Button
                  component={Link}
                  to="/home"
                  variant="default"
                  rightSection={<IconArrowRight size={16} />}
                >
                  Try a custom prompt →
                </Button>
              </Box>
            </Stack>

            <PlaceholderShot label="Custom prompt builder with AI suggestions" />
          </SimpleGrid>
        </Container>
      </Box>

      {/* ── 5. Marketing angles ──────────────────────────────────────── */}
      <Box component="section" className="landing-shell">
        <Container size="xl">
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing={48} verticalSpacing={48}>
            <Stack gap="lg" justify="center">
              <Title order={2} className="landing-section-title">
                Stop guessing the angle.
              </Title>
              <Text size="lg" c="dark.1" mt={4}>
                We extract them for you.
              </Text>
              <Text className="landing-section-copy">
                ProdSnap analyzes your product and surfaces the angles a media buyer would test —
                Comparison, Curiosity, Social Proof, Problem Callout. Pick one and generate.
              </Text>
              <Box>
                <Button
                  component={Link}
                  to="/home"
                  variant="default"
                  rightSection={<IconArrowRight size={16} />}
                >
                  See how angles work →
                </Button>
              </Box>
            </Stack>

            <PlaceholderShot label="Strategy panel: extracted angles for a product" />
          </SimpleGrid>
        </Container>
      </Box>

      {/* ── 6. Voice of customer ─────────────────────────────────────── */}
      <Box component="section" className="landing-shell landing-band-alt">
        <Container size="xl">
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing={48} verticalSpacing={48}>
            <Stack gap="lg" justify="center">
              <Title order={2} className="landing-section-title">
                Stop sounding like AI.
              </Title>
              <Text size="lg" c="dark.1" mt={4}>
                Sound like your customers.
              </Text>
              <Text className="landing-section-copy">
                Paste real reviews, testimonials, and the phrases your customers actually use.
                ProdSnap weaves them into the ad copy.
              </Text>
              <Box>
                <Button
                  component={Link}
                  to="/home"
                  variant="default"
                  rightSection={<IconArrowRight size={16} />}
                >
                  Capture customer language →
                </Button>
              </Box>
            </Stack>

            <PlaceholderShot label="Customer voice: real phrases captured per product" />
          </SimpleGrid>
        </Container>
      </Box>

      {/* ── 7. Inspiration / swipe file ──────────────────────────────── */}
      <Box component="section" className="landing-shell">
        <Container size="xl">
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing={48} verticalSpacing={48}>
            <Stack gap="lg" justify="center">
              <Title order={2} className="landing-section-title">
                Stop reinventing the wheel.
              </Title>
              <Text size="lg" c="dark.1" mt={4}>
                Save what works. We riff on it.
              </Text>
              <Text className="landing-section-copy">
                Bookmark proven ads from our library or paste competitor URLs. We use them as
                visual references when you generate, so output rhymes with what already works.
              </Text>
              <Box>
                <Button
                  component={Link}
                  to="/home"
                  variant="default"
                  rightSection={<IconArrowRight size={16} />}
                >
                  Build your swipe file →
                </Button>
              </Box>
            </Stack>

            <PlaceholderShot label="Inspiration: saved templates and competitor URLs" />
          </SimpleGrid>
        </Container>
      </Box>

      {/* ── 8. Template marquee ──────────────────────────────────────── */}
      <Box component="section" className="landing-shell landing-rail-shell landing-band-alt">
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
              Every template is hand-picked from Facebook ads that have already proven themselves.
              Search by category, style, setting, or aspect ratio — then pick up to three per batch.
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

      {/* ── 9. Surgical iteration ────────────────────────────────────── */}
      <Box component="section" className="landing-shell">
        <Container size="xl">
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing={48} verticalSpacing={48}>
            <Stack gap="lg" justify="center">
              <Title order={2} className="landing-section-title">
                Stop regenerating and praying.
              </Title>
              <Text size="lg" c="dark.1" mt={4}>
                Change one thing at a time.
              </Text>
              <Text className="landing-section-copy">
                Found an output that's almost right? Tell us exactly what to vary — just the text,
                just the icons, just the colors — and we lock everything else.
              </Text>
              <Box>
                <Button
                  component={Link}
                  to="/home"
                  variant="default"
                  rightSection={<IconArrowRight size={16} />}
                >
                  See how it works →
                </Button>
              </Box>
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

      {/* ── 10. Library + Winners ────────────────────────────────────── */}
      <Box component="section" className="landing-shell landing-band-alt">
        <Container size="xl">
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing={48} verticalSpacing={48}>
            <Stack gap="lg" justify="center">
              <Title order={2} className="landing-section-title">
                Stop losing track of winners.
              </Title>
              <Text size="lg" c="dark.1" mt={4}>
                Tag, filter, iterate.
              </Text>
              <Text className="landing-section-copy">
                Every generation lands in your cross-product library. Star the winners, filter by
                them, build on what's already converting.
              </Text>
              <Box>
                <Button
                  component={Link}
                  to="/home"
                  variant="default"
                  rightSection={<IconArrowRight size={16} />}
                >
                  See the library →
                </Button>
              </Box>
            </Stack>

            <PlaceholderShot label="Generation library with starred winners" ratio="16 / 10" />
          </SimpleGrid>
        </Container>
      </Box>

      {/* ── 11. Multi-brand ──────────────────────────────────────────── */}
      <Box component="section" className="landing-shell">
        <Container size="xl">
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing={48} verticalSpacing={48}>
            <Stack gap="lg" justify="center">
              <Title order={2} className="landing-section-title">
                Stop adapting one brand at a time.
              </Title>
              <Text size="lg" c="dark.1" mt={4}>
                Brand kit per product.
              </Text>
              <Text className="landing-section-copy">
                Run multiple brands? Each product gets its own colors, fonts, and voice. Switch
                contexts without losing settings.
              </Text>
              <Box>
                <Button
                  component={Link}
                  to="/home"
                  variant="default"
                  rightSection={<IconArrowRight size={16} />}
                >
                  See multi-brand →
                </Button>
              </Box>
            </Stack>

            <PlaceholderShot label="Brand kit picker" />
          </SimpleGrid>
        </Container>
      </Box>

      {/* ── 12. Two AI models ────────────────────────────────────────── */}
      <Box component="section" className="landing-shell landing-band-alt">
        <Container size="xl">
          <Stack gap="md" mb="xl" maw={760}>
            <Title order={2} className="landing-section-title">
              Stop choosing between fast and beautiful.
            </Title>
            <Text size="lg" c="dark.1" mt={4}>
              Pick your model per generation.
            </Text>
          </Stack>

          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" maw={640}>
            <Paper className="landing-feature-card" withBorder radius="md" p="xl">
              <ThemeIcon size={44} radius="md" color="teal" variant="light">
                <IconBolt size={20} />
              </ThemeIcon>
              <Text mt="lg" size="lg" fw={600} c="white">
                nano-banana-2
              </Text>
              <Text mt={4} size="xs" tt="uppercase" fw={700} c="teal.4">
                Fast · Default
              </Text>
              <Text mt="sm" size="sm" c="dark.2">
                Snappy generations for iteration and testing. Ship volume, find the winner.
              </Text>
            </Paper>
            <Paper className="landing-feature-card" withBorder radius="md" p="xl">
              <ThemeIcon size={44} radius="md" color="grape" variant="light">
                <IconSparkles size={20} />
              </ThemeIcon>
              <Text mt="lg" size="lg" fw={600} c="white">
                gpt-image-2
              </Text>
              <Text mt={4} size="xs" tt="uppercase" fw={700} c="grape.4">
                High quality · Slower
              </Text>
              <Text mt="sm" size="sm" c="dark.2">
                When fidelity matters — hero shots, launch creative, or anything client-facing.
              </Text>
            </Paper>
          </SimpleGrid>
        </Container>
      </Box>

      {/* ── 13. Included ─────────────────────────────────────────────── */}
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
              No upsells, no separate tools. Background removal, multi-image management, and
              Meta-ready exports come with every plan.
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

      {/* ── 14. How it works ─────────────────────────────────────────── */}
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

      {/* ── 15. FAQs ─────────────────────────────────────────────────── */}
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

      {/* ── 16. Final CTA ────────────────────────────────────────────── */}
      <Box component="section" className="landing-shell landing-cta-band">
        <Container size="lg">
          <Stack align="center" ta="center" gap="lg">
            <Badge variant="light" color="teal" radius="xl">
              Ready to ship
            </Badge>
            <Title order={2} className="landing-cta-title">
              Stop staring at the blank page.
            </Title>
            <Text size="lg" c="dark.1">
              Start with what's already winning.
            </Text>
            <Text className="landing-section-copy" maw={560}>
              Pick a path, drop your product in, generate up to twelve ad variants, star the
              winners, and iterate. All in one tab.
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
