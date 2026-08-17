'use client'

/**
 * BookingConfirm — final confirmation step.
 * Shows booking summary and calls confirmBooking Server Action.
 */

import { useState, useEffect } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { AvailableSlot, SlotLock } from '@/lib/booking'
import type { ConfirmBookingResult } from '@/lib/booking'
import { confirmBookingAction } from '@/app/book/[token]/actions'
import { parseAppLocale, toIntlLocale } from '@/lib/i18n/locale'

interface BookingConfirmProps {
  token: string
  teacherId: string
  teacherName: string
  date: string
  slot: AvailableSlot
  lock: SlotLock
  timezone: string
  studentId: string
  onConfirmed: (result: ConfirmBookingResult) => void
  onLockExpired: () => void
  onError: (errorCode: string) => void
}

export function BookingConfirm({
  token,
  teacherId,
  teacherName,
  date,
  slot,
  lock,
  timezone,
  onConfirmed,
  onLockExpired,
  onError,
}: BookingConfirmProps) {
  const t = useTranslations('booking.confirm')
  const appLocale = parseAppLocale(useLocale())
  const intlLocale = toIntlLocale(appLocale)
  const [confirming, setConfirming] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)

  useEffect(() => {
    const expiresAt = new Date(lock.expires_at).getTime()

    const tick = () => {
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
      if (!Number.isFinite(remaining)) {
        onLockExpired()
        return
      }
      setSecondsLeft(remaining)
      if (remaining === 0) onLockExpired()
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [lock.expires_at, onLockExpired])

  async function handleConfirm() {
    setConfirming(true)
    const res = await confirmBookingAction(token, lock.id, teacherId, appLocale)
    setConfirming(false)

    if (res.success) {
      onConfirmed(res.result)
    } else if (res.error === 'lock_expired') {
      onLockExpired()
    } else {
      onError(res.error)
    }
  }

  const displayDate = new Date(`${date}T12:00:00Z`).toLocaleDateString(intlLocale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: timezone,
  })

  const startTime = new Date(slot.startAt).toLocaleTimeString(intlLocale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  })

  const endTime = new Date(slot.endAt).toLocaleTimeString(intlLocale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  })

  const m = Math.floor(secondsLeft / 60)
  const s = secondsLeft % 60
  const countdown = `${m}:${String(s).padStart(2, '0')}`

  return (
    <div className="w-full space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-lg font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 space-y-3 text-sm">
          <Row label={t('teacher')} value={teacherName} />
          <Row label={t('date')} value={displayDate} />
          <Row label={t('time')} value={`${startTime} — ${endTime}`} />
        </div>

        <p className="text-sm text-muted-foreground text-center">
          {secondsLeft > 0 ? t('held', { countdown }) : t('heldExpired')}
        </p>

        <button
          onClick={handleConfirm}
          disabled={confirming || secondsLeft === 0}
          className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-semibold disabled:opacity-40 transition-opacity"
        >
          {confirming ? t('submitting') : t('submit')}
        </button>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-end">{value}</span>
    </div>
  )
}
