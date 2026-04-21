// File size limits
export const MAX_PRODUCT_IMAGE_SIZE = 10 * 1024 * 1024 // 10 MB
export const MAX_TEMPLATE_IMAGE_SIZE = 20 * 1024 * 1024 // 20 MB

// Aspect ratio helpers
export function getAspectRatioValue(ar: string): number {
  switch (ar) {
    case '1:1':
      return 1
    case '4:5':
      return 4 / 5
    case '9:16':
      return 9 / 16
    case '16:9':
      return 16 / 9
    default:
      return 1
  }
}

export type AspectRatio = '1:1' | '4:5' | '9:16' | '16:9'
