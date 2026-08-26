'use client'

/**
 * Last-resort boundary — Sprint 32 M3.
 *
 * Until now this file did not exist, which meant a throw in the root layout
 * itself (a bad locale load, a provider that failed to mount) rendered Next's
 * default white error page and reported nothing at all: the least visible
 * failure in the product was also the most severe.
 *
 * It replaces the whole document, so unlike every other boundary it must render
 * its own <html> and <body>. For the same reason it cannot use next-intl —
 * there is no provider above it — so the copy is deliberately bilingual and
 * hardcoded rather than translated.
 */

import { useEffect } from 'react'
import { reportClientError } from '@/lib/telemetry/reportClientError'

// No next-intl provider exists above global-error, so both languages are inlined.
/* eslint-disable no-restricted-syntax -- see above */
const TITLE_HE = 'משהו השתבש'
const BODY_HE = 'נסי לרענן את העמוד. אם זה חוזר, אנחנו כבר יודעים על זה.'
const RETRY_LABEL = 'רענון / Retry'
/* eslint-enable no-restricted-syntax */

const TITLE_EN = 'Something went wrong'
const BODY_EN = 'Try reloading — if it keeps happening, we already know.'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[global-error-boundary] Unhandled error', error)
    reportClientError(error)
  }, [error])

  return (
    <html lang="he" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.75rem',
          padding: '2rem',
          textAlign: 'center',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
          background: '#fff',
          color: '#111',
        }}
      >
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>{TITLE_HE}</h1>
        <p style={{ fontSize: '0.875rem', color: '#666', margin: 0 }}>{BODY_HE}</p>
        <p style={{ fontSize: '0.875rem', color: '#666', margin: 0 }} dir="ltr">
          {TITLE_EN}. {BODY_EN}
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: '0.5rem',
            padding: '0.5rem 1rem',
            fontSize: '0.875rem',
            fontWeight: 500,
            color: '#fff',
            background: '#111',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
          }}
        >
          {RETRY_LABEL}
        </button>
        {error.digest && (
          <p style={{ fontSize: '0.75rem', color: '#999', margin: 0 }} dir="ltr">
            Error ID: {error.digest}
          </p>
        )}
      </body>
    </html>
  )
}
