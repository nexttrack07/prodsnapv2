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
  IconDownload,
  IconEqual,
  IconEraser,
  IconLayersIntersect,
  IconPalette,
  IconPhotoSpark,
  IconPhotoUp,
  IconShape3,
  IconSparkles,
  IconStack2,
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
        title: 'ProdSnap — Turn one product photo into 12 winning ad variants',
        description:
          'Browse proven Facebook ads, pick templates, generate Meta-ready ad variations in 1:1, 4:5, and 9:16. Two generation modes, surgical iteration, background removal included.',
        image: '/prodsnap_logo.png',
      }),
    ],
  }),
  component: Home,
})

const templateLibraryShot = '/landing/shots/template-library.png'
const generatedResultsShot = '/landing/shots/generated-results.png'
const variationDrawerShot = '/landing/shots/variation-drawer-controls.png'
const modeExactOutput = '/landing/shots/mode-exact-output.png'
const modeRemixOutput = '/landing/shots/mode-remix-output.png'
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
    title: 'Native ad formats',
    description:
      'Download every output as PNG, WebP, or JPG — ready for Meta Ads Manager out of the box.',
    icon: IconDownload,
  },
]

const workflowSteps = [
  {
    title: 'Upload your product',
    description: 'One photo is all we need. Background gets removed automatically.',
    icon: IconPhotoSpark,
  },
  {
    title: 'Pick up to 3 templates',
    description: 'Browse the curated library and select the ad directions you want to test.',
    icon: IconTemplate,
  },
  {
    title: 'Generate up to 12 variants',
    description: 'Choose Exact or Remix, pick an aspect ratio, hit generate. One click.',
    icon: IconStack2,
  },
  {
    title: 'Iterate on the winners',
    description: 'Vary just the text, icons, or colors on whichever output works best.',
    icon: IconLayersIntersect,
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
      'Exact mode has an "adapt product colors" toggle that lets the product blend tonally with the template. Turn it off to preserve your product palette exactly. Either way, the iteration step lets you adjust colors after the fact.',
  },
  {
    question: 'What aspect ratios do you support?',
    answer:
      'Every generation outputs in 1:1 (feed), 4:5 (feed vertical), or 9:16 (Stories & Reels). Pick before you generate. No resizing needed.',
  },
  {
    question: 'How many ads can I generate at once?',
    answer:
      'Up to 3 templates per batch with 1–4 variations per template — so up to 12 distinct ad concepts in a single click.',
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
      <Box component="section" className="landing-shell landing-hero-shell">
        <Container size="xl">
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing={48} verticalSpacing={48} className="landing-hero-grid">
            <Stack gap="xl" maw={720}>
              <Badge variant="light" color="lime" radius="xl" size="lg" w="fit-content">
                7-day free trial
              </Badge>

              <Stack gap="md">
                <Title order={1} className="landing-title">
                  One product photo. Twelve ad variants. One click.
                </Title>
                <Text className="landing-subtitle">
                  Skip the designer queue. Pick from proven Facebook ad templates, drop your product in,
                  and ship Meta-ready creative in 1:1, 4:5, and 9:16 — without leaving the tab.
                </Text>
              </Stack>

              <Stack gap="xs">
                <Group gap="md">
                  <Button
                    component={Link}
                    to="/studio"
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

      <Box component="section" className="landing-shell landing-band-alt">
        <Container size="xl">
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing={48} verticalSpacing={48}>
            <Stack gap="lg">
              <Badge variant="light" color="teal" radius="xl" w="fit-content">
                The wedge
              </Badge>
              <Title order={2} className="landing-section-title">
                Two ways to generate. Both Meta-ready.
              </Title>
              <Text className="landing-section-copy">
                Most AI ad tools give you one generation mode and one output size. ProdSnap gives you two modes
                built for different jobs — and every output ships in three Meta-ready aspect ratios.
              </Text>
              <Stack gap="md" mt="xs">
                <Box>
                  <Text size="sm" fw={700} c="white">
                    Exact
                  </Text>
                  <Text mt={4} size="sm" c="dark.1">
                    Drop your real product into the template scene as-is. Same composition, your product.
                    Optionally adapt colors to match.
                  </Text>
                </Box>
                <Box>
                  <Text size="sm" fw={700} c="white">
                    Remix
                  </Text>
                  <Text mt={4} size="sm" c="dark.1">
                    Generate a fresh scene in the same visual language. Useful when the original composition
                    doesn't fit your product.
                  </Text>
                </Box>
              </Stack>
            </Stack>

            <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="lg">
              <Stack align="center" gap="md">
                <Image
                  src={modeExactOutput}
                  alt="Exact mode output for a sample product"
                  h={380}
                  w="auto"
                  fit="contain"
                  radius="md"
                />
                <Text size="xs" tt="uppercase" fw={700} c="dark.2">
                  Exact mode
                </Text>
              </Stack>
              <Stack align="center" gap="md">
                <Image
                  src={modeRemixOutput}
                  alt="Remix mode output for the same sample product"
                  h={380}
                  w="auto"
                  fit="contain"
                  radius="md"
                />
                <Text size="xs" tt="uppercase" fw={700} c="dark.2">
                  Remix mode
                </Text>
              </Stack>
            </SimpleGrid>
          </SimpleGrid>

          <Paper className="landing-note-card" withBorder radius="md" p="lg" mt={48}>
            <Group justify="space-between" align="center" wrap="wrap" gap="lg">
              <Box>
                <Text size="xs" tt="uppercase" fw={700} c="dark.2">
                  Every output, three aspect ratios
                </Text>
                <Text mt="sm" size="sm" c="white" fw={600}>
                  Pick before you generate. No resizing in Canva.
                </Text>
              </Box>
              <Group gap="md">
                {aspectRatios.map(({ label, meaning }) => (
                  <Stack key={label} gap={4} align="center">
                    <Badge variant="light" color="brand" radius="md" size="lg">
                      {label}
                    </Badge>
                    <Text size="xs" c="dark.2">
                      {meaning}
                    </Text>
                  </Stack>
                ))}
              </Group>
            </Group>
          </Paper>
        </Container>
      </Box>

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
              in the wild. Browse the feed, pick up to three templates per batch, and generate.
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
              No upsells, no separate tools. Background removal, multi-image management, and Meta-ready exports
              come with every plan.
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
              Upload your product, pick a few proven templates, generate twelve ad variants in one click.
              Iterate on the winners. Ship.
            </Text>
            <Stack align="center" gap="xs">
              <Group gap="md">
                <Button
                  component={Link}
                  to="/studio"
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
