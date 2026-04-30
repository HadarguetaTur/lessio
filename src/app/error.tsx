'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[error-boundary] Unhandled error', error)
  }, [error])

  return (
    <html>
      <body>
        <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">משהו השתבש</h1>
          <p className="text-sm text-gray-500 mb-6">
            Something went wrong. Please try again.
          </p>
          <div className="flex gap-3">
            <button
              onClick={reset}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              נסה שוב
            </button>
            <Link
              href="/"
              className="px-4 py-2 text-sm font-medium border border-border rounded-md hover:bg-muted transition-colors"
            >
              דף הבית
            </Link>
          </div>
          {error.digest && (
            <p className="mt-4 text-xs text-gray-400">Error ID: {error.digest}</p>
          )}
        </div>
      </body>
    </html>
  )
}
