import { describe, expect, it } from 'vitest'
import { upgradeToHighResImageUrl } from '../lib/imageUrls'

describe('upgradeToHighResImageUrl', () => {
  describe('Shopify named tiers (cdn.shopify.com)', () => {
    it.each([
      ['_pico', 'https://cdn.shopify.com/s/files/1/0011/4408/products/foo_pico.jpg'],
      ['_thumb', 'https://cdn.shopify.com/s/files/1/0011/4408/products/foo_thumb.jpg'],
      ['_small', 'https://cdn.shopify.com/s/files/1/0011/4408/products/foo_small.jpg'],
      ['_compact', 'https://cdn.shopify.com/s/files/1/0011/4408/products/foo_compact.jpg'],
      ['_medium', 'https://cdn.shopify.com/s/files/1/0011/4408/products/foo_medium.jpg'],
      ['_large', 'https://cdn.shopify.com/s/files/1/0011/4408/products/foo_large.jpg'],
      ['_grande', 'https://cdn.shopify.com/s/files/1/0011/4408/products/foo_grande.jpg'],
    ])('strips %s', (_label, input) => {
      expect(upgradeToHighResImageUrl(input)).toBe(
        'https://cdn.shopify.com/s/files/1/0011/4408/products/foo.jpg',
      )
    })

    it('does NOT strip _master (404s on some Shopify configs)', () => {
      const input = 'https://cdn.shopify.com/s/files/1/0011/4408/products/foo_master.jpg'
      expect(upgradeToHighResImageUrl(input)).toBe(input)
    })
  })

  describe('Shopify dimensional tokens', () => {
    it('strips _360x', () => {
      expect(
        upgradeToHighResImageUrl(
          'https://cdn.shopify.com/s/files/1/0011/4408/products/foo_360x.jpg',
        ),
      ).toBe('https://cdn.shopify.com/s/files/1/0011/4408/products/foo.jpg')
    })

    it('strips _100x100', () => {
      expect(
        upgradeToHighResImageUrl(
          'https://cdn.shopify.com/s/files/1/0011/4408/products/foo_100x100.jpg',
        ),
      ).toBe('https://cdn.shopify.com/s/files/1/0011/4408/products/foo.jpg')
    })
  })

  describe('Query params', () => {
    it('strips ?width=600', () => {
      expect(
        upgradeToHighResImageUrl(
          'https://cdn.shopify.com/s/files/1/0011/4408/products/foo.jpg?width=600',
        ),
      ).toBe('https://cdn.shopify.com/s/files/1/0011/4408/products/foo.jpg')
    })

    it('strips ?width=800 but preserves other params', () => {
      expect(
        upgradeToHighResImageUrl(
          'https://cdn.shopify.com/s/files/1/0011/4408/products/foo.jpg?width=800&v=12',
        ),
      ).toBe('https://cdn.shopify.com/s/files/1/0011/4408/products/foo.jpg?v=12')
    })

    it('strips ?height=400', () => {
      expect(
        upgradeToHighResImageUrl(
          'https://cdn.shopify.com/s/files/1/0011/4408/products/foo.jpg?height=400',
        ),
      ).toBe('https://cdn.shopify.com/s/files/1/0011/4408/products/foo.jpg')
    })
  })

  describe('Wixstatic', () => {
    it('strips /v1/fill/...', () => {
      expect(
        upgradeToHighResImageUrl(
          'https://static.wixstatic.com/media/abc~mv2.jpg/v1/fill/w_320,h_320,al_c,q_85/abc~mv2.jpg',
        ),
      ).toBe('https://static.wixstatic.com/media/abc~mv2.jpg')
    })

    it('strips /v1/crop/...', () => {
      expect(
        upgradeToHighResImageUrl(
          'https://static.wixstatic.com/media/xyz~mv2.png/v1/crop/x_0,y_0,w_500,h_500/xyz~mv2.png',
        ),
      ).toBe('https://static.wixstatic.com/media/xyz~mv2.png')
    })
  })

  describe('Cloudinary', () => {
    it('strips resize transform segments (upload mode)', () => {
      expect(
        upgradeToHighResImageUrl(
          'https://res.cloudinary.com/demo/image/upload/w_120,h_120,c_fill/v1/foo.jpg',
        ),
      ).toBe('https://res.cloudinary.com/demo/image/upload/v1/foo.jpg')
    })
  })

  describe('Cloudinary fetch mode (any host)', () => {
    it('extracts embedded source URL from custom-CNAME fetch URL (Bombas-style)', () => {
      const input =
        'https://assets.bombas.com/image/fetch/c_crop,h_3040,w_3040/b_rgb:f1f1ee,c_scale,dpr_auto,w_50/f_auto,q_auto/https://images.ctfassets.net/abc/foo.png'
      expect(upgradeToHighResImageUrl(input)).toBe(
        'https://images.ctfassets.net/abc/foo.png',
      )
    })

    it('extracts embedded source from res.cloudinary.com fetch URL', () => {
      expect(
        upgradeToHighResImageUrl(
          'https://res.cloudinary.com/demo/image/fetch/w_50/https://example.com/foo.jpg',
        ),
      ).toBe('https://example.com/foo.jpg')
    })

    it('recursively upgrades the embedded URL (fetch → Shopify named tier)', () => {
      // Embedded source is a Shopify _large URL → after fetch unwrapping,
      // the named-tier strip kicks in.
      const input =
        'https://assets.example.com/image/fetch/w_50/https://cdn.shopify.com/s/files/1/0011/foo_large.jpg'
      expect(upgradeToHighResImageUrl(input)).toBe(
        'https://cdn.shopify.com/s/files/1/0011/foo.jpg',
      )
    })

    it('falls through when embedded URL is malformed', () => {
      const input = 'https://assets.example.com/image/fetch/w_50/not-a-real-url'
      expect(upgradeToHighResImageUrl(input)).toBe(input)
    })
  })

  describe('Negative cases (no transform applied)', () => {
    it('non-Shopify URL with _large in path is unchanged', () => {
      const input = 'https://example.com/photo_large.jpg'
      expect(upgradeToHighResImageUrl(input)).toBe(input)
    })

    it('non-Wixstatic URL with /v1/fill/ in path is unchanged', () => {
      const input = 'https://example.com/v1/fill/w_320,h_320/foo.jpg'
      expect(upgradeToHighResImageUrl(input)).toBe(input)
    })

    it('plain URL with no recognized pattern is unchanged', () => {
      const input = 'https://example.com/photos/product.jpg'
      expect(upgradeToHighResImageUrl(input)).toBe(input)
    })

    it('malformed URL is returned as-is', () => {
      const input = 'not a url'
      expect(upgradeToHighResImageUrl(input)).toBe(input)
    })
  })
})
