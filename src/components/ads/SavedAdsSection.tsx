/**
 * Saved ads on the product detail page. A "saved ad" is a creative the user
 * paired with copy via "Save this ad" in the creative detail panel — i.e. a
 * finished image + headline/primary text/description/CTA combo. This section
 * renders each one as the actual Facebook ad preview so the product page shows
 * the buyer's finished ads directly, with download.
 */
import { useState } from 'react'
import { useQuery } from 'convex/react'
import {
  ActionIcon,
  Badge,
  Box,
  Group,
  Paper,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core'
import { IconBookmark, IconDownload, IconTrophy } from '@tabler/icons-react'
import { notifications } from '@mantine/notifications'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { FacebookAdPreview } from './FacebookAdPreview'
import { downloadGeneratedImage } from '../../utils/downloadImage'

type SavedAd = NonNullable<
  ReturnType<typeof useQuery<typeof api.creatives.listSavedAds>>
>[number]

export function SavedAdsSection({
  productId,
  productName,
}: {
  productId: Id<'products'>
  productName: string
}) {
  const ads = useQuery(api.creatives.listSavedAds, { productId })

  return (
    <Stack gap="md" mt="xl" mb="xl">
      <Group gap="xs" align="center">
        <IconBookmark size={20} color="var(--mantine-color-brand-5)" />
        <Title order={3} fz={18} c="dark.0" fw={600}>
          Saved ads
        </Title>
        {ads && ads.length > 0 && (
          <Badge color="dark" variant="light" size="sm">
            {ads.length}
          </Badge>
        )}
      </Group>

      {ads === undefined ? (
        <SimpleGrid cols={{ base: 2, sm: 3, md: 4, lg: 5 }} spacing="md">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} h={300} radius="md" />
          ))}
        </SimpleGrid>
      ) : ads.length === 0 ? (
        <Paper
          radius="lg"
          p="xl"
          withBorder
          style={{
            borderStyle: 'dashed',
            borderWidth: 2,
            borderColor: 'var(--mantine-color-dark-5)',
          }}
        >
          <Text fw={500} c="dark.0">
            No saved ads yet
          </Text>
          <Text size="sm" c="dark.3" maw={520}>
            Open a creative, pick a headline and primary text in the Facebook
            preview, then hit <strong>Save this ad</strong>. Your finished ads
            collect here.
          </Text>
        </Paper>
      ) : (
        <SimpleGrid cols={{ base: 2, sm: 3, md: 4, lg: 5 }} spacing="md">
          {ads.map((ad) => (
            <SavedAdCard
              key={ad.generationId}
              ad={ad}
              productName={productName}
            />
          ))}
        </SimpleGrid>
      )}
    </Stack>
  )
}

function SavedAdCard({
  ad,
  productName,
}: {
  ad: SavedAd
  productName: string
}) {
  const [downloading, setDownloading] = useState(false)

  const handleDownload = async () => {
    setDownloading(true)
    try {
      await downloadGeneratedImage(ad.outputUrl, `${productName}-saved-ad`, 'png')
    } catch (err) {
      notifications.show({
        color: 'red',
        message: err instanceof Error ? err.message : 'Could not download.',
      })
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Stack gap="xs">
      <Box style={{ position: 'relative' }}>
        <FacebookAdPreview
          imageUrl={ad.outputUrl}
          aspectRatio={ad.aspectRatio}
          pageName={productName}
          headline={ad.headline}
          primaryText={ad.primaryText}
          description={ad.description}
          cta={ad.cta}
          width={9999}
        />
        {ad.isWinner && (
          <Badge
            size="xs"
            variant="filled"
            color="yellow"
            leftSection={<IconTrophy size={9} />}
            style={{ position: 'absolute', top: 8, left: 8 }}
          >
            Winner
          </Badge>
        )}
      </Box>
      <Group justify="flex-end" gap={4}>
        <Tooltip label="Download PNG" withArrow>
          <ActionIcon
            variant="subtle"
            color="gray"
            loading={downloading}
            onClick={handleDownload}
            aria-label="Download ad"
          >
            <IconDownload size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Stack>
  )
}
