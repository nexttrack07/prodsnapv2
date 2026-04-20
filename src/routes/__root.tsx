/// <reference types="vite/client" />
import { ReactQueryDevtools } from '@tanstack/react-query-devtools/production'
import {
  Link,
  Outlet,
  createRootRouteWithContext,
  useRouterState,
  HeadContent,
  Scripts,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import * as React from 'react'
import { Toaster } from 'react-hot-toast'
import type { QueryClient } from '@tanstack/react-query'
import { DefaultCatchBoundary } from '~/components/DefaultCatchBoundary'
import { NotFound } from '~/components/NotFound'
import { Logo } from '~/components/Logo'
import appCss from '~/styles/app.css?url'
import { seo } from '~/utils/seo'

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ...seo({
        title: 'ProdSnap — Pro-quality product photos in a snap',
        description:
          'Upload a product photo, pick Facebook-ad templates, and generate variations in seconds.',
      }),
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: '' },
      { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
      { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
      { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
      { rel: 'icon', href: '/favicon.ico' },
    ],
  }),
  errorComponent: (props) => (
    <RootDocument>
      <DefaultCatchBoundary {...props} />
    </RootDocument>
  ),
  notFoundComponent: () => <NotFound />,
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen flex flex-col">
        <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-slate-200/70">
          <div className="max-w-7xl mx-auto flex items-center justify-between px-6 h-16">
            <div className="flex items-center gap-8">
              <Link to="/" aria-label="ProdSnap home">
                <Logo size="md" />
              </Link>
              <nav className="hidden sm:flex items-center gap-1">
                <NavLink to="/">Home</NavLink>
                <NavLink to="/studio">Studio</NavLink>
                <NavLink to="/admin">Admin</NavLink>
              </nav>
            </div>
            <LoadingIndicator />
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <Toaster
          position="bottom-right"
          toastOptions={{
            style: { fontFamily: 'Poppins, sans-serif', fontSize: '14px' },
          }}
        />

        <ReactQueryDevtools />
        <TanStackRouterDevtools position="bottom-right" />
        <Scripts />
      </body>
    </html>
  )
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="px-3 py-1.5 rounded-md text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition"
      activeProps={{ className: 'text-slate-900 bg-slate-100' }}
      activeOptions={{ exact: true }}
    >
      {children}
    </Link>
  )
}

function LoadingIndicator() {
  const isLoading = useRouterState({ select: (s) => s.isLoading })
  return (
    <div
      className={`flex items-center gap-2 text-xs text-slate-500 transition-opacity duration-300 ${
        isLoading ? 'opacity-100 delay-200' : 'opacity-0'
      }`}
    >
      <span className="inline-block w-3 h-3 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
      Loading
    </div>
  )
}
