'use client'

import { useTranslations } from 'next-intl'

// Allow-list guard: next-intl throws on missing keys, so unknown codes must
// fall back to 'unknown' before being interpolated into a translation key.
const KNOWN_ERROR_CODES = [
  'lock_expired',
  'inactive_participant',
  'no_primary_parent',
  'quota_exceeded',
  'slot_taken',
  'student_conflict',
  'token_expired',
  'unknown',
] as const

type KnownErrorCode = (typeof KNOWN_ERROR_CODES)[number]

interface BookingErrorProps {
  errorCode: string
  onRestart: () => void
}

export function BookingError({ errorCode, onRestart }: BookingErrorProps) {
  const t = useTranslations('booking.errors')
  const code: KnownErrorCode = (KNOWN_ERROR_CODES as readonly string[]).includes(errorCode)
    ? (errorCode as KnownErrorCode)
    : 'unknown'
  const canRestart = code !== 'token_expired'

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-sm w-full text-center space-y-5">
        <div className="text-5xl" aria-hidden="true">⚠️</div>
        <h1 className="text-xl font-semibold">{t(`${code}.title`)}</h1>
        <p className="text-muted-foreground text-sm">{t(`${code}.body`)}</p>
        {canRestart && (
          <button
            onClick={onRestart}
            className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-semibold"
          >
            {t('restart')}
          </button>
        )}
      </div>
    </main>
  )
}
