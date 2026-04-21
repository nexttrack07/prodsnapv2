import iconsHref from './icons.svg?url'
import { Box } from '@mantine/core'

const sizeMap = {
  md: 16,
  xl: 32,
}

export function Icon({
  name,
  size = 'md',
  spin = false,
}: {
  name: string
  size?: 'md' | 'xl'
  spin?: boolean
}) {
  const dimension = sizeMap[size]
  return (
    <Box
      component="svg"
      w={dimension}
      h={dimension}
      display="inline"
      style={{
        alignSelf: 'center',
        animation: spin ? 'spin 1s linear infinite' : undefined,
      }}
    >
      <use href={`${iconsHref}#${name}`} />
    </Box>
  )
}

export function LoginIcon() {
  return (
    <Box
      component="svg"
      w={32}
      h={32}
      display="inline"
      c="white"
      style={{ alignSelf: 'center', transform: 'scaleX(-1)' }}
    >
      <use href={`${iconsHref}#login`} />
    </Box>
  )
}

export function LogoutIcon() {
  return (
    <Box
      component="svg"
      w={32}
      h={32}
      display="inline"
      c="white"
      style={{ alignSelf: 'center' }}
    >
      <use href={`${iconsHref}#logout`} />
    </Box>
  )
}
