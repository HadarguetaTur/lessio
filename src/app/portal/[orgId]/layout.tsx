import type { ReactNode } from 'react'

/**
 * Parent portal shell — mobile-first, no Supabase session.
 * Max-width 480px centered on large screens.
 * Per /docs/sprint-13-scope.md § Story 6.
 */
export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="max-w-[480px] mx-auto min-h-screen bg-white shadow-sm flex flex-col">
        {children}
      </div>
    </div>
  )
}
