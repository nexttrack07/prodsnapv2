import { describe, expect, it } from 'vitest'
import { isBlockedHost, assertPublicUrl } from './ssrf'

describe('isBlockedHost', () => {
  it('blocks loopback / private / link-local literals', () => {
    for (const h of [
      'localhost',
      '127.0.0.1',
      '127.1.2.3',
      '10.0.0.5',
      '192.168.1.1',
      '172.16.0.1',
      '172.31.255.255',
      '169.254.169.254', // cloud metadata
      '0.0.0.0',
    ]) {
      expect(isBlockedHost(h), h).toBe(true)
    }
  })

  it('blocks alternative IPv4 encodings (decimal/hex/octal)', () => {
    for (const h of [
      '2130706433', // 127.0.0.1 decimal
      '0x7f000001', // 127.0.0.1 hex
      '0177.0.0.1', // octal
      '2852039166', // 169.254.169.254 decimal
    ]) {
      expect(isBlockedHost(h), h).toBe(true)
    }
  })

  it('blocks trailing-dot and IPv6 private/loopback/mapped forms', () => {
    for (const h of [
      'localhost.',
      '[::1]',
      '[fc00::1]',
      '[fd12:3456::1]',
      '[fe80::1]',
      '[::ffff:127.0.0.1]',
      '[::ffff:169.254.169.254]',
    ]) {
      expect(isBlockedHost(h), h).toBe(true)
    }
  })

  it('allows public hosts', () => {
    for (const h of [
      'example.com',
      'cdn.shopify.com',
      'images.unsplash.com',
      '8.8.8.8',
      '1.1.1.1',
      '[2606:4700::1]', // public IPv6
      '[::ffff:8.8.8.8]', // public IPv4-mapped
    ]) {
      expect(isBlockedHost(h), h).toBe(false)
    }
  })

  it('treats empty / unparseable hosts as blocked', () => {
    expect(isBlockedHost('')).toBe(true)
    expect(isBlockedHost('   ')).toBe(true)
  })
})

describe('assertPublicUrl', () => {
  it('rejects non-HTTPS by default', () => {
    expect(() => assertPublicUrl('http://example.com')).toThrow()
    expect(() => assertPublicUrl('ftp://example.com')).toThrow()
  })

  it('allows HTTP when opted in', () => {
    expect(() => assertPublicUrl('http://example.com', { allowHttp: true })).not.toThrow()
  })

  it('rejects private hosts even over HTTPS', () => {
    expect(() => assertPublicUrl('https://169.254.169.254')).toThrow()
    expect(() => assertPublicUrl('https://localhost')).toThrow()
  })

  it('accepts a normal public HTTPS URL', () => {
    expect(() => assertPublicUrl('https://cdn.shopify.com/img.jpg')).not.toThrow()
  })
})
