import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <section className="relative overflow-hidden bg-radial-fade">
      <div className="absolute inset-0 bg-grid-soft opacity-50 pointer-events-none" />
      <div className="relative max-w-5xl mx-auto px-6 pt-24 pb-32 text-center">
        <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-full px-3 py-1 shadow-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Turn products into bestsellers — visually
        </span>
        <h1 className="mt-6 text-5xl md:text-6xl font-semibold leading-[1.05] text-slate-900">
          Pro-quality product photos{' '}
          <span className="bg-gradient-to-br from-blue-600 via-indigo-500 to-fuchsia-500 bg-clip-text text-transparent">
            in a snap
          </span>
        </h1>
        <p className="mt-6 text-lg text-slate-600 max-w-2xl mx-auto">
          Upload your product, pick an ad template, and watch AI compose lifestyle shots that
          actually look like your brand shot them.
        </p>
        <div className="mt-10 flex items-center justify-center gap-3">
          <Link
            to="/studio"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-slate-900 text-white font-medium hover:bg-slate-800 transition shadow-sm"
          >
            Open the Studio
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>

        <div className="mt-20 grid sm:grid-cols-3 gap-4 text-left">
          {[
            { n: '1', t: 'Upload', d: 'Drop a product photo. Any background.' },
            { n: '2', t: 'Match', d: 'AI finds ad templates that fit your product.' },
            { n: '3', t: 'Generate', d: 'One click, multiple on-brand variations.' },
          ].map((s) => (
            <div
              key={s.n}
              className="rounded-xl border border-slate-200 bg-white/80 backdrop-blur p-5 shadow-sm"
            >
              <div className="text-xs font-semibold text-blue-600">STEP {s.n}</div>
              <div className="mt-2 font-semibold text-slate-900">{s.t}</div>
              <div className="mt-1 text-sm text-slate-600">{s.d}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
