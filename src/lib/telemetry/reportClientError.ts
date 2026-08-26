'use client'

/**
 * Ships a boundary's error to /api/telemetry/error — Sprint 32 M3.
 *
 * Used by every error boundary, alongside Sentry. Fire-and-forget by design:
 * the boundary is already rendering a failure state, and a failed report must
 * not turn into a second error on top of the first.
 */

import * as Sentry from '@sentry/nextjs'

export function reportClientError(error: Error & { digest?: string }): void {
  try {
    Sentry.captureException(error)
  } catch {
    // Sentry not configured (no DSN) — the DB feed below still gets it.
  }

  try {
    const body = JSON.stringify({
      name: error.name,
      message: error.message,
      stack: error.stack?.slice(0, 8000),
      digest: error.digest,
      route: window.location.pathname,
      url: window.location.href,
    })

    // keepalive so the report survives the navigation that often follows a
    // crash. Errors are swallowed: there is nowhere better to send them.
    void fetch('/api/telemetry/error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {})
  } catch {
    // JSON.stringify or window access failed — nothing left to try.
  }
}
