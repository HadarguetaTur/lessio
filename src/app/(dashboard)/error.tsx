'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[dashboard/error-boundary] Unhandled error', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
      <h1 className="text-xl font-bold text-gray-900 mb-2">משהו השתבש</h1>
      <p className="text-sm text-gray-500 mb-6">אירעה שגיאה בלתי צפויה. ניתן לנסות שוב.</p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          נסה שוב
        </button>
        <Link
          href="/dashboard"
          className="px-4 py-2 text-sm font-medium border border-border rounded-md hover:bg-muted transition-colors"
        >
          חזרה לדשבורד
        </Link>
      </div>
      {error.digest && (
        <p className="mt-4 text-xs text-gray-400">Error ID: {error.digest}</p>
      )}
    </div>
  )
}
