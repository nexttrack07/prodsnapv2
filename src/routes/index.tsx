import { createContext, useContext, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useAuth } from '@clerk/react'
import { useMediaQuery } from '@mantine/hooks'
import { LogoMark } from '~/components/Logo'
import { seo } from '~/utils/seo'
import * as Sentry from '@sentry/react'
import { PLAN_CONFIG } from '../../convex/lib/billing/planConfig'
import { PENDING_PRODUCT_URL_KEY } from './onboarding'

// Single layout context — replaces 12 per-section useMediaQuery listeners.
// `getInitialValueInEffect: false` makes Mantine read matchMedia synchronously
// on first client render, so phones don't flash desktop layout before hydration.
const LandingLayoutContext = createContext<boolean>(false)
function useIsMobile() {
  return useContext(LandingLayoutContext)
}

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      ...seo({
        title: 'ProdSnap — performance creative co-pilot for media buyers',
        description:
          'Save winning ads to a swipe file. Generate 12 Meta-ready variants per batch — using those exact references.',
        image: '/og-prodsnap.png',
      }),
    ],
  }),
  component: Home,
})

// ============================================================
// Tokens (design-matched, with brand color substitution)
// ============================================================
const T = {
  // Light theme: the former "dark page" surfaces now map to the light
  // canvas/surface tokens. `cream*` (already light) stay as the alt sections.
  // Two-tone bands so sections read as distinct: white sections alternate with
  // light-gray (`cream`) bands, and cards take the opposite tone + a hairline
  // border so they pop on either background.
  bg: '#FFFFFF',
  bgElev: '#F4F6F8',
  bgElev2: '#EAEDF1',
  cream: '#F4F6F8',
  creamElev: '#FFFFFF',
  ink: '#16191D',
  text: '#16191D',
  textMuted: '#475467',
  textDim: '#667085',
  textOnCream: '#16191D',
  textOnCreamMuted: '#5A6068',
  border: '#E6E8EB',
  borderCream: '#E6E8EB',
  // Brand substitutions: #16191d → brand-6 (#16191d), #475467 → brand-5 (#344054)
  brand: '#16191d',
  brandSoft: '#344054',
  brandTint: 'rgba(16, 24, 40, 0.10)',
  teal: '#5FB8A6',
  tealTint: 'rgba(95, 184, 166, 0.14)',
  neutral: '#94A3B8',
}

// Shared section padding — duplicated 8 places before consolidation.
const SECTION_PADDING = (m: boolean) => m ? '64px 16px' : '120px 32px'

type ComparisonRow = { label: string; status: boolean | 'limited' }
type Toggle = { label: string; on: boolean }
type AngleEntry = { title: string; hook: string; selected: boolean }
type FAQItem = { q: string; a: string }
type PricingFeature = { label: string; on: boolean }

const fontDisplay = '"Space Grotesk", "Inter Tight", -apple-system, sans-serif'
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
      borderRadius: 4,
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


type BtnKind = 'primary' | 'secondary' | 'secondaryCream' | 'ghost' | 'light'
type BtnSize = 'sm' | 'md' | 'lg'
function Btn({ children, kind = 'primary', size = 'md', style, icon, as = 'button' }: {
  children: React.ReactNode; kind?: BtnKind; size?: BtnSize; style?: React.CSSProperties; icon?: React.ReactNode; as?: 'button' | 'span'
}) {
  const sizes: Record<BtnSize, React.CSSProperties> = {
    sm: { padding: '8px 14px', fontSize: 13, gap: 6 },
    md: { padding: '12px 20px', fontSize: 14, gap: 8 },
    lg: { padding: '14px 24px', fontSize: 15, gap: 10 },
  }
  const kinds: Record<BtnKind, React.CSSProperties> = {
    primary: { background: T.brand, color: '#fff', border: `1px solid ${T.brand}` },
    secondary: { background: 'transparent', color: T.text, border: `1px solid ${T.border}` },
    secondaryCream: { background: 'transparent', color: T.ink, border: `1px solid ${T.borderCream}` },
    ghost: { background: 'transparent', color: T.text, border: '1px solid transparent' },
    light: { background: T.cream, color: T.ink, border: `1px solid ${T.cream}` },
  }
  const sharedStyle: React.CSSProperties = {
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
  }
  // When wrapped in a <Link>, render as <span> so the parent <a> owns
  // the keyboard focus and we don't ship <button> inside <a> (invalid HTML).
  if (as === 'span') {
    return (
      <span role="button" tabIndex={-1} style={sharedStyle}>
        {children}
        {icon}
      </span>
    )
  }
  return (
    <button style={sharedStyle}>
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
  const isMobile = useIsMobile()
  const { isSignedIn } = useAuth()
  const [productUrl, setProductUrl] = useState('')

  // Stash the pasted product URL, then hand off to the no-card starter flow
  // which imports THIS product so the user can pick photos + generate. Already
  // signed in → go straight there; otherwise sign up first, then resume.
  const handleStart = () => {
    const trimmed = productUrl.trim()
    if (trimmed) {
      try {
        sessionStorage.setItem(PENDING_PRODUCT_URL_KEY, trimmed)
      } catch {
        /* ignore */
      }
    }
    window.location.href = isSignedIn
      ? '/onboarding?starter=1'
      : '/sign-up?redirect_url=' + encodeURIComponent('/onboarding?starter=1')
  }

  return (
    <section aria-labelledby="hero-title" style={{ position: 'relative', overflow: 'hidden' }}>
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
        }} id="hero-title">
          From product page<br />
          <span style={{ color: T.textMuted, fontWeight: 400 }}>to a</span>{' '}
          <span style={{
            background: `linear-gradient(180deg, ${T.brandSoft}, ${T.brand})`,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}>tested ad.</span>
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
          Angles, creative, and copy — generated. Paste your product URL and ProdSnap turns it into Meta-ready ads.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', marginTop: 24 }}>
          <form
            onSubmit={(e) => { e.preventDefault(); handleStart() }}
            style={{
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              gap: 8,
              width: '100%',
              maxWidth: 540,
              margin: '0 auto',
            }}
          >
            <input
              type="url"
              inputMode="url"
              value={productUrl}
              onChange={(e) => setProductUrl(e.target.value)}
              placeholder="Paste your product page URL"
              aria-label="Product page URL"
              style={{
                flex: 1,
                height: 52,
                padding: '0 16px',
                fontFamily: fontBody,
                fontSize: 15,
                color: T.text,
                background: T.bgElev,
                border: `1px solid ${T.border}`,
                borderRadius: 10,
                outline: 'none',
              }}
            />
            <button
              type="submit"
              style={{
                height: 52,
                padding: '0 22px',
                fontFamily: fontDisplay,
                fontSize: 16,
                fontWeight: 600,
                color: '#fff',
                background: `linear-gradient(180deg, ${T.brandSoft}, ${T.brand})`,
                border: 'none',
                borderRadius: 10,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Create my free ads →
            </button>
          </form>
          <MonoLabel>100 free credits to start · ~10 ads · no card</MonoLabel>
          <Link
            to="/pricing"
            style={{
              fontFamily: fontBody,
              fontSize: 13,
              color: T.textMuted,
              textDecoration: 'none',
              borderBottom: `1px solid ${T.border}`,
              paddingBottom: 1,
            }}
          >
            See plans &amp; pricing
          </Link>
          <a
            href="#workflow-title"
            style={{
              fontFamily: fontBody,
              fontSize: 13,
              color: T.textMuted,
              textDecoration: 'none',
              marginTop: 4,
              cursor: 'pointer',
            }}
          >
            see how it works ↓
          </a>
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
              <div style={{ position: 'absolute', bottom: 14, left: 14, right: 14, padding: '8px 10px', background: 'rgba(255,255,255,0.92)', borderRadius: 6, border: `1px solid ${T.border}`, fontFamily: fontMono, fontSize: 10, color: T.textMuted, backdropFilter: 'blur(4px)' }}>
                <div style={{ color: T.teal }}>✓ background removed</div>
                <div>✓ analyzed · "Harry's hydrating night lotion"</div>
                <div>✓ description generated</div>
              </div>
            </div>
          </div>
          {/* Arrow + batch */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <MonoLabel>02 · one batch · 6 of 12 variants · 1:1 / 4:5 / 9:16</MonoLabel>
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

function WorkflowSection() {
  const isMobile = useIsMobile()
  return (
    <section aria-labelledby="workflow-title" style={{ background: T.cream, color: T.ink, position: 'relative' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: SECTION_PADDING(isMobile) }}>
        <div style={{ textAlign: 'center', marginBottom: isMobile ? 32 : 56 }}>
          <Eyebrow color={T.brand} style={{ justifyContent: 'center' }}>the workflow · 01</Eyebrow>
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
          }} id="workflow-title">
            It works the way a media buyer does.{' '}
            <span style={{ color: T.textOnCreamMuted, fontWeight: 400 }}>Angle first. Then the creative.</span>
          </h2>
          <p style={{ fontFamily: fontBody, fontSize: 18, lineHeight: 1.55, color: T.textOnCreamMuted, margin: '24px auto 0', maxWidth: 720 }}>
            Paste a product URL. ProdSnap reverse-engineers the strategy — the angles worth testing, the concepts for each, and the templates that fit — then generates the creatives.
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

            {/* STEP 01 — ANGLES */}
            <LoopCard
              tag="step 01 · angles"
              title="Angles worth testing"
              sub="Auto-extracted from your product page and reviews."
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Selected angle */}
                <div style={{
                  padding: '10px 12px',
                  background: T.brand,
                  border: `1px solid ${T.brand}`,
                  borderRadius: 6,
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                }}>
                  <div style={{
                    width: 14, height: 14, marginTop: 2,
                    borderRadius: 7,
                    border: '1.5px solid #fff',
                    background: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <div style={{ width: 6, height: 6, borderRadius: 3, background: T.brand }} />
                  </div>
                  <div>
                    <div style={{ fontFamily: fontBody, fontSize: 13, fontWeight: 600, color: '#fff' }}>Stop waking up to tight skin</div>
                    <div style={{ fontFamily: fontBody, fontSize: 12, fontStyle: 'italic', color: '#ffffffcc', marginTop: 2 }}>Buyers blame morning skin on bad sleep — not their night routine.</div>
                  </div>
                </div>
                {/* Unselected angle */}
                <div style={{
                  padding: '10px 12px',
                  background: '#fff',
                  border: `1px solid ${T.borderCream}`,
                  borderRadius: 6,
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                }}>
                  <div style={{
                    width: 14, height: 14, marginTop: 2,
                    borderRadius: 7,
                    border: `1.5px solid ${T.borderCream}`,
                    background: 'transparent',
                    flexShrink: 0,
                  }} />
                  <div>
                    <div style={{ fontFamily: fontBody, fontSize: 13, fontWeight: 600, color: T.ink }}>The lotion you settled for</div>
                    <div style={{ fontFamily: fontBody, fontSize: 12, fontStyle: 'italic', color: T.textOnCreamMuted, marginTop: 2 }}>Most switched from a drugstore tub that never absorbed.</div>
                  </div>
                </div>
              </div>
            </LoopCard>

            {!isMobile && <LoopArrow />}

            {/* STEP 02 — CONCEPTS (highlighted) */}
            <LoopCard
              tag="step 02 · concepts"
              title="3 concepts per angle"
              sub="How the angle should actually look as an ad."
              highlighted
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { format: 'UGC testimonial', look: 'Bathroom-shelf selfie, morning light', frame: '"I thought I just slept badly."' },
                  { format: 'Before / after', look: 'Tight, flaky skin → calm, hydrated', frame: 'Day 1 vs Day 14' },
                  { format: 'Comparison', look: 'Your lotion vs the drugstore tub', frame: 'Why one actually absorbs' },
                ].map(({ format, look, frame }, i) => (
                  <div key={i} style={{
                    background: T.bgElev,
                    border: `1px solid ${T.border}`,
                    borderRadius: 6,
                    padding: '10px 12px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontFamily: fontMono, fontSize: 10, color: T.brandSoft, fontWeight: 600 }}>{format}</span>
                    </div>
                    <div style={{ fontFamily: fontBody, fontSize: 12, color: T.textMuted, lineHeight: 1.4 }}>{look}</div>
                    <div style={{ fontFamily: fontBody, fontSize: 12, fontStyle: 'italic', color: T.textDim, marginTop: 3 }}>{frame}</div>
                  </div>
                ))}
              </div>
            </LoopCard>

            {!isMobile && <LoopArrow />}

            {/* STEP 03 — TEMPLATES → CREATIVES */}
            <LoopCard
              tag="step 03 · templates → creatives"
              title="Pick templates, get creatives"
              sub="Choose references you like; we generate the ads."
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                {[1, 2, 3, 4].map((i) => (
                  <img
                    key={i}
                    src={`/landing/shots/template-${i}.jpg`}
                    alt=""
                    role="presentation"
                    loading="lazy"
                    decoding="async"
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
              <div style={{ marginTop: 12 }}>
                <Pill color={T.teal} bg={T.tealTint} style={{ borderColor: T.teal + '55' }}>✓ ads created</Pill>
              </div>
            </LoopCard>
          </div>

          {/* Footer note */}
          <div style={{ marginTop: 32, textAlign: 'center' }}>
            <MonoLabel color={T.brand}>→ then iterate on the winners</MonoLabel>
          </div>
        </div>
      </div>
    </section>
  )
}

// ============================================================
// SPLIT-TOOL COMPARISON
// ============================================================

function CompareCard({ tier, title, desc, rows, primary }: {
  tier: string; title: string; desc: string; rows: ComparisonRow[]; primary?: boolean
}) {
  const isMobile = useIsMobile()
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
            borderRadius: 4,
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
        {rows.map(({ label, status }, i) => (
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
              {status === true && <span style={{ color: primary ? '#fff' : T.teal, fontWeight: primary ? 600 : 400 }}>● yes</span>}
              {status === false && <span style={{ color: primary ? '#ffffff66' : T.textDim }}>○ no</span>}
              {status === 'limited' && <span style={{ color: primary ? '#ffffffaa' : T.neutral }}>◐ limited</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SplitSection() {
  const isMobile = useIsMobile()
  return (
    <section aria-labelledby="split-title" style={{ background: T.bg, color: T.text }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: SECTION_PADDING(isMobile) }}>
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
          }} id="split-title">
            Strategy and generation belong in the same tool.
          </h2>
          <p style={{ fontFamily: fontBody, fontSize: 17, color: T.textMuted, maxWidth: 'none', margin: '0 auto', lineHeight: 1.55 }}>
            Generic AI tools make a picture from a prompt. Swipe tools just store screenshots. Neither tells you what to test.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1.15fr', gap: isMobile ? 16 : 20, alignItems: 'start', paddingTop: 16, paddingBottom: 32 }}>
          <CompareCard
            tier="option a"
            title="Generic AI ad gen"
            desc="Type a prompt, get an image. No angle, no strategy, no idea what to test next."
            rows={[
              { label: 'Marketing angles', status: false },
              { label: 'Creative concepts', status: false },
              { label: 'Batched ad creatives', status: false },
              { label: 'Brand-aware copy', status: 'limited' },
              { label: 'Multi-brand', status: false },
              { label: 'Iterate on winners', status: false },
            ]}
          />
          <CompareCard
            tier="option b"
            title="Swipe-file tools"
            desc="Browse and save winning ads. Useful research — but it can't generate anything."
            rows={[
              { label: 'Marketing angles', status: 'limited' },
              { label: 'Creative concepts', status: false },
              { label: 'Batched ad creatives', status: false },
              { label: 'Brand-aware copy', status: false },
              { label: 'Multi-brand', status: 'limited' },
              { label: 'Iterate on winners', status: false },
            ]}
          />
          <CompareCard
            tier="option c · prodsnap"
            title="The whole workflow"
            desc="Angles → concepts → templates → creatives → copy. Per product, per brand."
            rows={[
              { label: 'Marketing angles', status: true },
              { label: 'Creative concepts', status: true },
              { label: 'Batched ad creatives', status: true },
              { label: 'Brand-aware copy', status: true },
              { label: 'Multi-brand', status: true },
              { label: 'Iterate on winners', status: true },
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
  const isMobile = useIsMobile()
  return (
    <section aria-labelledby="onramps-title" style={{ background: T.cream, color: T.ink }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: SECTION_PADDING(isMobile) }}>
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
          }} id="onramps-title">
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
                  alt=""
                  role="presentation"
                  loading="lazy"
                  decoding="async"
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
              {([{ label: 'Free text', on: true }, { label: 'Chip builder', on: false }, { label: 'From template', on: false }] as Toggle[]).map(({ label, on }, i) => (
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
                }}>{label}</span>
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
                  { label: 'setting', on: false },
                  { label: 'lighting', on: true },
                  { label: 'mood', on: false },
                  { label: 'camera', on: false },
                  { label: 'style', on: false },
                  { label: 'voc', on: false },
                ] as Toggle[]).map(({ label, on }, i) => (
                  <span key={i} style={{
                    padding: '5px 10px',
                    fontFamily: fontMono,
                    fontSize: 11,
                    border: `1px solid ${on ? T.brand : T.borderCream}`,
                    background: on ? T.brand : '#fff',
                    color: on ? '#fff' : T.textOnCreamMuted,
                    borderRadius: 4,
                    fontWeight: on ? 500 : 400,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}>
                    {on ? '✓' : '+'} {label}
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
                { title: 'Comparison', hook: 'vs. the drugstore lotion you settled for', selected: true },
                { title: 'Curiosity', hook: 'why your night cream stops working at 3am', selected: false },
                { title: 'Social proof', hook: '"finally a lotion my partner steals"', selected: false },
                { title: 'Problem callout', hook: "morning skin shouldn't feel like sandpaper", selected: false },
              ] as AngleEntry[]).map(({ title, hook, selected }) => (
                <div key={title} style={{
                  padding: '10px 12px',
                  background: selected ? T.brand : '#fff',
                  border: `1px solid ${selected ? T.brand : T.borderCream}`,
                  borderRadius: 6,
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                }}>
                  <div style={{
                    width: 14, height: 14, marginTop: 2,
                    borderRadius: 7,
                    border: `1.5px solid ${selected ? '#fff' : T.borderCream}`,
                    background: selected ? '#fff' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {selected && <div style={{ width: 6, height: 6, borderRadius: 3, background: T.brand }}/>}
                  </div>
                  <div>
                    <div style={{ fontFamily: fontBody, fontSize: 13, fontWeight: 600, color: selected ? '#fff' : T.ink }}>{title}</div>
                    <div style={{ fontFamily: fontBody, fontSize: 12, fontStyle: 'italic', color: selected ? '#ffffffcc' : T.textOnCreamMuted, marginTop: 2 }}>"{hook}"</div>
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
  const isMobile = useIsMobile()
  return (
    <section aria-labelledby="voc-title" style={{ background: T.bg, color: T.text }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: SECTION_PADDING(isMobile) }}>
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
          }} id="voc-title">
            Headlines that sound like real customers, not AI.
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
                borderRadius: 4,
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
                  boxShadow: '0 1px 0 rgba(16,24,40,0.04)',
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
  const isMobile = useIsMobile()
  return (
    <section aria-labelledby="surgical-title" style={{ background: T.cream, color: T.ink }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: SECTION_PADDING(isMobile) }}>
        <div style={{ textAlign: 'center', marginBottom: isMobile ? 32 : 56 }}>
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
          }} id="surgical-title">
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
            isMobile={isMobile}
            label="vary: colors"
            sub="same composition · same copy"
            activeChip="Colors"
            sources={[
              '/landing/shots/cole-haan-color-1.png',
              '/landing/shots/cole-haan-color-2.png',
            ]}
          />
          <SurgicalExample
            isMobile={isMobile}
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
  label, sub, activeChip, sources, isMobile = false,
}: {
  label: string
  sub: string
  activeChip: 'Colors' | 'Text'
  sources: string[]
  isMobile?: boolean
}) {
  const chips: Toggle[] = [
    { label: 'Text', on: activeChip === 'Text' },
    { label: 'Icons', on: false },
    { label: 'Colors', on: activeChip === 'Colors' },
    { label: 'Composition', on: false },
    { label: 'Aspect ratio', on: false },
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
        {chips.map(({ label, on }) => (
          <div key={label} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 10px',
            borderRadius: 4,
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
            }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Variants — auto-fit row at 9:16 aspect ratio. Both example cards
          render an equal number of thumbs, so heights match. */}
      <div style={{
        padding: isMobile ? 12 : 16,
        flex: 1,
        display: 'grid',
        gridTemplateColumns: `repeat(${sources.length}, 1fr)`,
        gap: isMobile ? 6 : 8,
        alignItems: 'start',
      }}>
        {sources.map((src, i) => (
          <img
            key={i}
            src={src}
            alt={`${activeChip} variant ${i + 1}`}
            loading="lazy"
            decoding="async"
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
// AD TEST SECTION
// ============================================================

function AdTestSection() {
  const isMobile = useIsMobile()
  return (
    <section aria-labelledby="adtest-title" style={{ background: T.bg, color: T.text }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: SECTION_PADDING(isMobile) }}>
        <div style={{ textAlign: 'center', marginBottom: isMobile ? 32 : 56 }}>
          <Eyebrow style={{ justifyContent: 'center' }}>the ad batch · 06</Eyebrow>
          <h2 style={{
            fontFamily: fontDisplay,
            fontSize: isMobile ? 36 : 56,
            lineHeight: 1.05,
            letterSpacing: '-0.03em',
            fontWeight: 600,
            margin: '20px auto 0',
            maxWidth: 900,
            paddingBottom: '0.18em',
          }} id="adtest-title">
            Every batch is ready to ship.
          </h2>
          <p style={{ fontFamily: fontBody, fontSize: 17, color: T.textMuted, lineHeight: 1.55, margin: '24px auto 0', maxWidth: 700 }}>
            Not loose images — a Facebook-style preview, every variant in one place, and copy written for the angle.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 24 : 32, alignItems: 'start' }}>

          {/* LEFT — Facebook-style ad preview */}
          <div style={{
            background: T.bgElev,
            border: `1px solid ${T.border}`,
            borderRadius: 14,
            overflow: 'hidden',
          }}>
            {/* FB header */}
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 18,
                background: `linear-gradient(135deg, ${T.brand}, ${T.teal})`,
                flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: fontDisplay, fontSize: 14, fontWeight: 700, color: '#fff',
              }}>H</div>
              <div>
                <div style={{ fontFamily: fontBody, fontSize: 14, fontWeight: 700, color: T.text }}>Harry's</div>
                <div style={{ fontFamily: fontMono, fontSize: 10, color: T.textDim, marginTop: 1 }}>Sponsored · <span style={{ color: T.textDim }}>🌐</span></div>
              </div>
            </div>

            {/* Primary text */}
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}` }}>
              <div style={{ fontFamily: fontBody, fontSize: 14, color: T.text, lineHeight: 1.5 }}>
                Stop blaming your sleep. It's your night routine.
              </div>
            </div>

            {/* Ad image */}
            <div>
              <img
                src="/landing/shots/harrys-1-exact.png"
                alt="Ad preview"
                loading="lazy"
                decoding="async"
                style={{ width: '100%', display: 'block' }}
              />
            </div>

            {/* Link card footer */}
            <div style={{
              padding: '12px 16px',
              background: T.bgElev2,
              borderTop: `1px solid ${T.border}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
            }}>
              <div>
                <div style={{ fontFamily: fontMono, fontSize: 10, color: T.textDim, marginBottom: 3 }}>harrys.com</div>
                <div style={{ fontFamily: fontDisplay, fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: '-0.01em' }}>Wake up to calmer skin</div>
              </div>
              <div style={{
                padding: '8px 16px',
                background: T.bgElev,
                border: `1px solid ${T.border}`,
                borderRadius: 6,
                fontFamily: fontBody,
                fontSize: 13,
                fontWeight: 600,
                color: T.text,
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}>Shop Now</div>
            </div>

            {/* Like / comment / share */}
            <div style={{ padding: '10px 16px', borderTop: `1px solid ${T.border}`, display: 'flex', gap: 20 }}>
              {['Like', 'Comment', 'Share'].map(a => (
                <span key={a} style={{ fontFamily: fontBody, fontSize: 13, color: T.textDim }}>{a}</span>
              ))}
            </div>
          </div>

          {/* RIGHT — inside the batch */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Variant grid */}
            <div style={{
              background: T.bgElev,
              border: `1px solid ${T.border}`,
              borderRadius: 14,
              overflow: 'hidden',
            }}>
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <MonoLabel color={T.text}>generated</MonoLabel>
                <MonoLabel color={T.textDim}>6 variants</MonoLabel>
              </div>
              <div style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                {[
                  '/landing/shots/harrys-2-exact.png',
                  '/landing/shots/harrys-3-exact.png',
                  '/landing/shots/harrys-4-exact.png',
                  '/landing/shots/harrys-5-exact.png',
                  '/landing/shots/harrys-6-exact.png',
                  '/landing/shots/toiletry-1.png',
                ].map((src, i) => (
                  <img
                    key={i}
                    src={src}
                    alt={`Variant ${i + 2}`}
                    loading="lazy"
                    decoding="async"
                    style={{
                      width: '100%',
                      aspectRatio: '1',
                      objectFit: 'cover',
                      borderRadius: 6,
                      border: `1px solid ${T.border}`,
                      display: 'block',
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Copy bank */}
            <div style={{
              background: T.bgElev,
              border: `1px solid ${T.border}`,
              borderRadius: 14,
              overflow: 'hidden',
            }}>
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: fontDisplay, fontSize: 16, fontWeight: 600, color: T.text }}>Copy Bank</span>
                <Pill color={T.teal} bg={T.tealTint} style={{ borderColor: T.teal + '55' }}>from angle: stop waking up to tight skin</Pill>
              </div>
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { hl: 'Wake up to calmer skin', body: 'The dry-morning spiral, broken overnight.' },
                  { hl: 'Your lotion should absorb', body: 'Not sit on top like the drugstore tub did.' },
                ].map(({ hl, body }, i) => (
                  <div key={i} style={{
                    background: T.bg,
                    border: `1px solid ${T.border}`,
                    borderRadius: 8,
                    padding: '12px 14px',
                  }}>
                    <div style={{ fontFamily: fontDisplay, fontSize: 16, fontWeight: 600, color: T.text, letterSpacing: '-0.01em' }}>{hl}</div>
                    <div style={{ fontFamily: fontBody, fontSize: 13, color: T.textMuted, marginTop: 4, lineHeight: 1.45 }}>{body}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ============================================================
// FEATURE GRID
// ============================================================

function FeatureGrid() {
  const isMobile = useIsMobile()
  return (
    <section aria-labelledby="features-title" style={{ background: T.bg, color: T.text }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: SECTION_PADDING(isMobile) }}>
        <div style={{ textAlign: 'center', marginBottom: isMobile ? 32 : 56 }}>
          <Eyebrow style={{ justifyContent: 'center' }}>everything else · 07</Eyebrow>
          <h2 style={{
            fontFamily: fontDisplay,
            fontSize: isMobile ? 36 : 56,
            lineHeight: 1.05,
            letterSpacing: '-0.03em',
            fontWeight: 600,
            margin: '20px auto 0',
            maxWidth: 900,
            paddingBottom: '0.18em',
          }} id="features-title">
            The bundled details.{' '}
            <span style={{ color: T.textMuted, fontWeight: 400 }}>Things that usually cost extra.</span>
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 1, background: T.border, border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
          {[
            { tag: 'BRANDS', t: 'Multi-brand kits', d: 'Per-product colors, fonts, voice. Run 10 client brands without mixing them up.' },
            { tag: 'LIBRARY', t: 'Cross-product winners', d: '/library shows every gen, every brand. Filter by ★. Build on what works.' },
            { tag: 'MODELS', t: 'Premium image generation', d: 'A state-of-the-art AI image model tuned for product ads.' },
            { tag: 'RATIOS', t: 'Every Meta ratio', d: '1:1 / 4:5 / 9:16 in one batch. No Canva detour.' },
            { tag: 'OUTPUT', t: 'Meta-ready PNG', d: 'High-res PNG per ad, per ratio. Drops straight into Ads Manager.' },
            { tag: 'BATCHES', t: 'Batches, not one-offs', d: 'Every batch lands in a Facebook-style preview with variants and angle-grounded copy.' },
            { tag: 'INGEST', t: 'URL onboarding', d: 'Paste a product or competitor URL — ProdSnap scrapes the images, copy, and details.' },
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
  /**
   * Numeric values (price, allowances) MUST come from PLAN_CONFIG so the
   * landing and code never drift again. Marketing copy + feature checkmarks
   * stay local because they're sales-y, not contractual.
   */
  const plans = [
    {
      tier: 'lite',
      sub: 'one buyer, getting started',
      price: PLAN_CONFIG.lite.monthlyPriceCents / 100,
      features: [
        { label: `${PLAN_CONFIG.lite.brandKitLimit} brand kits`, on: true },
        { label: `${PLAN_CONFIG.lite.imageCredits / 10} image generations / month`, on: true },
        { label: 'Premium AI image model', on: true },
        { label: 'All Meta aspect ratios', on: true },
        { label: 'Swipe file + angle extraction', on: true },
        { label: 'Voice of customer', on: true },
        { label: 'Surgical iteration', on: true },
        { label: 'Cross-product library', on: true },
        { label: 'Priority support', on: false },
      ] as PricingFeature[],
    },
    {
      tier: 'pro',
      sub: 'multi-brand performance creative',
      price: PLAN_CONFIG.pro.monthlyPriceCents / 100,
      popular: true,
      features: [
        { label: `${PLAN_CONFIG.pro.brandKitLimit} brand kits`, on: true },
        { label: `${PLAN_CONFIG.pro.imageCredits / 10} image generations / month`, on: true },
        { label: 'Premium AI image model', on: true },
        { label: 'All Meta aspect ratios', on: true },
        { label: 'Swipe file + angle extraction', on: true },
        { label: 'Voice of customer', on: true },
        { label: 'Surgical iteration', on: true },
        { label: 'Cross-product library', on: true },
        { label: 'Priority support', on: false },
      ] as PricingFeature[],
    },
    {
      tier: 'max',
      sub: 'agencies and power users',
      price: PLAN_CONFIG.max.monthlyPriceCents / 100,
      features: [
        { label: 'Unlimited brand kits', on: true },
        { label: `${PLAN_CONFIG.max.imageCredits / 10} image generations / month`, on: true },
        { label: 'Premium AI image model', on: true },
        { label: 'All Meta aspect ratios', on: true },
        { label: 'Swipe file + angle extraction', on: true },
        { label: 'Voice of customer', on: true },
        { label: 'Surgical iteration', on: true },
        { label: 'Cross-product library', on: true },
        { label: 'Priority support + onboarding', on: true },
      ] as PricingFeature[],
    },
  ]

  const isMobile = useIsMobile()
  return (
    <section id="pricing" aria-labelledby="pricing-title" style={{ background: T.cream, color: T.ink, scrollMarginTop: 64 }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: SECTION_PADDING(isMobile) }}>
        <div style={{ textAlign: 'center', marginBottom: isMobile ? 32 : 56 }}>
          <Eyebrow color={T.brand} style={{ justifyContent: 'center' }}>start free · 08</Eyebrow>
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
          }} id="pricing-title">
            Start free.{' '}
            <span style={{ color: T.textOnCreamMuted, fontWeight: 400 }}>Then a flat monthly.</span>
          </h2>
          <p style={{ fontFamily: fontBody, fontSize: 17, color: T.textOnCreamMuted, lineHeight: 1.55, margin: '32px auto 0', maxWidth: 700 }}>
            100 free credits to start — no card. Pick a plan when you're ready for more.
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
                    borderRadius: 4,
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
                  {p.features.map(({ label, on }, i) => (
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
                  <Link to="/pricing" style={{ textDecoration: 'none', display: 'block' }}>
                    <Btn
                      as="span"
                      kind={popular ? 'primary' : 'secondaryCream'}
                      size="lg"
                      style={{ width: '100%', justifyContent: 'center' }}
                    >
                      {popular ? 'Choose this plan →' : 'Choose plan'}
                    </Btn>
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ marginTop: 24, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <MonoLabel>no card to start · upgrade or downgrade anytime · cancel anytime</MonoLabel>
          <a
            href="/sign-up?redirect_url=%2Fonboarding%3Fstarter%3D1"
            style={{
              fontFamily: fontBody,
              fontSize: 13,
              color: T.textMuted,
              textDecoration: 'none',
              borderBottom: `1px solid ${T.textMuted}`,
              paddingBottom: 1,
            }}
          >
            Or start free — 100 credits, no card needed →
          </a>
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
  const isMobile = useIsMobile()
  const items: FAQItem[] = [
    { q: 'Is it really free to start — no card?', a: "Yes. Every new account gets 100 free credits (about 10 ads) with no credit card. Generate, preview, and mark winners for free. When you run out — or want to export and run bigger tests — pick a plan. No trial countdown, no surprise charge." },
    { q: 'Is this the same as AdCreative or Glorify?', a: "Different audience, different shape. AdCreative and Glorify are mass-market generators built for ecom owners who want a fast prompt-to-output flow. ProdSnap is built for performance teams — if you're testing 5+ angles a week, this is for you. Angle testing, swipe files, voice of customer, batched creatives — the muscles you build when you ship creative every week." },
    { q: 'How is this different from Foreplay?', a: "Foreplay is a swipe file — a place to store ads you like. ProdSnap is a creative tool: it reads your product, proposes the angles worth testing, turns each into ad concepts, and generates Meta-ready creatives with copy. Swiping is one input, not the product." },
    { q: 'What about my brand consistency?', a: "Each brand keeps its own kit — colors, fonts, voice notes. Tag a product with the brand it belongs to, and the generator pulls that kit's colors, voice, and offer into every batch. Lite includes 2 brand kits, Pro 10, Max unlimited. Kits don't bleed into each other across products." },
    { q: 'Will the output actually run on Meta?', a: "Yes — every output is in 1:1, 4:5, or 9:16 (you pick), exported as high-res PNG, and meets Meta's Ads Manager spec. Optional ad copy generation follows Meta best practices for headlines, primary texts, and CTAs." },
    { q: 'Can I bring competitor ads as references?', a: "Yes. Paste URLs from Meta Ad Library, drag images in, or bookmark templates from our curated library. Per-product. They feed the generator on every batch for that product." },
  ]

  return (
    <section aria-labelledby="faq-title" style={{ background: T.bg, color: T.text }}>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: SECTION_PADDING(isMobile) }}>
        <div style={{ textAlign: 'center', marginBottom: isMobile ? 32 : 56 }}>
          <Eyebrow style={{ justifyContent: 'center' }}>faq · 09</Eyebrow>
          <h2 style={{
            fontFamily: fontDisplay,
            fontSize: isMobile ? 36 : 56,
            lineHeight: 1.05,
            letterSpacing: '-0.03em',
            fontWeight: 600,
            margin: '20px auto 0',
            paddingBottom: '0.18em',
          }} id="faq-title">
            Things media buyers ask first.
          </h2>
        </div>
        <div style={{ borderTop: `1px solid ${T.border}` }}>
          {items.map(({ q, a }, i) => (
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
  const isMobile = useIsMobile()
  return (
    <section aria-labelledby="final-cta-title" style={{
      background: `linear-gradient(135deg, ${T.bg} 0%, ${T.creamElev} 100%)`,
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
        <Eyebrow style={{ justifyContent: 'center' }}>from product to tested ad</Eyebrow>
        <h2 style={{
          fontFamily: fontDisplay,
          fontSize: isMobile ? 48 : 88,
          lineHeight: 1.02,
          letterSpacing: '-0.04em',
          fontWeight: 600,
          margin: '24px auto 36px',
          maxWidth: 1100,
          paddingBottom: '0.12em',
        }} id="final-cta-title">
          Stop briefing designers <br/>
          <span style={{ color: T.textMuted, fontWeight: 400 }}>for every angle test.</span>
        </h2>
        <p style={{ fontFamily: fontBody, fontSize: isMobile ? 16 : 19, color: T.textMuted, maxWidth: 600, margin: '0 auto 36px', lineHeight: 1.5 }}>
          From a product URL to ready-to-ship ads — angles, concepts, creative, and copy.
        </p>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 12, justifyContent: 'center', alignItems: 'center' }}>
          <Link to="/onboarding" search={{ starter: true }} style={{ textDecoration: 'none' }}>
            <Btn as="span" kind="primary" size="lg">Start free →</Btn>
          </Link>
          <Link to="/templates" style={{ textDecoration: 'none' }}>
            <Btn as="span" kind="secondary" size="lg">Browse templates</Btn>
          </Link>
        </div>
        <div style={{ marginTop: 18 }}>
          <MonoLabel>100 free credits · no card · ~10 ads</MonoLabel>
        </div>
      </div>
    </section>
  )
}

// ============================================================
// FOOTER
// ============================================================

function LandingFooter() {
  const isMobile = useIsMobile()
  const linkStyle: React.CSSProperties = {
    fontFamily: fontBody,
    fontSize: 14,
    color: T.textMuted,
    textDecoration: 'none',
    cursor: 'pointer',
  }
  return (
    <footer style={{ background: T.bg, color: T.textMuted, borderTop: `1px solid ${T.border}` }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: isMobile ? '32px 16px 24px' : '48px 32px 32px' }}>
        <div style={{
          display: isMobile ? 'flex' : 'grid',
          flexDirection: isMobile ? 'column' : undefined,
          gridTemplateColumns: isMobile ? undefined : '1fr auto',
          gap: isMobile ? 24 : 32,
          alignItems: isMobile ? 'flex-start' : 'flex-end',
          marginBottom: 32,
        }}>
          <div>
            <span style={{ display: 'inline-block' }}>
              <LogoMark size="sm" />
            </span>
            <div style={{ fontFamily: fontBody, fontSize: 14, color: T.textDim, marginTop: 16, maxWidth: 360, lineHeight: 1.5 }}>
              Performance creative co-pilot for media buyers and small agencies running multiple brands.
            </div>
          </div>
          {/* Links — only functional ones rendered. Add more as the public
              pages they point to ship. */}
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <a href="mailto:info@prodsnap.io" style={linkStyle}>info@prodsnap.io</a>
            <Link to="/privacy" style={linkStyle}>Privacy</Link>
            <Link to="/terms" style={linkStyle}>Terms</Link>
          </div>
        </div>
        <div style={{ paddingTop: 24, borderTop: `1px solid ${T.border}` }}>
          <MonoLabel>© {new Date().getFullYear()} ProdSnap · made for buyers, by buyers</MonoLabel>
        </div>
      </div>
    </footer>
  )
}

// ============================================================
// PAGE (route component)
// ============================================================

function Home() {
  const isMobile = useMediaQuery('(max-width: 768px)', false, { getInitialValueInEffect: false }) ?? false
  return (
    <LandingLayoutContext.Provider value={isMobile}>
      <main className="landing-root" style={{ background: T.bg, minHeight: '100vh' }}>
        <Hero />
        <WorkflowSection />
        <SplitSection />
        <OnrampsSection />
        <VOCSection />
        <SurgicalSection />
        <AdTestSection />
        <FeatureGrid />
        <PricingSection />
        <FAQSection />
        <FinalCTA />
        <LandingFooter />
      </main>
    </LandingLayoutContext.Provider>
  )
}
