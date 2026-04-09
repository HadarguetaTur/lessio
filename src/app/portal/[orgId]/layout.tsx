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
    <div className="min-h-screen bg-muted/50" dir={dir}>
      <div className="max-w-[480px] mx-auto min-h-screen bg-card shadow-sm flex flex-col">
        {children}
      </div>
    </div>
  )
}
