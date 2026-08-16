import type { ReactNode } from 'react'
import { getLocale } from 'next-intl/server'

/**
 * Parent portal shell — mobile-first, no Supabase session.
 * Max-width 480px centered on large screens.
 * Per /docs/sprint-13-scope.md § Story 6.
 */
export default async function PortalLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale()
  const dir = locale === 'he' ? 'rtl' : 'ltr'

  return (
    // The root layout body is `overflow-hidden`, so this shell must provide its
    // own scroll container or anything below the first viewport is unreachable.
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-muted/50" dir={dir}>
      <div className="max-w-[480px] mx-auto min-h-full bg-card shadow-sm flex flex-col">
        {children}
      </div>
    </div>
  )
}
