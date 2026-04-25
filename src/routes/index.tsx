import { Link, createFileRoute } from '@tanstack/react-router'
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
  IconCopyPlus,
  IconFilter,
  IconLayersIntersect,
  IconPhotoSpark,
  IconSearch,
  IconSparkles,
  IconStack2,
  IconTemplate,
  IconVideo,
} from '@tabler/icons-react'
import { HeroMediaFlow } from '~/components/landing/HeroMediaFlow'
import { seo } from '~/utils/seo'

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      ...seo({
        title: 'ProdSnap — Browse proven Facebook ads and generate your product into them',
        description:
          'Upload your product photo, browse thousands of curated proven Facebook ads, pick a template, and generate multiple variations in one click.',
        image: '/prodsnap_logo.png',
      }),
    ],
  }),
  component: Home,
})

function placeholder(width: number, height: number, text: string, bg = '0d0d0d', fg = 'f5f5f5') {
  return `https://placehold.co/${width}x${height}/${bg}/${fg}?text=${encodeURIComponent(text)}`
}

const templateLibraryShot = '/landing/shots/template-library.png'
const generatedResultsShot = '/landing/shots/generated-results.png'
const heroProductShot = '/landing/shots/hero-product-toiletry-bag-no-bg.png'
const heroTemplateShot = '/landing/shots/hero-template-selection.png'
const heroVariationShots = [
  '/landing/shots/hero-variation-exact-a.png',
  '/landing/shots/hero-variation-exact-b.png',
  '/landing/shots/hero-variation-variation.png',
]

const proofPoints = [
  {
    title: '1000s of curated templates',
    description: 'Browse handpicked, proven Facebook ads instead of digging through noisy inspiration feeds.',
    icon: IconTemplate,
  },
  {
    title: 'Search, filter, and sort',
    description: 'Find the right ad direction fast by narrowing down the library to what fits your product.',
    icon: IconFilter,
  },
  {
    title: 'Generate multiple variations at once',
    description: 'Pick a template and create several on-brand outputs for your product in a single click.',
    icon: IconStack2,
  },
  {
    title: 'Variation of variations',
    description: 'Take a winning output and keep iterating on top of it without starting over from scratch.',
    icon: IconLayersIntersect,
  },
]

const browseFeatures = [
  'Curated, handpicked, proven Facebook ad templates',
  'Built-in search, filtering, and sorting',
  'Template-first workflow for faster creative decisions',
]

const generateFeatures = [
  'Upload your own product photo once',
  'Generate multiple ad variations from one selected template',
  'Create variations of variations to keep refining winners',
]

const workflowSteps = [
  {
    title: 'Upload your product',
    description: 'Start with the product photo you already have.',
    icon: IconPhotoSpark,
  },
  {
    title: 'Browse proven ads',
    description: 'Search, filter, and sort through curated Facebook ad templates.',
    icon: IconSearch,
  },
  {
    title: 'Pick a direction',
    description: 'Choose the template and visual angle you want to adapt.',
    icon: IconTemplate,
  },
  {
    title: 'Generate and refine',
    description: 'Create multiple variations in one click, then branch off the best results.',
    icon: IconStack2,
  },
]

const valueBlocks = [
  {
    title: 'Discover',
    description: 'See proven ad directions first instead of starting from a blank prompt.',
  },
  {
    title: 'Create',
    description: 'Turn one selected template into multiple product variations in one action.',
  },
  {
    title: 'Refine',
    description: 'Take the strongest output and keep pushing it with variation-of-variation workflows.',
  },
]

const templateCarouselItems = [
  { title: 'UGC Hook', meta: 'Winning template', image: templateLibraryShot },
  { title: 'Before / After', meta: 'Curated ad', image: templateLibraryShot },
  { title: 'Product Demo', meta: 'Top performer', image: templateLibraryShot },
  { title: 'Founder Story', meta: 'Facebook ad', image: templateLibraryShot },
  { title: 'Benefit Stack', meta: 'Handpicked creative', image: templateLibraryShot },
  { title: 'Visual Comparison', meta: 'Proven concept', image: templateLibraryShot },
]

const variationCarouselItems = [
  { title: 'Batch 01', meta: '4 outputs from one template', image: generatedResultsShot },
  { title: 'Batch 02', meta: 'Single click multi-generate', image: generatedResultsShot },
  { title: 'Refine Winner', meta: 'Variation of variation', image: generatedResultsShot },
  { title: 'Scale Angle', meta: 'Keep best direction moving', image: generatedResultsShot },
  { title: 'New Pass', meta: 'Template remixed for your product', image: generatedResultsShot },
]

function Home() {
  return (
    <Box className="landing-page">
      <Box component="section" className="landing-shell landing-hero-shell">
        <Container size="xl">
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing={48} verticalSpacing={48} className="landing-hero-grid">
            <Stack gap="xl" maw={720}>
              <Group gap="sm">
                <Badge variant="light" color="teal" radius="xl" size="lg">
                  Curated ad library
                </Badge>
                <Badge variant="outline" color="gray" radius="xl" size="lg">
                  Built for Facebook-style creative
                </Badge>
              </Group>

              <Stack gap="md">
                <Title order={1} className="landing-title">
                  Browse proven ads. Generate your product into them.
                </Title>
                <Text className="landing-subtitle">
                  Search proven templates, pick one you like, and create multiple variations of your product instantly.
                </Text>
              </Stack>

              <Group gap="md">
                <Button
                  component={Link}
                  to="/studio"
                  color="brand"
                  size="xl"
                  fz="sm"
                  rightSection={<IconArrowRight size={18} />}
                >
                  Open the studio
                </Button>
                <Button component={Link} to="/pricing" variant="default" size="xl" fz="sm">
                  View pricing
                </Button>
              </Group>

              <Group gap="xs" className="landing-chip-row">
                <Box className="landing-chip">Search templates</Box>
                <Box className="landing-chip">Filter by ad direction</Box>
                <Box className="landing-chip">Generate many in one click</Box>
                <Box className="landing-chip">Iterate on winners</Box>
              </Group>

              <Paper className="landing-contrast-card" withBorder radius="md" p="lg">
                <Text size="xs" tt="uppercase" fw={700} c="dark.2">
                  Why it matters
                </Text>
                <Text mt="sm" size="sm" c="white">
                  Do not start from a blank prompt. Start from proven ads that already show a strong creative direction.
                </Text>
              </Paper>
            </Stack>

            <HeroMediaFlow
              productShot={heroProductShot}
              templateShot={heroTemplateShot}
              variationShots={heroVariationShots}
            />
          </SimpleGrid>
        </Container>
      </Box>

      <Box component="section" className="landing-shell">
        <Container size="xl">
          <Stack gap="md" mb="xl" maw={760}>
            <Badge variant="outline" color="gray" radius="xl" w="fit-content">
              What ProdSnap does today
            </Badge>
            <Title order={2} className="landing-section-title">
              Discover, generate, refine.
            </Title>
            <Text className="landing-section-copy">
              The product is focused on a single workflow: browse proven Facebook ad templates,
              choose one, generate your product into it, and keep iterating on the winners.
            </Text>
          </Stack>

          <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg" mb={48}>
            {valueBlocks.map(({ title, description }) => (
              <Paper key={title} className="landing-proof-card" withBorder radius="md" p="lg">
                <Text size="xs" tt="uppercase" fw={700} c="dark.2">
                  {title}
                </Text>
                <Text mt="sm" size="lg" fw={600} c="white">
                  {description}
                </Text>
              </Paper>
            ))}
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, md: 2, xl: 4 }} spacing="lg">
            {proofPoints.map(({ title, description, icon: Icon }) => (
              <Paper key={title} className="landing-feature-card" withBorder radius="md" p="xl">
                <ThemeIcon size={44} radius="md" color="brand" variant="light">
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

      <Box component="section" className="landing-shell landing-rail-shell">
        <Container size="xl">
          <Stack gap="md" mb="xl" maw={760}>
            <Badge variant="light" color="teal" radius="xl" w="fit-content">
              Template feed
            </Badge>
            <Title order={2} className="landing-section-title">
              A scrolling wall of proven ad directions.
            </Title>
            <Text className="landing-section-copy">
              The page should show that users are walking into a large ad library, not a blank canvas.
              This is where the browsing value becomes visually obvious.
            </Text>
          </Stack>

          <Box className="landing-marquee">
            <Box className="landing-marquee-track">
              {[...templateCarouselItems, ...templateCarouselItems].map(({ title, meta, image }, index) => (
                <Paper key={`${title}-${index}`} className="landing-rail-card" withBorder radius="md" p="sm">
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
              <Badge variant="light" color="yellow" radius="xl" w="fit-content">
                Discover
              </Badge>
              <Title order={2} className="landing-section-title">
                See what is already working before you generate anything.
              </Title>
              <Text className="landing-section-copy">
                The ad library is not filler around the generator. It is the starting point. Users can browse
                tons of proven Facebook ads, narrow them down with search and filters, and choose a direction
                before they ever click generate.
              </Text>
              <Stack gap="sm">
                {browseFeatures.map((item) => (
                  <Box key={item} className="landing-bullet">
                    <ThemeIcon size={24} radius="xl" color="teal" variant="light">
                      <IconSearch size={14} />
                    </ThemeIcon>
                    <Text size="sm" c="dark.1">
                      {item}
                    </Text>
                  </Box>
                ))}
              </Stack>
            </Stack>

            <Box className="landing-media-grid">
              <Image
                src={templateLibraryShot}
                alt="ProdSnap discovery view with filters and template browser"
                radius="md"
                className="landing-media-large"
              />
              <SimpleGrid cols={2} spacing="md">
                <Image src={templateLibraryShot} alt="ProdSnap filtered template results" radius="md" />
                <Image src={templateLibraryShot} alt="ProdSnap top performing ad templates" radius="md" />
              </SimpleGrid>
            </Box>
          </SimpleGrid>
        </Container>
      </Box>

      <Box component="section" className="landing-shell">
        <Container size="xl">
          <SimpleGrid cols={{ base: 1, md: 2, xl: 4 }} spacing="lg" mb={48}>
            {workflowSteps.map(({ title, description, icon: Icon }) => (
              <Paper key={title} className="landing-process-card" withBorder radius="md" p="lg">
                <ThemeIcon size={40} radius="md" color="teal" variant="light">
                  <Icon size={18} />
                </ThemeIcon>
                <Text mt="lg" size="md" fw={600} c="white">
                  {title}
                </Text>
                <Text mt="sm" size="sm" c="dark.2">
                  {description}
                </Text>
              </Paper>
            ))}
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing={48} verticalSpacing={48}>
            <Box className="landing-media-grid">
              <Image
                src={generatedResultsShot}
                alt="ProdSnap generated product variations from a selected template"
                radius="md"
                className="landing-media-large"
              />
              <Paper className="landing-workflow-strip" withBorder radius="md" p="md">
                <Group grow>
                  <Image src={generatedResultsShot} alt="ProdSnap uploaded product" radius="md" />
                  <Image src={templateLibraryShot} alt="ProdSnap selected template" radius="md" />
                  <Image src={generatedResultsShot} alt="ProdSnap generated outputs" radius="md" />
                </Group>
              </Paper>
            </Box>

            <Stack gap="lg">
              <Badge variant="light" color="lime" radius="xl" w="fit-content">
                Create
              </Badge>
              <Title order={2} className="landing-section-title">
                Pick one template. Generate multiple product variations immediately.
              </Title>
              <Text className="landing-section-copy">
                ProdSnap takes a template-first approach. Upload your product once, choose the ad style you want,
                and create several outputs in that format without rebuilding the creative direction from scratch.
              </Text>
              <Stack gap="sm">
                {generateFeatures.map((item) => (
                  <Box key={item} className="landing-bullet">
                    <ThemeIcon size={24} radius="xl" color="brand" variant="light">
                      <IconPhotoSpark size={14} />
                    </ThemeIcon>
                    <Text size="sm" c="dark.1">
                      {item}
                    </Text>
                  </Box>
                ))}
              </Stack>
              <Paper className="landing-note-card" withBorder radius="md" p="lg">
                <Text size="xs" tt="uppercase" fw={700} c="dark.2">
                  Template-first workflow
                </Text>
                <Text mt="sm" size="sm" c="dark.1">
                  This is the core value: discover the right ad, adapt it to your product, generate multiple
                  variants, and keep the strongest ones moving forward.
                </Text>
              </Paper>
            </Stack>
          </SimpleGrid>
        </Container>
      </Box>

      <Box component="section" className="landing-shell landing-band-alt">
        <Container size="xl">
          <Stack gap="md" mb="xl" maw={760}>
            <Badge variant="light" color="grape" radius="xl" w="fit-content">
              Generated variations
            </Badge>
            <Title order={2} className="landing-section-title">
              Show the output volume, not just the feature list.
            </Title>
            <Text className="landing-section-copy">
              One of the strongest parts of ProdSnap is how quickly a single template choice turns into multiple outputs.
              This needs to feel visible and kinetic on the page.
            </Text>
          </Stack>

          <Box className="landing-marquee landing-marquee-reverse">
            <Box className="landing-marquee-track landing-marquee-track-slower">
              {[...variationCarouselItems, ...variationCarouselItems].map(({ title, meta, image }, index) => (
                <Paper key={`${title}-${index}`} className="landing-rail-card landing-rail-card-wide" withBorder radius="md" p="sm">
                  <Image src={image} alt={`${title} variation placeholder`} radius="md" />
                  <Group justify="space-between" align="flex-start" mt="md" gap="md">
                    <Box>
                      <Text size="xs" tt="uppercase" fw={700} c="dark.2">
                        {meta}
                      </Text>
                      <Text mt={6} size="sm" fw={600} c="white">
                        {title}
                      </Text>
                    </Box>
                    <ThemeIcon size={34} radius="md" color="grape" variant="light">
                      <IconSparkles size={16} />
                    </ThemeIcon>
                  </Group>
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
              <Badge variant="outline" color="gray" radius="xl" w="fit-content">
                Iteration
              </Badge>
              <Title order={2} className="landing-section-title">
                Keep pushing on winners with variations of variations.
              </Title>
              <Text className="landing-section-copy">
                Once a generated ad looks promising, users can keep iterating on top of it. That makes
                ProdSnap useful not just for first-pass exploration, but for refining strong creative directions.
              </Text>
              <Paper className="landing-note-card" withBorder radius="md" p="lg">
                <Group justify="space-between" align="flex-start">
                  <Box maw={420}>
                    <Text size="sm" fw={600} c="white">
                      One-click batch generation
                    </Text>
                    <Text mt="sm" size="sm" c="dark.2">
                      Generate multiple outputs in one action, review them side by side, then branch from the strongest one.
                    </Text>
                  </Box>
                  <ThemeIcon size={40} radius="md" color="teal" variant="light">
                    <IconSparkles size={18} />
                  </ThemeIcon>
                </Group>
              </Paper>
            </Stack>

            <Box className="landing-variation-wall">
              <Image
                src={generatedResultsShot}
                alt="ProdSnap variation grid"
                radius="md"
              />
              <SimpleGrid cols={3} spacing="md" mt="md">
                {[1, 2, 3].map((item) => (
                  <Image
                    key={item}
                    src={generatedResultsShot}
                    alt={`ProdSnap refinement placeholder ${item}`}
                    radius="md"
                  />
                ))}
              </SimpleGrid>
            </Box>
          </SimpleGrid>
        </Container>
      </Box>

      <Box component="section" className="landing-shell">
        <Container size="xl">
          <Paper className="landing-video-callout" withBorder radius="md" p="xl">
            <SimpleGrid cols={{ base: 1, lg: 2 }} spacing={32} verticalSpacing={32}>
              <Stack gap="lg">
                <Badge variant="light" color="grape" radius="xl" w="fit-content">
                  Media placeholders
                </Badge>
                <Title order={2} className="landing-section-title">
                  Replace these with actual app GIFs, videos, and screenshots.
                </Title>
                <Text className="landing-section-copy">
                  This section is ready for real product media later: template browsing, filter/search,
                  multi-generation, and refinement flows. For now it uses placeholders so the page has the right rhythm.
                </Text>
                <Group gap="md">
                  <ThemeIcon size={42} radius="md" color="grape" variant="light">
                    <IconVideo size={18} />
                  </ThemeIcon>
                  <Text size="sm" c="dark.1" maw={420}>
                    When you have real captures, this should become the most convincing part of the landing page.
                  </Text>
                </Group>
              </Stack>
              <Image
                src={generatedResultsShot}
                alt="ProdSnap walkthrough placeholder using current results grid"
                radius="md"
              />
            </SimpleGrid>
          </Paper>
        </Container>
      </Box>

      <Box component="section" className="landing-shell landing-cta-band">
        <Container size="lg">
          <Stack align="center" ta="center" gap="lg">
            <Badge variant="light" color="orange" radius="xl">
              Coming soon
            </Badge>
            <Title order={2} className="landing-cta-title">
              Copywriting generation for the ads themselves.
            </Title>
            <Text className="landing-section-copy" maw={680}>
              Today, ProdSnap helps users browse proven ad templates and generate image variations
              from them. Next, it will also help generate the actual ad copywriting text that goes with those visuals.
            </Text>
            <Group gap="md">
              <Button
                component={Link}
                to="/studio"
                color="brand"
                size="xl"
                fz="sm"
                rightSection={<IconArrowRight size={18} />}
              >
                Start browsing templates
              </Button>
              <Button component={Link} to="/pricing" variant="default" size="xl" fz="sm" leftSection={<IconCopyPlus size={18} />}>
                See plans
              </Button>
            </Group>
          </Stack>
        </Container>
      </Box>
    </Box>
  )
}
