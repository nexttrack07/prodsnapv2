import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useMediaQuery } from '@mantine/hooks'
import { LogoMark } from '~/components/Logo'
import { seo } from '~/utils/seo'

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      ...seo({
        title: 'ProdSnap — performance creative co-pilot for media buyers',
        description:
          'Save what\'s winning. Generate ads that rhyme with it. One loop for swipe, generation, and winners — so your references actually shape the next batch.',
        image: '/prodsnap_logo.png',
      }),
    ],
  }),
  component: Home,
})

// ============================================================
// Tokens (design-matched, with brand color substitution)
// ============================================================
const T = {
  bg: '#0B0D10',
  bgElev: '#15181D',
  bgElev2: '#1C2026',
  cream: '#FFFFFF',
  creamElev: '#F7F8FA',
  ink: '#0B0D10',
  text: '#FFFFFF',
  textMuted: '#9CA1AA',
  textDim: '#6B7079',
  textOnCream: '#0B0D10',
  textOnCreamMuted: '#5A6068',
  border: '#262A31',
  borderCream: '#E5E7EB',
  // Brand substitutions: #2F55D4 → brand-6 (#0063ff), #5874E0 → brand-5 (#1d72fe)
  brand: '#0063ff',
  brandSoft: '#1d72fe',
  brandTint: 'rgba(0, 99, 255, 0.10)',
  teal: '#5FB8A6',
  tealTint: 'rgba(95, 184, 166, 0.14)',
  warn: '#94A3B8',
}

const fontDisplay = '"Inter Tight", "Inter", -apple-system, sans-serif'
const fontBody = '"Inter", -apple-system, sans-serif'
const fontMono = '"JetBrains Mono", "SF Mono", monospace'

// ============================================================
// Primitives
// ============================================================

function MonoLabel({ children, color, style }: { children: React.ReactNode; color?: string; style?: React.CSSProperties }) {
  return (
    <span style={{
      fontFamily: fontMono,
      fontSize: 11,
      fontWeight: 500,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      color: color || T.textMuted,
      ...style,
    }}>{children}</span>
  )
}

function Eyebrow({ children, color, style }: { children: React.ReactNode; color?: string; style?: React.CSSProperties }) {
  return (
    <div style={{
      fontFamily: fontMono,
      fontSize: 11,
      fontWeight: 500,
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      color: color || T.brandSoft,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      ...style,
    }}>
      <span style={{ width: 18, height: 1, background: color || T.brandSoft, opacity: 0.6 }} />
      {children}
    </div>
  )
}

function Pill({ children, color, bg, style }: { children: React.ReactNode; color?: string; bg?: string; style?: React.CSSProperties }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 10px',
      borderRadius: 999,
      fontFamily: fontMono,
      fontSize: 11,
      fontWeight: 500,
      letterSpacing: '0.04em',
      color: color || T.brandSoft,
      background: bg || T.brandTint,
      border: `1px solid ${(color || T.brandSoft) + '33'}`,
      ...style,
    }}>{children}</span>
  )
}


function Btn({ children, kind = 'primary', size = 'md', style, icon }: {
  children: React.ReactNode; kind?: 'primary' | 'secondary' | 'secondaryCream' | 'ghost' | 'light'; size?: 'sm' | 'md' | 'lg'; style?: React.CSSProperties; icon?: React.ReactNode
}) {
  const sizes = {
    sm: { padding: '8px 14px', fontSize: 13, gap: 6 },
    md: { padding: '12px 20px', fontSize: 14, gap: 8 },
    lg: { padding: '14px 24px', fontSize: 15, gap: 10 },
  }
  const kinds: Record<string, React.CSSProperties> = {
    primary: { background: T.brand, color: '#fff', border: `1px solid ${T.brand}` },
    secondary: { background: 'transparent', color: T.text, border: `1px solid ${T.border}` },
    secondaryCream: { background: 'transparent', color: T.ink, border: `1px solid ${T.borderCream}` },
    ghost: { background: 'transparent', color: T.text, border: '1px solid transparent' },
    light: { background: T.cream, color: T.ink, border: `1px solid ${T.cream}` },
  }
  return (
    <button style={{
      ...sizes[size],
      ...kinds[kind],
      fontFamily: fontBody,
      fontWeight: 500,
      borderRadius: 8,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      letterSpacing: '-0.01em',
      transition: 'transform .12s ease, background .12s ease',
      ...style,
    }}>
      {children}
      {icon}
    </button>
  )
}

// ============================================================
// Hero batch — 6 sample variants (Harry's product). The source slot uses
// the background-removed render; these are the "what one product becomes
// after a single batch" thumbnails.
// ============================================================
const HERO_SOURCE_SHOT = '/landing/shots/harrys-background-removed.png'
const HERO_VARIANT_SHOTS = [
  '/landing/shots/harrys-1-exact.png',
  '/landing/shots/harrys-2-exact.png',
  '/landing/shots/harrys-3-exact.png',
  '/landing/shots/harrys-4-exact.png',
  '/landing/shots/harrys-5-exact.png',
  '/landing/shots/harrys-6-exact.png',
]

// ============================================================
// HERO
// ============================================================
function Hero() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  return (
    <section style={{ position: 'relative', overflow: 'hidden' }}>
      {/* Ambient gradient */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: `radial-gradient(900px 500px at 75% -10%, ${T.brandTint}, transparent 60%), radial-gradient(700px 400px at 10% 100%, ${T.tealTint}, transparent 60%)`,
        pointerEvents: 'none',
      }} />
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: isMobile ? '32px 16px 24px' : '56px 32px 48px', position: 'relative', textAlign: 'center' }}>
        <Pill style={{ marginBottom: 20 }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: T.teal }} />
          performance creative co-pilot · for media buyers
        </Pill>
        <h1 style={{
          fontFamily: fontDisplay,
          fontSize: isMobile ? 42 : 72,
          lineHeight: 1.05,
          letterSpacing: '-0.035em',
          fontWeight: 600,
          margin: '0 auto',
          color: T.text,
          maxWidth: 1100,
          paddingBottom: '0.15em',
        }}>
          Save what's winning.<br />
          <span style={{ color: T.textMuted, fontWeight: 400 }}>Generate ads that</span>{' '}
          <span style={{
            background: `linear-gradient(180deg, ${T.brandSoft}, ${T.brand})`,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}>rhyme with it.</span>
        </h1>
        <p style={{
          fontFamily: fontBody,
          fontSize: isMobile ? 15 : 17,
          lineHeight: 1.5,
          color: T.textMuted,
          margin: '20px auto 0',
          maxWidth: 'none',
          fontWeight: 400,
        }}>
          One loop for swipe, generation, and winners — so your references actually shape the next batch.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', marginTop: 20 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link to="/home" style={{ textDecoration: 'none' }}>
              <Btn kind="primary" size="lg">Start 7-day free trial →</Btn>
            </Link>
          </div>
          <MonoLabel>card required · cancel before day 7, no charge</MonoLabel>
        </div>

        {/* Hero composition: photo → batch */}
        <div style={{ marginTop: 36, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 2fr', gap: isMobile ? 16 : 32, alignItems: 'center' }}>
          {/* Source */}
          <div>
            <MonoLabel style={{ marginBottom: 10, display: 'block' }}>01 · source photo</MonoLabel>
            <div style={{
              aspectRatio: '1',
              background: T.bgElev,
              borderRadius: 12,
              border: `1px solid ${T.border}`,
              padding: 14,
              position: 'relative',
            }}>
              <img
                src={HERO_SOURCE_SHOT}
                alt="Product shot"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  borderRadius: 6,
                  border: `1px solid ${T.border}`,
                  display: 'block',
                  background: T.bg,
                }}
              />
              <div style={{ position: 'absolute', bottom: 14, left: 14, right: 14, padding: '8px 10px', background: '#0B0D10ee', borderRadius: 6, border: `1px solid ${T.border}`, fontFamily: fontMono, fontSize: 10, color: T.textMuted }}>
                <div style={{ color: T.teal }}>✓ background removed</div>
                <div>✓ analyzed · "Harry's hydrating night lotion"</div>
                <div>✓ description generated</div>
              </div>
            </div>
          </div>
          {/* Arrow + batch */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <MonoLabel>02 · one batch · 12 distinct variants · 1:1 / 4:5 / 9:16</MonoLabel>
            </div>
            <div style={{
              background: T.bgElev,
              borderRadius: 12,
              border: `1px solid ${T.border}`,
              padding: 16,
            }}>
              {/* CSS-columns masonry: each variant keeps its natural aspect
                  ratio, no cropping, columns auto-balance heights. */}
              <div style={{ columnCount: isMobile ? 2 : 3, columnGap: 1 }}>
                {HERO_VARIANT_SHOTS.map((src, i) => (
                  <img
                    key={i}
                    src={src}
                    alt={`Generated ad #${i + 1}`}
                    style={{
                      width: '100%',
                      marginBottom: 1,
                      borderRadius: 8,
                      border: `1px solid ${T.border}`,
                      display: 'block',
                      breakInside: 'avoid',
                    }}
                  />
                ))}
              </div>
              <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, borderTop: `1px dashed ${T.border}`, gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Pill color={T.teal} bg={T.tealTint}>★ 4 starred</Pill>
                  <Pill>angle: comparison</Pill>
                  {!isMobile && <Pill>brand: harry's</Pill>}
                </div>
                <MonoLabel>→ download / iterate</MonoLabel>
              </div>
            </div>
          </div>
        </div>

      </div>
    </section>
  )
}

// ============================================================
// LOOP DIAGRAM
// ============================================================

function LoopCard({ tag, title, sub, children, highlighted }: {
  tag: string; title: string; sub: string; children: React.ReactNode; highlighted?: boolean
}) {
  return (
    <div style={{
      background: highlighted ? T.bg : '#fff',
      color: highlighted ? T.text : T.ink,
      border: `1px solid ${highlighted ? T.brand : T.borderCream}`,
      borderRadius: 12,
      padding: 20,
      boxShadow: highlighted ? `0 20px 40px -20px ${T.brand}55` : '0 1px 2px rgba(0,0,0,0.03)',
    }}>
      <MonoLabel color={highlighted ? T.brandSoft : T.brand}>{tag}</MonoLabel>
      <div style={{
        fontFamily: fontDisplay,
        fontSize: 22,
        fontWeight: 600,
        letterSpacing: '-0.02em',
        marginTop: 8,
        lineHeight: 1.15,
      }}>{title}</div>
      <div style={{
        fontFamily: fontBody,
        fontSize: 13,
        color: highlighted ? T.textMuted : T.textOnCreamMuted,
        marginTop: 6,
        lineHeight: 1.45,
      }}>{sub}</div>
      <div style={{ marginTop: 18 }}>{children}</div>
    </div>
  )
}

function LoopArrow() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width="60" height="20" viewBox="0 0 60 20">
        <path d="M 4 10 L 50 10" stroke={T.brand} strokeWidth="1.5" strokeDasharray="3 3" fill="none" />
        <path d="M 46 5 L 54 10 L 46 15" stroke={T.brand} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

function LoopSection() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  return (
    <section style={{ background: T.cream, color: T.ink, position: 'relative' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: isMobile ? '64px 16px' : '120px 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: isMobile ? 32 : 56 }}>
          <Eyebrow color={T.brand} style={{ justifyContent: 'center' }}>the loop · 01</Eyebrow>
          <h2 style={{
            fontFamily: fontDisplay,
            fontSize: isMobile ? 36 : 64,
            lineHeight: 1.05,
            letterSpacing: '-0.035em',
            fontWeight: 600,
            margin: '20px auto 0',
            color: T.ink,
            maxWidth: 900,
            paddingBottom: '0.18em',
          }}>
            Swipe feeds generation.{' '}
            <span style={{ color: T.textOnCreamMuted, fontWeight: 400 }}>Generation feeds winners.</span>{' '}
            <span style={{ color: T.brand }}>Winners feed swipe.</span>
          </h2>
          <p style={{ fontFamily: fontBody, fontSize: 18, lineHeight: 1.55, color: T.textOnCreamMuted, margin: '24px auto 0', maxWidth: 680 }}>
            Every reference, winner, and extracted angle is already in the prompt by default.
          </p>
        </div>

        {/* The diagram */}
        <div style={{
          background: T.creamElev,
          border: `1px solid ${T.borderCream}`,
          borderRadius: 16,
          padding: isMobile ? 16 : 32,
          position: 'relative',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 60px 1fr 60px 1fr', alignItems: 'stretch', gap: isMobile ? 16 : 0 }}>
            {/* SWIPE */}
            <LoopCard
              tag="step 01 · swipe"
              title="Save references"
              sub="Per-product. Bookmark templates, paste competitor URLs, drag images in."
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <img
                    key={i}
                    src={`/landing/shots/ref-${i}.jpg`}
                    alt={`Reference ${i}`}
                    style={{
                      width: '100%',
                      aspectRatio: '1',
                      objectFit: 'cover',
                      borderRadius: 4,
                      border: `1px solid ${T.borderCream}`,
                      display: 'block',
                    }}
                  />
                ))}
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Pill color={T.textOnCreamMuted} bg="#F1F3F5" style={{ borderColor: T.borderCream }}>17 saved</Pill>
                <Pill color={T.textOnCreamMuted} bg="#F1F3F5" style={{ borderColor: T.borderCream }}>4 categories</Pill>
              </div>
            </LoopCard>

            {!isMobile && <LoopArrow />}

            {/* GENERATE */}
            <LoopCard
              tag="step 02 · generate"
              title="Refs feed the prompt"
              sub="Plus VOC, plus brand kit, plus angle. All auto-applied per product."
              highlighted
            >
              <div style={{
                background: T.bg,
                borderRadius: 8,
                padding: 14,
                fontFamily: fontMono,
                fontSize: 11,
                color: T.textMuted,
                lineHeight: 1.7,
              }}>
                <div><span style={{ color: T.brandSoft }}>prompt</span> "split-frame compare"</div>
                <div><span style={{ color: T.teal }}>+ refs</span> 3 from swipe file</div>
                <div><span style={{ color: T.teal }}>+ voc</span> "I bought this twice"</div>
                <div><span style={{ color: T.teal }}>+ brand</span> harry's kit</div>
                <div><span style={{ color: T.teal }}>+ angle</span> comparison</div>
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${T.border}`, color: T.text }}>→ 12 variants</div>
              </div>
            </LoopCard>

            {!isMobile && <LoopArrow />}

            {/* WINNERS */}
            <LoopCard
              tag="step 03 · winners loop"
              title="Star → next batch references it"
              sub="Cross-product library. Filter by ★. Build on what works."
            >
              {/* CSS-columns masonry: variants are uniform 1024×1024 so
                  the column flow renders cleanly without cropping. */}
              <div style={{ columnCount: 2, columnGap: 6 }}>
                {[
                  { src: '/landing/shots/toiletry-1.png', star: true },
                  { src: '/landing/shots/toiletry-2.png', star: false },
                  { src: '/landing/shots/toiletry-3.png', star: true },
                  { src: '/landing/shots/toiletry-4.png', star: false },
                ].map(({ src, star }, i) => (
                  <img
                    key={i}
                    src={src}
                    alt={star ? 'Winner ad' : 'Ad thumbnail'}
                    style={{
                      width: '100%',
                      marginBottom: 6,
                      borderRadius: 4,
                      border: `1px solid ${star ? T.brand : T.borderCream}`,
                      display: 'block',
                      breakInside: 'avoid',
                    }}
                  />
                ))}
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Pill color={T.teal} bg={T.tealTint} style={{ borderColor: T.teal + '55' }}>2 winners</Pill>
                <Pill color={T.textOnCreamMuted} bg="#F1F3F5" style={{ borderColor: T.borderCream }}>cross-product</Pill>
              </div>
            </LoopCard>
          </div>

          {/* Loopback arrow */}
          {!isMobile && (
            <div style={{ marginTop: 40, position: 'relative', height: 50 }}>
              <svg width="100%" height="50" viewBox="0 0 1000 50" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }}>
                <defs>
                  <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill={T.brand} />
                  </marker>
                </defs>
                <path d="M 950 5 Q 500 80, 50 5" stroke={T.brand} strokeWidth="1.5" fill="none" strokeDasharray="6 4" markerEnd="url(#arrowhead)" />
              </svg>
              <div style={{
                position: 'absolute',
                top: 18,
                left: '50%',
                transform: 'translateX(-50%)',
                background: T.creamElev,
                padding: '4px 14px',
                borderRadius: 999,
                border: `1px solid ${T.brand}33`,
                whiteSpace: 'nowrap',
              }}>
                <MonoLabel color={T.brand}>↻ winners feed back into swipe · the loop nobody else has</MonoLabel>
              </div>
            </div>
          )}
          {isMobile && (
            <div style={{ marginTop: 16, textAlign: 'center', padding: '10px 14px', borderRadius: 999, border: `1px solid ${T.brand}33`, display: 'inline-block' }}>
              <MonoLabel color={T.brand}>↻ winners feed back into swipe · the loop nobody else has</MonoLabel>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

// ============================================================
// SPLIT-TOOL COMPARISON
// ============================================================

function CompareCard({ tier, title, desc, rows, primary }: {
  tier: string; title: string; desc: string; rows: Array<[string, boolean | 'limited']>; primary?: boolean
}) {
  const isMobile = useMediaQuery('(max-width: 768px)')
  return (
    <div style={{
      background: primary
        ? `linear-gradient(180deg, ${T.brand}, ${T.brand} 60%, ${T.brandSoft})`
        : T.bgElev,
      color: primary ? '#fff' : T.text,
      border: primary ? `2px solid ${T.brandSoft}` : `1px solid ${T.border}`,
      borderRadius: 14,
      padding: primary ? 32 : 28,
      position: 'relative',
      overflow: 'hidden',
      transform: primary && !isMobile ? 'translateY(-12px) scale(1.03)' : 'none',
      boxShadow: primary ? `0 32px 64px -24px ${T.brand}cc, 0 0 0 1px ${T.brand}55` : 'none',
      zIndex: primary ? 2 : 1,
    }}>
      {primary && (
        <div style={{
          position: 'absolute',
          top: 0, right: 0,
          width: 280, height: 280,
          background: 'radial-gradient(circle at top right, #ffffff44, transparent 60%)',
          pointerEvents: 'none',
        }} />
      )}
      {primary && (
        <div style={{ position: 'absolute', top: 18, right: 18 }}>
          <span style={{
            fontFamily: fontMono,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            padding: '5px 10px',
            background: '#fff',
            color: T.brand,
            borderRadius: 999,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}>★ recommended</span>
        </div>
      )}
      <MonoLabel color={primary ? '#ffffffcc' : T.textDim}>{tier}</MonoLabel>
      <div style={{
        fontFamily: fontDisplay,
        fontSize: primary ? 32 : 26,
        fontWeight: 600,
        letterSpacing: '-0.025em',
        marginTop: 10,
        lineHeight: 1.1,
      }}>{title}</div>
      <p style={{
        fontFamily: fontBody,
        fontSize: primary ? 15 : 14,
        color: primary ? '#ffffffcc' : T.textMuted,
        lineHeight: 1.5,
        marginTop: 8,
        marginBottom: primary ? 26 : 22,
      }}>{desc}</p>
      <div style={{ borderTop: `1px solid ${primary ? '#ffffff33' : T.border}` }}>
        {rows.map(([label, val], i) => (
          <div key={i} style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: primary ? '13px 0' : '11px 0',
            borderBottom: `1px solid ${primary ? '#ffffff33' : T.border}`,
          }}>
            <span style={{
              fontFamily: fontBody,
              fontSize: primary ? 14 : 13,
              color: primary ? '#ffffffdd' : T.textMuted,
              fontWeight: primary ? 500 : 400,
            }}>{label}</span>
            <span style={{ fontFamily: fontMono, fontSize: primary ? 13 : 12 }}>
              {val === true && <span style={{ color: primary ? '#fff' : T.teal, fontWeight: primary ? 600 : 400 }}>● yes</span>}
              {val === false && <span style={{ color: primary ? '#ffffff66' : T.textDim }}>○ no</span>}
              {val === 'limited' && <span style={{ color: primary ? '#ffffffaa' : T.warn }}>◐ limited</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SplitSection() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  return (
    <section style={{ background: T.bg, color: T.text }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: isMobile ? '64px 16px' : '120px 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: isMobile ? 32 : 56 }}>
          <Eyebrow style={{ justifyContent: 'center' }}>positioning · 02</Eyebrow>
          <h2 style={{
            fontFamily: fontDisplay,
            fontSize: isMobile ? 36 : 56,
            lineHeight: 1.05,
            letterSpacing: '-0.03em',
            fontWeight: 600,
            margin: '20px auto 16px',
            maxWidth: 'none',
            paddingBottom: '0.18em',
          }}>
            Most teams run two tools.{' '}
            <span style={{ color: T.textMuted, fontWeight: 400 }}>We don't see why.</span>
          </h2>
          <p style={{ fontFamily: fontBody, fontSize: 17, color: T.textMuted, maxWidth: 'none', margin: '0 auto', lineHeight: 1.55 }}>
            Swipe tools study what's winning. Generators make new things. Almost no one closes the loop.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1.15fr', gap: isMobile ? 16 : 20, alignItems: 'start', paddingTop: 16, paddingBottom: 32 }}>
          <CompareCard
            tier="option a"
            title="Swipe-file tools"
            desc="Browse and save winning ads from a public library. Tag and organize. But they're a research tool — not a creative one."
            rows={[
              ['Swipe library', true],
              ['Save / tag refs', true],
              ['Generate ads', false],
              ['Angle extraction', false],
              ['Multi-brand', 'limited'],
              ['Surgical iteration', false],
            ]}
          />
          <CompareCard
            tier="option b"
            title="Generic AI ad gen"
            desc="Type a prompt, get an image. No memory of category. No reference for what's already converting in your niche. Templates only."
            rows={[
              ['Swipe library', false],
              ['Save / tag refs', false],
              ['Generate ads', true],
              ['Angle extraction', false],
              ['Multi-brand', false],
              ['Surgical iteration', false],
            ]}
          />
          <CompareCard
            tier="option c · prodsnap"
            title="Both. One loop."
            desc="Swipe + reference + generate + iterate, in one place. Per product, per brand. Every signal in your account ends up in the prompt."
            rows={[
              ['Swipe library', true],
              ['Save / tag refs', true],
              ['Generate ads', true],
              ['Angle extraction', true],
              ['Multi-brand', true],
              ['Surgical iteration', true],
            ]}
            primary
          />
        </div>
      </div>
    </section>
  )
}

// ============================================================
// THREE ON-RAMPS
// ============================================================

function OnrampCard({ tag, title, desc, children, modes, tagPrimary }: {
  tag: string; title: string; desc: string; children: React.ReactNode; modes?: string[]; tagPrimary?: boolean
}) {
  return (
    <div style={{
      background: T.creamElev,
      border: `1px solid ${T.borderCream}`,
      borderRadius: 14,
      padding: 24,
      display: 'flex',
      flexDirection: 'column',
    }}>
      <MonoLabel color={tagPrimary ? T.brand : T.textOnCreamMuted}>{tag}</MonoLabel>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10 }}>
        <h3 style={{
          fontFamily: fontDisplay,
          fontSize: 28,
          fontWeight: 600,
          letterSpacing: '-0.025em',
          margin: 0,
          color: T.ink,
        }}>{title}</h3>
        {tagPrimary && <Pill color={T.brand} bg={T.brandTint}>★ auto</Pill>}
      </div>
      <p style={{ fontFamily: fontBody, fontSize: 14, color: T.textOnCreamMuted, lineHeight: 1.5, margin: '6px 0 18px' }}>{desc}</p>
      <div style={{ flex: 1 }}>{children}</div>
      {modes && (
        <div style={{ marginTop: 14, display: 'flex', gap: 6 }}>
          {modes.map((m, i) => (
            <span key={i} style={{
              padding: '4px 10px',
              fontFamily: fontMono,
              fontSize: 11,
              background: i === 0 ? T.brand : '#fff',
              color: i === 0 ? '#fff' : T.ink,
              border: `1px solid ${i === 0 ? T.brand : T.borderCream}`,
              borderRadius: 4,
            }}>{m}</span>
          ))}
        </div>
      )}
    </div>
  )
}

function OnrampsSection() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  return (
    <section style={{ background: T.cream, color: T.ink }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: isMobile ? '64px 16px' : '120px 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: isMobile ? 32 : 56 }}>
          <Eyebrow color={T.brand} style={{ justifyContent: 'center' }}>three on-ramps · 03</Eyebrow>
          <h2 style={{
            fontFamily: fontDisplay,
            fontSize: isMobile ? 36 : 56,
            lineHeight: 1.05,
            letterSpacing: '-0.03em',
            fontWeight: 600,
            margin: '20px auto 0',
            color: T.ink,
            maxWidth: 900,
            paddingBottom: '0.18em',
          }}>
            Templates. Custom prompts. Marketing angles.{' '}
            <span style={{ color: T.textOnCreamMuted, fontWeight: 400 }}>Pick the one that matches your week.</span>
          </h2>
          <p style={{ fontFamily: fontBody, fontSize: 17, color: T.textOnCreamMuted, lineHeight: 1.55, margin: '32px auto 0', maxWidth: 700 }}>
            Three first-class paths into a batch, equally weighted.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: isMobile ? 16 : 20 }}>
          {/* Templates */}
          <OnrampCard
            tag="on-ramp / 01"
            title="Templates"
            desc="Curated, searchable library of proven Facebook ads. Filter by category, image style, setting, marketing angle, aspect ratio."
            modes={['Exact mode', 'Remix mode']}
          >
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 6 }}>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <img
                  key={i}
                  src={`/landing/shots/template-${i}.jpg`}
                  alt={`Template ${i}`}
                  style={{
                    width: '100%',
                    aspectRatio: '1',
                    objectFit: 'cover',
                    borderRadius: 4,
                    border: `1px solid ${T.borderCream}`,
                    display: 'block',
                  }}
                />
              ))}
            </div>
            <div style={{ marginTop: 12, padding: 10, background: '#fff', border: `1px solid ${T.borderCream}`, borderRadius: 6, display: 'flex', gap: 6, alignItems: 'center', fontFamily: fontMono, fontSize: 11, color: T.textOnCreamMuted }}>
              <span>filter:</span>
              <span style={{ padding: '2px 6px', background: T.brandTint, borderRadius: 3, color: T.brand }}>category ·</span>
              <span style={{ padding: '2px 6px', background: T.brandTint, borderRadius: 3, color: T.brand }}>angle ·</span>
              <span style={{ padding: '2px 6px', background: T.brandTint, borderRadius: 3, color: T.brand }}>1:1</span>
            </div>
          </OnrampCard>

          {/* Custom prompt */}
          <OnrampCard
            tag="on-ramp / 02"
            title="Custom prompt"
            tagPrimary
            desc="Plain English. The chip builder helps with structure. AI suggests prompts tailored to your specific product."
          >
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 10, padding: 4, background: '#fff', border: `1px solid ${T.borderCream}`, borderRadius: 8 }}>
              {([['Free text', true], ['Chip builder', false], ['From template', false]] as Array<[string, boolean]>).map(([l, on], i) => (
                <span key={i} style={{
                  padding: '6px 10px',
                  fontFamily: fontMono,
                  fontSize: 10,
                  background: on ? T.brand : 'transparent',
                  color: on ? '#fff' : T.textOnCreamMuted,
                  borderRadius: 5,
                  fontWeight: on ? 600 : 400,
                  cursor: 'pointer',
                  flex: 1,
                  textAlign: 'center',
                }}>{l}</span>
              ))}
            </div>
            <div style={{
              background: '#fff',
              border: `1.5px solid ${T.brand}`,
              borderRadius: 6,
              padding: 14,
              fontFamily: fontBody,
              fontSize: 13,
              color: T.ink,
              lineHeight: 1.5,
              minHeight: 92,
              boxShadow: `0 0 0 4px ${T.brandTint}`,
              position: 'relative',
            }}>
              <div style={{ position: 'absolute', top: 8, right: 10, fontFamily: fontMono, fontSize: 9, color: T.brand, letterSpacing: '0.06em' }}>● writing</div>
              On a soft linen surface, golden-hour lighting, with citrus and ribbons of cream — focus on the <span style={{ background: T.brandTint, padding: '0 4px', borderRadius: 2, color: T.brand, fontWeight: 500 }}>bottle's matte finish</span>...
              <span style={{ display: 'inline-block', width: 1, height: 14, background: T.brand, marginLeft: 2, verticalAlign: 'middle', animation: 'blink 1s infinite' }}/>
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ fontFamily: fontMono, fontSize: 10, color: T.textOnCreamMuted, marginBottom: 6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>add to prompt</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {([
                  ['setting', false],
                  ['lighting', true],
                  ['mood', false],
                  ['camera', false],
                  ['style', false],
                  ['voc', false],
                ] as Array<[string, boolean]>).map(([l, on], i) => (
                  <span key={i} style={{
                    padding: '5px 10px',
                    fontFamily: fontMono,
                    fontSize: 11,
                    border: `1px solid ${on ? T.brand : T.borderCream}`,
                    background: on ? T.brand : '#fff',
                    color: on ? '#fff' : T.textOnCreamMuted,
                    borderRadius: 999,
                    fontWeight: on ? 500 : 400,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}>
                    {on ? '✓' : '+'} {l}
                  </span>
                ))}
              </div>
            </div>
            <div style={{
              marginTop: 12,
              padding: '8px 10px',
              background: T.brandTint,
              border: `1px solid ${T.brand}33`,
              borderRadius: 6,
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
              fontFamily: fontBody,
              fontSize: 12,
            }}>
              <span style={{ color: T.brand, fontSize: 13, marginTop: 1 }}>✦</span>
              <div>
                <span style={{ color: T.brand, fontWeight: 600 }}>AI suggestion:</span>{' '}
                <span style={{ color: T.textOnCreamMuted }}>try "macro · texture-focus" — typically wins for skincare in your category.</span>
              </div>
            </div>
          </OnrampCard>

          {/* Marketing angle */}
          <OnrampCard
            tag="on-ramp / 03"
            title="Marketing angle"
            desc="Auto-extracted from your product. Click any angle, the wizard opens prefilled. Generate twelve ads tuned for it."
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {([
                ['Comparison', 'vs. the drugstore lotion you settled for', true],
                ['Curiosity', 'why your night cream stops working at 3am', false],
                ['Social proof', '"finally a lotion my partner steals"', false],
                ['Problem callout', 'morning skin shouldn\'t feel like sandpaper', false],
              ] as Array<[string, string, boolean]>).map(([title, hook, sel]) => (
                <div key={title} style={{
                  padding: '10px 12px',
                  background: sel ? T.brand : '#fff',
                  border: `1px solid ${sel ? T.brand : T.borderCream}`,
                  borderRadius: 6,
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                }}>
                  <div style={{
                    width: 14, height: 14, marginTop: 2,
                    borderRadius: 7,
                    border: `1.5px solid ${sel ? '#fff' : T.borderCream}`,
                    background: sel ? '#fff' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {sel && <div style={{ width: 6, height: 6, borderRadius: 3, background: T.brand }}/>}
                  </div>
                  <div>
                    <div style={{ fontFamily: fontBody, fontSize: 13, fontWeight: 600, color: sel ? '#fff' : T.ink }}>{title}</div>
                    <div style={{ fontFamily: fontBody, fontSize: 12, fontStyle: 'italic', color: sel ? '#ffffffcc' : T.textOnCreamMuted, marginTop: 2 }}>"{hook}"</div>
                  </div>
                </div>
              ))}
            </div>
          </OnrampCard>
        </div>
      </div>
    </section>
  )
}

// ============================================================
// VOICE OF CUSTOMER
// ============================================================

function VOCSection() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  return (
    <section style={{ background: T.bg, color: T.text }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: isMobile ? '64px 16px' : '120px 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: isMobile ? 32 : 56 }}>
          <Eyebrow style={{ justifyContent: 'center' }}>workflow muscle · 04</Eyebrow>
          <h2 style={{
            fontFamily: fontDisplay,
            fontSize: isMobile ? 36 : 56,
            lineHeight: 1.05,
            letterSpacing: '-0.03em',
            fontWeight: 600,
            margin: '20px auto 0',
            maxWidth: 900,
            paddingBottom: '0.18em',
          }}>
            Sounds like the customer.<br />
            <span style={{ color: T.textMuted, fontWeight: 400 }}>Not like the AI.</span>
          </h2>
          <p style={{ fontFamily: fontBody, fontSize: 17, color: T.textMuted, lineHeight: 1.55, margin: '32px auto 0', maxWidth: 700 }}>
            Paste real phrases per-product. The generator writes in that exact voice.
          </p>
        </div>
        {/* Two-panel: paste pile -> generated headlines, with arrow between */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 110px 1fr', gap: isMobile ? 16 : 0, alignItems: 'stretch', marginTop: 24 }}>
          {/* LEFT: paste pile (input) */}
          <div style={{
            background: T.bg,
            border: `1px solid ${T.border}`,
            borderRadius: 14,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
          }}>
            <div style={{
              padding: '4px 12px',
              background: T.bgElev2,
              borderBottom: `1px solid ${T.border}`,
              fontFamily: fontMono,
              fontSize: 9,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: T.textDim,
              textAlign: 'center',
              fontWeight: 600,
            }}>step 1 · input</div>
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <MonoLabel color={T.text}>customer voice</MonoLabel>
                <MonoLabel>· harry's</MonoLabel>
              </div>
              <MonoLabel color={T.textDim}>17 phrases</MonoLabel>
            </div>
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
              {[
                { src: 'amazon · ★★★★★', q: 'I bought this twice. The second was for my partner.', tags: ['repeat-buyer', 'gift'] },
                { src: 'instagram comment', q: "finally a lotion that doesn't smell like a chemistry lab.", tags: ['authenticity'] },
                { src: 'support ticket #2,847', q: 'saved my dry-skin spiral. mornings actually feel different.', tags: ['problem-solved'] },
                { src: 'reddit · r/SkincareAddiction', q: "the texture actually matters. didn't expect that.", tags: ['surprise'] },
              ].map((v, i) => (
                <div key={i} style={{
                  background: T.bgElev,
                  border: `1px dashed ${T.border}`,
                  borderRadius: 6,
                  padding: '8px 10px',
                }}>
                  <MonoLabel color={T.textDim}>{v.src}</MonoLabel>
                  <div style={{ fontFamily: fontBody, fontSize: 12, color: T.textMuted, marginTop: 3, fontStyle: 'italic', lineHeight: 1.4 }}>"{v.q}"</div>
                  <div style={{ marginTop: 5, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {v.tags.map(t => (
                      <span key={t} style={{
                        fontFamily: fontMono, fontSize: 9,
                        padding: '1px 5px',
                        background: 'transparent',
                        color: T.textDim,
                        border: `1px solid ${T.border}`,
                        borderRadius: 2,
                      }}>{t}</span>
                    ))}
                  </div>
                </div>
              ))}
              <div style={{
                padding: '8px 10px', border: `1px dashed ${T.border}`, borderRadius: 6, fontFamily: fontMono, fontSize: 10, color: T.textDim, textAlign: 'center',
              }}>+ paste from clipboard</div>
            </div>
          </div>

          {/* MIDDLE arrow */}
          <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: isMobile ? '8px 0' : '0 8px' }}>
            {!isMobile && <div style={{ flex: 1, width: 1, background: `linear-gradient(180deg, transparent, ${T.border}, transparent)` }} />}
            {isMobile && <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, transparent, ${T.border}, transparent)` }} />}
            <div style={{
              width: 44, height: 44, borderRadius: 22,
              background: T.brand,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 20,
              boxShadow: `0 8px 24px -8px ${T.brand}aa, 0 0 0 6px ${T.brandTint}`,
            }}>{isMobile ? '↓' : '→'}</div>
            <MonoLabel color={T.brandSoft} style={{ textAlign: 'center', whiteSpace: 'nowrap', display: 'block' }}>used as voice</MonoLabel>
            {!isMobile && <div style={{ flex: 1, width: 1, background: `linear-gradient(180deg, transparent, ${T.border}, transparent)` }} />}
            {isMobile && <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, transparent, ${T.border}, transparent)` }} />}
          </div>

          {/* RIGHT: generated headlines (output) */}
          <div style={{
            background: `linear-gradient(180deg, ${T.brand}1a, ${T.bgElev} 30%)`,
            border: `1.5px solid ${T.brand}`,
            borderRadius: 14,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: `0 30px 60px -30px ${T.brand}88`,
            transform: isMobile ? 'none' : 'translateY(-8px)',
            position: 'relative',
          }}>
            <div style={{
              padding: '4px 12px',
              background: T.brand,
              fontFamily: fontMono,
              fontSize: 9,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: '#fff',
              textAlign: 'center',
              fontWeight: 600,
            }}>step 2 · output · in your voice</div>
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <MonoLabel color={T.text}>generated copy</MonoLabel>
                <MonoLabel>· batch #34</MonoLabel>
              </div>
              <span style={{
                fontFamily: fontMono, fontSize: 10,
                padding: '3px 8px',
                background: T.brandTint,
                color: T.brandSoft,
                borderRadius: 999,
                border: `1px solid ${T.brand}66`,
                fontWeight: 600,
                letterSpacing: '0.06em',
              }}>● voice: on</span>
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
              {[
                { hl: 'Worth buying twice.', body: "The second's usually for someone you sleep next to.", src: 'from amazon · repeat-buyer', tone: 'social proof' },
                { hl: 'Not a chemistry lab. A nightcap.', body: 'For people whose noses got tired of synthetic.', src: 'from instagram · authenticity', tone: 'identity' },
                { hl: 'Mornings, fixed.', body: 'The dry spiral, broken.', src: 'from support · problem-solved', tone: 'utility' },
                { hl: 'Turns out texture matters.', body: 'A small thing nobody told you.', src: 'from reddit · surprise', tone: 'discovery' },
              ].map((v, i) => (
                <div key={i} style={{
                  background: T.bg,
                  border: `1px solid ${T.border}`,
                  borderRadius: 8,
                  padding: 14,
                  boxShadow: '0 1px 0 rgba(255,255,255,0.04)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <MonoLabel color={T.textDim}>{v.src}</MonoLabel>
                    <span style={{
                      fontFamily: fontMono, fontSize: 9,
                      padding: '2px 6px',
                      background: T.tealTint,
                      color: T.teal,
                      borderRadius: 3,
                      border: `1px solid ${T.teal}33`,
                    }}>{v.tone}</span>
                  </div>
                  <div style={{ fontFamily: fontDisplay, fontSize: 20, color: T.text, fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.15 }}>{v.hl}</div>
                  <div style={{ fontFamily: fontBody, fontSize: 13, color: T.textMuted, marginTop: 4, lineHeight: 1.45 }}>{v.body}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Three small notes below */}
        <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: isMobile ? 16 : 24 }}>
          {[
            ['Per-product, never global', 'Each brand keeps its own voice library.'],
            ['Headlines, body, CTAs', 'Or just the parts you turn on.'],
            ['No stylization', "Phrases stay the buyer's — not the AI's."],
          ].map(([t, b]) => (
            <div key={t} style={{ paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
              <div style={{ fontFamily: fontBody, fontSize: 14, fontWeight: 500, color: T.text }}>{t}</div>
              <div style={{ fontFamily: fontBody, fontSize: 13, color: T.textMuted, marginTop: 4, lineHeight: 1.45 }}>{b}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================================
// SURGICAL ITERATION
// ============================================================

function SurgicalSection() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  return (
    <section style={{ background: T.cream, color: T.ink }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: isMobile ? '64px 16px' : '120px 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <Eyebrow color={T.brand} style={{ justifyContent: 'center' }}>workflow muscle · 05</Eyebrow>
          <h2 style={{
            fontFamily: fontDisplay,
            fontSize: isMobile ? 36 : 56,
            lineHeight: 1.05,
            letterSpacing: '-0.03em',
            fontWeight: 600,
            margin: '20px auto 0',
            color: T.ink,
            maxWidth: 'none',
            paddingBottom: '0.18em',
          }}>
            Change one layer.{' '}
            <span style={{ color: T.textOnCreamMuted, fontWeight: 400 }}>Lock the rest.</span>
          </h2>
          <p style={{ fontFamily: fontBody, fontSize: 17, color: T.textOnCreamMuted, lineHeight: 1.55, margin: '20px auto 0', maxWidth: 'none' }}>
            Don't regenerate from scratch. Vary just the part that wasn't working — keep everything that was.
          </p>
        </div>

        {/* Two side-by-side examples: colors + text */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 16 : 24, marginTop: 24 }}>
          <SurgicalExample
            label="vary: colors"
            sub="same composition · same copy"
            activeChip="Colors"
            sources={[
              '/landing/shots/cole-haan-color-1.png',
              '/landing/shots/cole-haan-color-2.png',
            ]}
          />
          <SurgicalExample
            label="vary: text"
            sub="same composition · same colors"
            activeChip="Text"
            sources={[
              '/landing/shots/cole-haan-text-1.png',
              '/landing/shots/cole-haan-text-2.png',
            ]}
          />
        </div>

        {/* Buyer-language tagline — minimal, matches the section's display-font
            + mono-caption rhythm (no heavy callout box). */}
        <div style={{
          margin: '40px auto 0',
          textAlign: 'center',
          maxWidth: 760,
        }}>
          <div style={{
            fontFamily: fontDisplay,
            fontSize: isMobile ? 18 : 24,
            fontWeight: 400,
            color: T.ink,
            letterSpacing: '-0.015em',
            lineHeight: 1.3,
          }}>
            Keep the structure that worked.{' '}
            <span style={{ color: T.brand }}>Vary the part that didn't.</span>
          </div>
          <MonoLabel color={T.textOnCreamMuted} style={{ display: 'block', marginTop: 10 }}>
            "creative refresh" — in a buyer's words
          </MonoLabel>
        </div>
      </div>
    </section>
  )
}

function SurgicalExample({
  label, sub, activeChip, sources,
}: {
  label: string
  sub: string
  activeChip: 'Colors' | 'Text'
  sources: string[]
}) {
  const chips: Array<[string, boolean]> = [
    ['Text', activeChip === 'Text'],
    ['Icons', false],
    ['Colors', activeChip === 'Colors'],
    ['Composition', false],
    ['Aspect ratio', false],
  ]
  return (
    <div style={{
      background: T.bg,
      color: T.text,
      border: `1px solid ${T.border}`,
      borderRadius: 14,
      overflow: 'hidden',
      boxShadow: '0 24px 48px -28px rgba(0,0,0,0.25)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header bar */}
      <div style={{
        padding: '12px 16px',
        borderBottom: `1px solid ${T.border}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <MonoLabel color={T.text}>{label}</MonoLabel>
        <MonoLabel color={T.textDim}>{sub}</MonoLabel>
      </div>

      {/* Lock-chip row */}
      <div style={{
        padding: '12px 16px',
        borderBottom: `1px solid ${T.border}`,
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        {chips.map(([l, on]) => (
          <div key={l} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 10px',
            borderRadius: 999,
            border: `1px solid ${on ? T.brand : T.border}`,
            background: on ? T.brandTint : 'transparent',
          }}>
            <div style={{
              width: 10, height: 10, borderRadius: 2,
              border: `1.5px solid ${on ? T.brand : T.border}`,
              background: on ? T.brand : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {on && <span style={{ color: '#fff', fontSize: 8, lineHeight: 1 }}>✓</span>}
              {!on && <span style={{ color: T.textDim, fontSize: 8, lineHeight: 1 }}>🔒</span>}
            </div>
            <span style={{
              fontFamily: fontBody,
              fontSize: 12,
              color: on ? T.text : T.textMuted,
              fontWeight: on ? 500 : 400,
            }}>{l}</span>
          </div>
        ))}
      </div>

      {/* Variants — auto-fit row at 9:16 aspect ratio. Both example cards
          render an equal number of thumbs, so heights match. */}
      <div style={{
        padding: 16,
        flex: 1,
        display: 'grid',
        gridTemplateColumns: `repeat(${sources.length}, 1fr)`,
        gap: 8,
        alignItems: 'start',
      }}>
        {sources.map((src, i) => (
          <img
            key={i}
            src={src}
            alt={`${activeChip} variant ${i + 1}`}
            style={{
              width: '100%',
              aspectRatio: '9 / 16',
              objectFit: 'cover',
              borderRadius: 8,
              border: `1px solid ${T.border}`,
              display: 'block',
            }}
          />
        ))}
      </div>
    </div>
  )
}

// ============================================================
// FEATURE GRID
// ============================================================

function FeatureGrid() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  return (
    <section style={{ background: T.bg, color: T.text }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: isMobile ? '64px 16px' : '120px 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: isMobile ? 32 : 56 }}>
          <Eyebrow style={{ justifyContent: 'center' }}>everything else · 06</Eyebrow>
          <h2 style={{
            fontFamily: fontDisplay,
            fontSize: isMobile ? 36 : 56,
            lineHeight: 1.05,
            letterSpacing: '-0.03em',
            fontWeight: 600,
            margin: '20px auto 0',
            maxWidth: 900,
            paddingBottom: '0.18em',
          }}>
            The bundled details.{' '}
            <span style={{ color: T.textMuted, fontWeight: 400 }}>Things that usually cost extra.</span>
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 1, background: T.border, border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
          {[
            { tag: 'BRANDS', t: 'Multi-brand kits', d: 'Per-product colors, fonts, voice. Run 10 client brands without mixing them up.' },
            { tag: 'LIBRARY', t: 'Cross-product winners', d: '/library shows every gen, every brand. Filter by ★. Build on what works.' },
            { tag: 'MODELS', t: 'Two image models', d: 'nano-banana-2 (fast, default). gpt-image-2 (slower, higher fidelity).' },
            { tag: 'RATIOS', t: 'Every Meta ratio', d: '1:1 / 4:5 / 9:16 in one batch. No Canva detour.' },
            { tag: 'OUTPUT', t: 'PNG / WebP / JPG', d: 'Per ad, per ratio. Ready for Ads Manager.' },
            { tag: 'COPY', t: 'Optional ad copy', d: 'Headlines, primary texts, CTAs following Meta best practices. Opt-in.' },
            { tag: 'INGEST', t: 'Multi-URL onboarding', d: 'Paste several brand or competitor URLs at once. ProdSnap ingests them all.' },
            { tag: 'PHOTOS', t: 'Multi-photo per product', d: 'Front / side / lifestyle / packaging. Pick which one drives each batch.' },
          ].map((f, i) => (
            <div key={i} style={{ background: T.bgElev, padding: 24 }}>
              <MonoLabel color={T.brandSoft}>{f.tag}</MonoLabel>
              <div style={{
                fontFamily: fontDisplay,
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: '-0.02em',
                marginTop: 10,
              }}>{f.t}</div>
              <div style={{ fontFamily: fontBody, fontSize: 13, color: T.textMuted, lineHeight: 1.5, marginTop: 6 }}>{f.d}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================================
// PRICING / TRIAL
// ============================================================

function PricingSection() {
  const plans = [
    {
      tier: 'solo',
      sub: 'one buyer, one or two brands',
      price: 39,
      features: [
        ['Up to 2 brand kits', true],
        ['200 generations / month', true],
        ['All AI image models', true],
        ['All Meta aspect ratios', true],
        ['Swipe file + angle extraction', true],
        ['Voice of customer', true],
        ['Surgical iteration', false],
        ['Cross-product library', false],
        ['Priority support', false],
      ] as Array<[string, boolean]>,
    },
    {
      tier: 'studio',
      sub: 'multi-brand performance creative',
      price: 79,
      popular: true,
      features: [
        ['Up to 8 brand kits', true],
        ['1,000 generations / month', true],
        ['All AI image models', true],
        ['All Meta aspect ratios', true],
        ['Swipe file + angle extraction', true],
        ['Voice of customer', true],
        ['Surgical iteration', true],
        ['Cross-product library', true],
        ['Priority support', false],
      ] as Array<[string, boolean]>,
    },
    {
      tier: 'agency',
      sub: 'agencies running 10+ brands',
      price: 199,
      features: [
        ['Unlimited brand kits', true],
        ['5,000 generations / month', true],
        ['All AI image models', true],
        ['All Meta aspect ratios', true],
        ['Swipe file + angle extraction', true],
        ['Voice of customer', true],
        ['Surgical iteration', true],
        ['Cross-product library', true],
        ['Priority support + onboarding', true],
      ] as Array<[string, boolean]>,
    },
  ]

  const isMobile = useMediaQuery('(max-width: 768px)')
  return (
    <section style={{ background: T.cream, color: T.ink }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: isMobile ? '64px 16px' : '120px 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: isMobile ? 32 : 56 }}>
          <Eyebrow color={T.brand} style={{ justifyContent: 'center' }}>start free · 07</Eyebrow>
          <h2 style={{
            fontFamily: fontDisplay,
            fontSize: isMobile ? 36 : 56,
            lineHeight: 1.05,
            letterSpacing: '-0.03em',
            fontWeight: 600,
            margin: '20px auto 0',
            color: T.ink,
            maxWidth: 900,
            paddingBottom: '0.18em',
          }}>
            Seven days free.{' '}
            <span style={{ color: T.textOnCreamMuted, fontWeight: 400 }}>Then a flat monthly.</span>
          </h2>
          <p style={{ fontFamily: fontBody, fontSize: 17, color: T.textOnCreamMuted, lineHeight: 1.55, margin: '32px auto 0', maxWidth: 700 }}>
            Card on file, full feature set, cancel anytime in 7 days.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: isMobile ? 16 : 20, alignItems: 'stretch', maxWidth: 1100, margin: '0 auto' }}>
          {plans.map((p) => {
            const popular = !!p.popular
            return (
              <div key={p.tier} style={{
                background: popular ? T.bg : '#fff',
                color: popular ? T.text : T.ink,
                borderRadius: 16,
                padding: 28,
                border: popular ? `1px solid ${T.brand}` : `1px solid ${T.borderCream}`,
                position: 'relative',
                overflow: 'hidden',
                boxShadow: popular ? `0 30px 60px -30px ${T.brand}66` : '0 1px 2px rgba(0,0,0,0.03)',
                display: 'flex',
                flexDirection: 'column',
                transform: popular && !isMobile ? 'translateY(-8px)' : 'none',
              }}>
                {popular && (
                  <div style={{ position: 'absolute', top: 0, right: 0, width: 200, height: 200, background: `radial-gradient(circle at top right, ${T.brand}33, transparent 70%)`, pointerEvents: 'none' }} />
                )}
                {popular && (
                  <div style={{
                    position: 'absolute', top: 14, right: 14,
                    fontFamily: fontMono, fontSize: 10,
                    padding: '3px 8px',
                    background: T.brand,
                    color: '#fff',
                    borderRadius: 999,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                  }}>most popular</div>
                )}
                <MonoLabel color={popular ? T.brandSoft : T.brand}>{p.tier}</MonoLabel>
                <div style={{
                  fontFamily: fontBody,
                  fontSize: 13,
                  color: popular ? T.textMuted : T.textOnCreamMuted,
                  marginTop: 6,
                  lineHeight: 1.4,
                }}>{p.sub}</div>
                <div style={{ marginTop: 18, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontFamily: fontDisplay, fontSize: 56, fontWeight: 600, letterSpacing: '-0.04em', lineHeight: 1 }}>${p.price}</span>
                  <span style={{ fontFamily: fontBody, fontSize: 15, color: popular ? T.textMuted : T.textOnCreamMuted }}>/month</span>
                </div>
                <div style={{ fontFamily: fontMono, fontSize: 11, color: popular ? T.textDim : T.textOnCreamMuted, marginTop: 4, opacity: 0.8 }}>billed monthly · annual coming soon</div>

                <div style={{
                  marginTop: 22,
                  paddingTop: 20,
                  borderTop: popular ? `1px solid ${T.border}` : `1px solid ${T.borderCream}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  flex: 1,
                }}>
                  {p.features.map(([label, on], i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span style={{
                        color: on ? T.teal : (popular ? T.textDim : '#B8BCC4'),
                        marginTop: 2,
                        fontSize: 13,
                        fontWeight: 600,
                      }}>{on ? '✓' : '—'}</span>
                      <span style={{
                        fontFamily: fontBody,
                        fontSize: 14,
                        color: on
                          ? (popular ? T.text : T.ink)
                          : (popular ? T.textDim : '#B8BCC4'),
                      }}>{label}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 24 }}>
                  <Link to="/home" style={{ textDecoration: 'none', display: 'block' }}>
                    <Btn
                      kind={popular ? 'primary' : 'secondaryCream'}
                      size="lg"
                      style={{ width: '100%', justifyContent: 'center' }}
                    >
                      {popular ? 'Start 7-day free trial →' : 'Start free trial'}
                    </Btn>
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <MonoLabel>card required · cancel before day 7, no charge · upgrade or downgrade anytime</MonoLabel>
        </div>
      </div>
    </section>
  )
}

// ============================================================
// FAQ
// ============================================================

function FAQSection() {
  const [open, setOpen] = useState(0)
  const isMobile = useMediaQuery('(max-width: 768px)')
  const items: Array<[string, string]> = [
    ['Why card-required for the trial?', "Anti-abuse, not a trick. ProdSnap generates with paid AI models — without a card, the trial gets farmed in 24 hours and the price has to go up for everyone. Cancel anytime in the 7 days, you won't be charged."],
    ['Is this the same as AdCreative or Glorify?', "Different audience, different shape. AdCreative and Glorify are mass-market generators built for ecom owners who want quick output. ProdSnap is built for media buyers running performance creative across multiple brands — angle testing, swipe files, voice of customer, winners loops. If you don't know what those words mean, ProdSnap is overpowered for you."],
    ['How is this different from Foreplay?', "Foreplay is a swipe file. ProdSnap is a swipe file that feeds a generator. The references you save in ProdSnap actually shape the ads we generate — that loop doesn't exist anywhere else."],
    ['What about my brand consistency?', "Each brand keeps its own kit — colors, fonts, voice notes. Tag a product with the brand it belongs to, and the generator references that kit on every gen. Studio fits 8 brand kits, Agency is unlimited. Kits don't bleed into each other across products."],
    ['Will the output actually run on Meta?', "Yes — every output is in 1:1, 4:5, or 9:16 (you pick), exported as PNG / WebP / JPG, and meets Meta's Ads Manager spec. Optional ad copy generation follows Meta best practices for headlines, primary texts, and CTAs."],
    ['Can I bring competitor ads as references?', "Yes. Paste URLs from Meta Ad Library, drag images in, or bookmark templates from our curated library. Per-product. They feed the generator on every batch for that product."],
  ]

  return (
    <section style={{ background: T.bg, color: T.text }}>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: isMobile ? '64px 16px' : '120px 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: isMobile ? 32 : 56 }}>
          <Eyebrow style={{ justifyContent: 'center' }}>faq · 08</Eyebrow>
          <h2 style={{
            fontFamily: fontDisplay,
            fontSize: isMobile ? 36 : 56,
            lineHeight: 1.05,
            letterSpacing: '-0.03em',
            fontWeight: 600,
            margin: '20px auto 0',
            paddingBottom: '0.18em',
          }}>
            Things media buyers ask first.
          </h2>
        </div>
        <div style={{ borderTop: `1px solid ${T.border}` }}>
          {items.map(([q, a], i) => (
            <div key={i} style={{ borderBottom: `1px solid ${T.border}` }}>
              <button
                onClick={() => setOpen(open === i ? -1 : i)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  padding: '24px 0',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 24,
                  color: T.text,
                }}
              >
                <span style={{
                  fontFamily: fontDisplay,
                  fontSize: isMobile ? 17 : 22,
                  fontWeight: 500,
                  letterSpacing: '-0.02em',
                }}>{q}</span>
                <span style={{
                  fontFamily: fontMono,
                  fontSize: 18,
                  color: T.textMuted,
                  transform: open === i ? 'rotate(45deg)' : 'rotate(0)',
                  transition: 'transform .2s ease',
                  flexShrink: 0,
                }}>+</span>
              </button>
              {open === i && (
                <div style={{
                  fontFamily: fontBody,
                  fontSize: 16,
                  color: T.textMuted,
                  lineHeight: 1.6,
                  paddingBottom: 24,
                  maxWidth: 720,
                }}>{a}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ============================================================
// FINAL CTA
// ============================================================

function FinalCTA() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  return (
    <section style={{
      background: `linear-gradient(135deg, ${T.bg} 0%, #161B26 100%)`,
      color: T.text,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(800px 400px at 50% 100%, ${T.brand}33, transparent 60%)`,
        pointerEvents: 'none',
      }}/>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: isMobile ? '64px 16px' : '140px 32px', textAlign: 'center', position: 'relative' }}>
        <Eyebrow style={{ justifyContent: 'center' }}>↻ close the loop</Eyebrow>
        <h2 style={{
          fontFamily: fontDisplay,
          fontSize: isMobile ? 48 : 88,
          lineHeight: 1.02,
          letterSpacing: '-0.04em',
          fontWeight: 600,
          margin: '24px auto 36px',
          maxWidth: 1100,
          paddingBottom: '0.12em',
        }}>
          Stop briefing designers <br/>
          <span style={{ color: T.textMuted, fontWeight: 400 }}>for every angle test.</span>
        </h2>
        <p style={{ fontFamily: fontBody, fontSize: isMobile ? 16 : 19, color: T.textMuted, maxWidth: 600, margin: '0 auto 36px', lineHeight: 1.5 }}>
          Three paths. Twelve variants per batch. One loop that learns from what wins.
        </p>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 12, justifyContent: 'center', alignItems: 'center' }}>
          <Link to="/home" style={{ textDecoration: 'none' }}>
            <Btn kind="primary" size="lg">Start 7-day free trial →</Btn>
          </Link>
          <Link to="/templates" style={{ textDecoration: 'none' }}>
            <Btn kind="secondary" size="lg">Browse templates</Btn>
          </Link>
        </div>
        <div style={{ marginTop: 18 }}>
          <MonoLabel>card required · cancel before day 7, no charge</MonoLabel>
        </div>
      </div>
    </section>
  )
}

// ============================================================
// FOOTER
// ============================================================

function LandingFooter() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  return (
    <footer style={{ background: T.bg, color: T.textMuted, borderTop: `1px solid ${T.border}` }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: isMobile ? '32px 16px 24px' : '48px 32px 32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr 1fr 1fr 1fr', gap: isMobile ? 24 : 32, marginBottom: 40 }}>
          <div>
            <span style={{ display: 'inline-block' }}>
              <LogoMark size="sm" />
            </span>
            <div style={{ fontFamily: fontBody, fontSize: 14, color: T.textDim, marginTop: 16, maxWidth: 280, lineHeight: 1.5 }}>
              Performance creative co-pilot for media buyers and small agencies running multiple brands.
            </div>
          </div>
          {([
            ['Product', ['Templates', 'Workflow', 'Pricing', 'Changelog']],
            ['Resources', ['Docs', 'Swipe library', 'Angle guide', 'Meta specs']],
            ['Company', ['About', 'Customers', 'Contact', 'Press kit']],
            ['Legal', ['Privacy', 'Terms', 'Security', 'DPA']],
          ] as Array<[string, string[]]>).map(([title, links]) => (
            <div key={title}>
              <MonoLabel style={{ display: 'block', marginBottom: 14 }}>{title}</MonoLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {links.map(l => (
                  <span key={l} style={{ fontFamily: fontBody, fontSize: 14, color: T.textMuted }}>{l}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ paddingTop: 24, borderTop: `1px solid ${T.border}` }}>
          <MonoLabel>© 2026 ProdSnap · made for buyers, by buyers</MonoLabel>
        </div>
      </div>
    </footer>
  )
}

// ============================================================
// PAGE (route component)
// ============================================================

function Home() {
  return (
    <div style={{ background: T.bg, minHeight: '100vh' }}>
      <Hero />
      <LoopSection />
      <SplitSection />
      <OnrampsSection />
      <VOCSection />
      <SurgicalSection />
      <FeatureGrid />
      <PricingSection />
      <FAQSection />
      <FinalCTA />
      <LandingFooter />
    </div>
  )
}
