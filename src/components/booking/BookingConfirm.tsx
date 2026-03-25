'use client'

/**
 * BookingConfirm — final confirmation step.
 * Shows booking summary and calls confirmBooking Server Action.
 */

import { useState, useEffect } from 'react'
import type { AvailableSlot, SlotLock } from '@/lib/booking'
import type { ConfirmBookingResult } from '@/lib/booking'
import { confirmBookingAction } from '@/app/book/[token]/actions'

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
  const [confirming, setConfirming] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)

  useEffect(() => {
    const expiresAt = new Date(lock.expires_at).getTime()

    const tick = () => {
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
      setSecondsLeft(remaining)
      if (remaining === 0) onLockExpired()
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [lock.expires_at, onLockExpired])

  async function handleConfirm() {
    setConfirming(true)
    const res = await confirmBookingAction(token, lock.id, teacherId)
    setConfirming(false)

    if (res.success) {
      onConfirmed(res.result)
    } else if (res.error === 'lock_expired') {
      onLockExpired()
    } else {
      onError(res.error)
    }
  }

  const displayDate = new Date(`${date}T12:00:00Z`).toLocaleDateString('he-IL', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: timezone,
  })

  const startTime = new Date(slot.startAt).toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  })

  const endTime = new Date(slot.endAt).toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  })

  const m = Math.floor(secondsLeft / 60)
  const s = secondsLeft % 60
  const countdown = `${m}:${String(s).padStart(2, '0')}`

  return (
    <main className="min-h-screen flex items-start justify-center p-6 bg-background">
      <div className="max-w-sm w-full space-y-6 pt-10">
        <div className="space-y-2 text-center">
          <h1 className="text-lg font-semibold">רגע לפני שמאשרים</h1>
          <p className="text-sm text-muted-foreground">
            בדקו שהפרטים נכונים, ואז השלימו את קביעת השיעור.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 space-y-3 text-sm">
          <Row label="מורה" value={teacherName} />
          <Row label="תאריך" value={displayDate} />
          <Row label="שעה" value={`${startTime} — ${endTime}`} />
        </div>

        <p className="text-sm text-muted-foreground text-center">
          {secondsLeft > 0
            ? `המועד שמור עבורכם לעוד ${countdown}`
            : 'פג הזמן לשמירת המועד'}
        </p>

        <button
          onClick={handleConfirm}
          disabled={confirming || secondsLeft === 0}
          className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-semibold disabled:opacity-40 transition-opacity"
        >
          {confirming ? 'קובעים את השיעור...' : 'אישור וקביעת שיעור'}
        </button>
      </div>
    </main>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  )
}
