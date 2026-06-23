/**
 * Faithful-ish Facebook feed ad mock. Given a creative image + chosen copy
 * (primary text, headline, description, CTA), renders the way the ad would
 * appear in the Meta feed: page row + "Sponsored", primary text, the creative,
 * then the link card (headline + description + CTA button). Purely
 * presentational — the review screen feeds it the user's selected pairing.
 */
import { AspectRatio, Box, Group, Image, Stack, Text } from '@mantine/core'
import { IconThumbUp, IconMessageCircle, IconShare3, IconWorld } from '@tabler/icons-react'

const ASPECT_RATIO_VALUE: Record<string, number> = {
  '1:1': 1,
  '4:5': 4 / 5,
  '9:16': 9 / 16,
  '16:9': 16 / 9,
}

// Meta call_to_action_type → button label.
const CTA_LABEL: Record<string, string> = {
  SHOP_NOW: 'Shop now',
  LEARN_MORE: 'Learn more',
  SIGN_UP: 'Sign up',
  SUBSCRIBE: 'Subscribe',
  GET_OFFER: 'Get offer',
  BOOK_TRAVEL: 'Book now',
  DOWNLOAD: 'Download',
  ORDER_NOW: 'Order now',
  CONTACT_US: 'Contact us',
  GET_QUOTE: 'Get quote',
  APPLY_NOW: 'Apply now',
  SEE_MENU: 'See menu',
  WATCH_MORE: 'Watch more',
  NO_BUTTON: '',
}

function ctaLabel(cta?: string): string {
  if (!cta) return 'Shop now'
  return CTA_LABEL[cta] ?? 'Shop now'
}

export function FacebookAdPreview({
  imageUrl,
  aspectRatio = '1:1',
  pageName,
  primaryText,
  headline,
  description,
  cta,
  width = 360,
}: {
  imageUrl?: string
  aspectRatio?: string
  pageName: string
  primaryText?: string
  headline?: string
  description?: string
  cta?: string
  width?: number
}) {
  const ratio = ASPECT_RATIO_VALUE[aspectRatio] ?? 1
  const initial = pageName.trim().charAt(0).toUpperCase() || 'A'
  const button = ctaLabel(cta)

  return (
    <Box
      style={{
        width,
        maxWidth: '100%',
        background: '#ffffff',
        borderRadius: 8,
        overflow: 'hidden',
        border: '1px solid #dadde1',
        color: '#050505',
        fontFamily:
          'Helvetica, Arial, -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      {/* Page row */}
      <Group gap={8} px={12} pt={12} pb={8} wrap="nowrap">
        <Box
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #1877f2, #0a5dc2)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 18,
            flexShrink: 0,
          }}
        >
          {initial}
        </Box>
        <Box style={{ minWidth: 0 }}>
          <Text fw={600} size="sm" style={{ color: '#050505', lineHeight: 1.2 }} truncate>
            {pageName}
          </Text>
          <Group gap={4} wrap="nowrap">
            <Text size="xs" style={{ color: '#65676b' }}>
              Sponsored
            </Text>
            <Text size="xs" style={{ color: '#65676b' }}>
              ·
            </Text>
            <IconWorld size={11} style={{ color: '#65676b' }} />
          </Group>
        </Box>
      </Group>

      {/* Primary text */}
      {primaryText && (
        <Text
          px={12}
          pb={10}
          size="sm"
          style={{ color: '#050505', whiteSpace: 'pre-wrap', lineHeight: 1.35 }}
        >
          {primaryText}
        </Text>
      )}

      {/* Creative */}
      {imageUrl ? (
        <AspectRatio ratio={ratio} style={{ background: '#f0f2f5' }}>
          <Image src={imageUrl} alt="Ad creative" style={{ objectFit: 'cover' }} />
        </AspectRatio>
      ) : (
        <AspectRatio ratio={ratio} style={{ background: '#f0f2f5' }}>
          <Box style={{ display: 'grid', placeItems: 'center' }}>
            <Text size="sm" c="dimmed">
              No creative selected
            </Text>
          </Box>
        </AspectRatio>
      )}

      {/* Link card: headline + description + CTA */}
      <Group
        justify="space-between"
        wrap="nowrap"
        px={12}
        py={10}
        gap={12}
        style={{ background: '#f0f2f5' }}
      >
        <Box style={{ minWidth: 0, flex: 1 }}>
          <Text size="10px" style={{ color: '#65676b', textTransform: 'uppercase', letterSpacing: 0.3 }}>
            {pageName.toLowerCase().replace(/\s+/g, '')}.com
          </Text>
          <Text fw={700} size="sm" style={{ color: '#050505', lineHeight: 1.25 }} lineClamp={2}>
            {headline || 'Your headline appears here'}
          </Text>
          {description && (
            <Text size="xs" style={{ color: '#65676b' }} lineClamp={1}>
              {description}
            </Text>
          )}
        </Box>
        {button && (
          <Box
            style={{
              flexShrink: 0,
              background: '#e4e6eb',
              color: '#050505',
              fontWeight: 600,
              fontSize: 13,
              padding: '8px 12px',
              borderRadius: 6,
              whiteSpace: 'nowrap',
            }}
          >
            {button}
          </Box>
        )}
      </Group>

      {/* Engagement bar */}
      <Group justify="space-around" px={12} py={8} style={{ borderTop: '1px solid #ced0d4' }}>
        {[
          { icon: IconThumbUp, label: 'Like' },
          { icon: IconMessageCircle, label: 'Comment' },
          { icon: IconShare3, label: 'Share' },
        ].map(({ icon: Icon, label }) => (
          <Group key={label} gap={6} wrap="nowrap">
            <Icon size={16} style={{ color: '#65676b' }} />
            <Text size="xs" fw={600} style={{ color: '#65676b' }}>
              {label}
            </Text>
          </Group>
        ))}
      </Group>
    </Box>
  )
}
