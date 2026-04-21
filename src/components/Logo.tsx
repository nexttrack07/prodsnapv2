import { Group, Box, Text } from '@mantine/core'

type Size = 'sm' | 'md' | 'lg'
type Variant = 'light' | 'dark'

const sizeStyles: Record<Size, { fontSize: string; padding: string; borderWidth: number }> = {
  sm: { fontSize: '10px', padding: '4px 6px', borderWidth: 1 },
  md: { fontSize: '12px', padding: '4px 8px', borderWidth: 1 },
  lg: { fontSize: '14px', padding: '6px 10px', borderWidth: 2 },
}

export function Logo({
  size = 'md',
  variant = 'dark',
}: {
  size?: Size
  variant?: Variant
}) {
  const styles = sizeStyles[size]
  const borderColor = variant === 'light' ? 'var(--mantine-color-dark-9)' : 'white'
  const solidBg = variant === 'light' ? 'var(--mantine-color-dark-9)' : 'white'
  const solidText = variant === 'light' ? 'white' : 'var(--mantine-color-dark-9)'
  const outlineText = variant === 'light' ? 'var(--mantine-color-dark-9)' : 'white'

  return (
    <Group
      gap={0}
      style={{
        border: `${styles.borderWidth}px solid ${borderColor}`,
        borderRadius: 'var(--mantine-radius-sm)',
        overflow: 'hidden',
      }}
    >
      <Box
        component="span"
        style={{
          backgroundColor: solidBg,
          color: solidText,
          padding: styles.padding,
          fontSize: styles.fontSize,
          fontWeight: 700,
          letterSpacing: '0.18em',
          lineHeight: 1,
        }}
      >
        PROD
      </Box>
      <Box
        component="span"
        style={{
          color: outlineText,
          padding: styles.padding,
          fontSize: styles.fontSize,
          fontWeight: 700,
          letterSpacing: '0.18em',
          lineHeight: 1,
        }}
      >
        SNAP
      </Box>
    </Group>
  )
}
