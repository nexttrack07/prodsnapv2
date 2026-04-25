import { Badge, Box, Group, Image, Paper, SimpleGrid, Text, ThemeIcon } from '@mantine/core'
import { IconPlus, IconSparkles } from '@tabler/icons-react'

type HeroMediaFlowProps = {
  productShot: string
  templateShot: string
  variationShots: string[]
}

export function HeroMediaFlow({ productShot, templateShot, variationShots }: HeroMediaFlowProps) {
  return (
    <Box className="landing-hero-flow">
      <Box className="landing-hero-flow-top">
        <Paper className="landing-hero-input-card" withBorder radius="md" p="md">
          <Text size="xs" tt="uppercase" fw={700} c="dark.2" mb="sm">
            Your product
          </Text>
          <Image
            src={productShot}
            alt="Original product image"
            radius="md"
            className="landing-hero-product-shot"
          />
        </Paper>

        <ThemeIcon className="landing-hero-plus" size={54} radius="xl" color="brand" variant="light">
          <IconPlus size={24} />
        </ThemeIcon>

        <Paper className="landing-hero-input-card landing-hero-template-card" withBorder radius="md" p="md">
          <Group justify="space-between" align="center" mb="sm">
            <Text size="xs" tt="uppercase" fw={700} c="dark.2">
              Selected templates
            </Text>
            <Badge variant="light" color="brand" radius="xl">
              3 selected
            </Badge>
          </Group>
          <Image
            src={templateShot}
            alt="Selected templates"
            radius="md"
            className="landing-hero-template-shot"
          />
        </Paper>
      </Box>

      <Box className="landing-hero-arrows" aria-hidden="true">
        <svg viewBox="0 0 640 220" className="landing-hero-arrow-svg">
          <path className="landing-hero-arrow-path" d="M158 18 C170 72, 230 118, 302 180" />
          <path className="landing-hero-arrow-path" d="M482 18 C470 72, 410 118, 338 180" />
          <path className="landing-hero-arrow-head" d="M308 182 L320 204 L332 182" />
        </svg>
      </Box>

      <Paper className="landing-hero-results-panel" withBorder radius="md" p="md">
        <Group justify="space-between" align="center" mb="md">
          <Box>
            <Text size="xs" tt="uppercase" fw={700} c="dark.2">
              Generated variations
            </Text>
            <Text size="sm" fw={600} c="white" mt={4}>
              Multiple outputs from one product + template selection
            </Text>
          </Box>
          <ThemeIcon size={36} radius="md" color="grape" variant="light">
            <IconSparkles size={16} />
          </ThemeIcon>
        </Group>

        <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} spacing="sm">
          {variationShots.map((shot, index) => (
            <Image
              key={shot}
              src={shot}
              alt={`Generated variation ${index + 1}`}
              radius="md"
              className={`landing-hero-variation-shot landing-hero-variation-shot-${index + 1}`}
            />
          ))}
        </SimpleGrid>
      </Paper>
    </Box>
  )
}
