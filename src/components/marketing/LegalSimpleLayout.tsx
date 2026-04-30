import type { ReactNode } from 'react'
import Link from 'next/link'
import { getLocale } from 'next-intl/server'

import { AuthPageDecorations } from '@/components/auth/AuthPageDecorations'

export async function LegalSimpleLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale()
  const dir = locale === 'he' ? 'rtl' : 'ltr'

  return (
    <div
      className="relative flex min-h-dvh flex-col overflow-x-hidden bg-background"
      dir={dir}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.5] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-1000 motion-safe:ease-out motion-safe:fill-mode-both"
        aria-hidden
      >
        <AuthPageDecorations />
      </div>

      <header className="relative z-10 border-b border-border/60 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3.5 sm:px-6">
          <Link
            href="/"
            className="flex min-w-0 items-center gap-3 rounded-lg outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-violet-600 shadow-sm shadow-violet-500/15 ring-1 ring-violet-500/10">
              <span className="text-sm font-bold leading-none text-white">L</span>
            </div>
            <span className="truncate text-sm font-semibold tracking-tight text-foreground">
              LESSIO
            </span>
          </Link>
        </div>
      </header>

      <main className="relative z-10 flex-1 px-4 py-12 sm:px-6 md:py-16">
        <div className="mx-auto max-w-prose">{children}</div>
      </main>
    </div>
  )
}
