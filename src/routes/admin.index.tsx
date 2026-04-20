import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/')({
  component: AdminIndex,
})

function AdminIndex() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <div className="mb-10">
        <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Admin</h1>
        <p className="mt-2 text-slate-500 text-lg">
          Manage the template library and the generation prompt config.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        <AdminCard
          to="/admin/templates"
          title="Templates"
          description="Upload new ad templates, review ingestion status, retry or delete."
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>
          }
        />
        <AdminCard
          to="/admin/prompts"
          title="Generation prompts"
          description="Tweak the prompt that the image model sees for exact / remix / color-adapt."
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />
            </svg>
          }
        />
      </div>
    </div>
  )
}

function AdminCard({
  to,
  title,
  description,
  icon,
}: {
  to: string
  title: string
  description: string
  icon: React.ReactNode
}) {
  return (
    <Link
      to={to}
      className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md hover:border-slate-300 transition"
    >
      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 text-slate-700 flex items-center justify-center mb-4">
        {icon}
      </div>
      <div className="font-semibold text-slate-900 text-lg group-hover:text-slate-700 transition">
        {title}
      </div>
      <div className="mt-1 text-sm text-slate-500">{description}</div>
      <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-slate-700">
        Open
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="group-hover:translate-x-0.5 transition">
          <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </Link>
  )
}
