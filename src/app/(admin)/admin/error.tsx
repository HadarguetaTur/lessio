'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { reportClientError } from '@/lib/telemetry/reportClientError'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[admin/error-boundary] Unhandled error', error)
    reportClientError(error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
      <h1 className="text-xl font-bold text-gray-900 mb-2">Admin Error</h1>
      <p className="text-sm text-muted-foreground mb-6">An unexpected error occurred in the admin panel.</p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          Retry
        </button>
        <Link
          href="/admin/dashboard"
          className="px-4 py-2 text-sm font-medium border border-border rounded-md hover:bg-muted transition-colors"
        >
          Back to Admin Dashboard
        </Link>
      </div>
      {error.digest && (
        <p className="mt-4 text-xs text-muted-foreground">Error ID: {error.digest}</p>
      )}
    </div>
  )
}
