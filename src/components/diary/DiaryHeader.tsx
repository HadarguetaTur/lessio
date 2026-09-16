import type { ReactNode } from 'react'
import Link from 'next/link'

import { DiaryLocaleToggle } from '@/components/diary/DiaryLocaleToggle'

/**
 * The cover's edge: the sticky teal strip every diary page is closed above.
 * The L logo and the LESSIO wordmark are the two brand commitments carried
 * over from before the diary; everything else on the strip is a slot.
 */
export function DiaryHeader({
  locale,
  wordmarkHref = '/',
  wordmarkLabel,
  nav,
  actions,
}: {
  locale: string
  wordmarkHref?: string
  /** Accessible name for the logo link when it leads somewhere. */
  wordmarkLabel?: string
  /** Section links, shown at md+ beside the wordmark. */
  nav?: ReactNode
  /** Actions at the reading end: login, the primary action, a back link. */
  actions?: ReactNode
}) {
  return (
    <header className="cover sticky top-0 z-50">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={wordmarkHref} aria-label={wordmarkLabel} className="flex min-w-0 items-center gap-3 no-underline hover:no-underline">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-violet-600 shadow-sm ring-1 ring-white/15">
              <span className="text-sm font-bold leading-none text-white">L</span>
            </span>
            <span className="display text-lg tracking-wide">LESSIO</span>
          </Link>
          {nav}
        </div>
        <nav className="flex shrink-0 items-center gap-2 sm:gap-4" aria-label="Primary">
          <DiaryLocaleToggle currentLocale={locale} className="muted hover:!text-[color:var(--cover-ink)]" />
          {actions}
        </nav>
      </div>
    </header>
  )
}
