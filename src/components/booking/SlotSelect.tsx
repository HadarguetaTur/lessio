'use client'

/**
 * SlotSelect — step 3 of the booking flow.
 * Fetches available slots, lets the parent tap one, creates a slot lock,
 * and shows a 5-minute countdown. If the timer expires the slot is released.
 */

import { useState, useEffect, useCallback } from 'react'
import type { AvailableSlot, SlotLock } from '@/lib/booking'
import { getAvailableSlotsAction, lockSlotAction } from '@/app/book/[token]/actions'

const LOCK_DURATION_MS = 5 * 60 * 1000

interface SlotSelectProps {
  token: string
  teacherId: string
  teacherName: string
  date: string
  durationMinutes: number
  onLocked: (slot: AvailableSlot, lock: SlotLock) => void
  onBack: () => void
  onError: (errorCode: string) => void
}

export function SlotSelect({
  token,
  teacherId,
  teacherName,
  date,
  durationMinutes,
  onLocked,
  onBack,
  onError,
}: SlotSelectProps) {
  const [slots, setSlots] = useState<AvailableSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [locking, setLocking] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [lockError, setLockError] = useState<string | null>(null)

  // Active lock countdown
  const [activeLock, setActiveLock] = useState<{ lock: SlotLock; slot: AvailableSlot } | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)

  const loadSlots = useCallback(() => {
    setLoading(true)
    setFetchError(null)
    getAvailableSlotsAction(token, teacherId, date, durationMinutes)
      .then(setSlots)
      .catch(() => setFetchError('שגיאה בטעינת השעות. אנא נסה/י שוב.'))
      .finally(() => setLoading(false))
  }, [token, teacherId, date, durationMinutes])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadSlots()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [loadSlots])

  // Countdown timer when a lock is active
  useEffect(() => {
    if (!activeLock) return

    const expiresAt = new Date(activeLock.lock.expires_at).getTime()
    const tick = () => {
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
      setSecondsLeft(remaining)
      if (remaining === 0) {
        setActiveLock(null)
        setLockError('זמן הסלוט פג — אנא בחר/י שוב.')
        loadSlots()
      }
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [activeLock, loadSlots])

  async function handleSlotTap(slot: AvailableSlot) {
    setLocking(slot.startAt)
    setLockError(null)

    const result = await lockSlotAction(token, teacherId, slot.startAt, slot.endAt)
    setLocking(null)

    if (result.success) {
      setActiveLock({ lock: result.lock, slot })
      setSecondsLeft(Math.floor(LOCK_DURATION_MS / 1000))
    } else if (result.error === 'unavailable') {
      setLockError('השעה כבר תפוסה. אנא בחר/י שעה אחרת.')
      loadSlots()
    } else if (result.error === 'token_expired') {
      onError('token_expired')
    } else {
      onError('unknown')
    }
  }

  function handleProceed() {
    if (activeLock) onLocked(activeLock.slot, activeLock.lock)
  }

  const displayDate = new Date(date).toLocaleDateString('he-IL', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })

  return (
    <main className="min-h-screen flex items-start justify-center p-6 bg-background">
      <div className="max-w-sm w-full space-y-5 pt-10">
        <div className="space-y-1">
          <button onClick={onBack} className="text-sm text-muted-foreground hover:underline">
            ← חזרה
          </button>
          <h1 className="text-lg font-semibold">בחר/י שעה</h1>
          <p className="text-sm text-muted-foreground">
            {teacherName} · {displayDate} · {durationMinutes} דקות
          </p>
        </div>

        {lockError && (
          <p className="text-sm text-destructive rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            {lockError}
          </p>
        )}

        {activeLock && (
          <div className="rounded-xl border border-primary/40 bg-primary/5 p-4 space-y-3">
            <p className="text-sm font-medium">
              שמרת את השעה {formatTime(activeLock.slot.startAt)}
            </p>
            <p className="text-sm text-muted-foreground">
              {formatCountdown(secondsLeft)} נותרו לאישור
            </p>
            <button
              onClick={handleProceed}
              className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-semibold"
            >
              המשך לאישור
            </button>
          </div>
        )}

        {loading ? (
          <p className="text-muted-foreground text-sm text-center">טוען שעות פנויות...</p>
        ) : fetchError ? (
          <div className="text-center space-y-3">
            <p className="text-destructive text-sm">{fetchError}</p>
            <button onClick={loadSlots} className="text-sm underline text-primary">
              נסה/י שוב
            </button>
          </div>
        ) : slots.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center">
            אין שעות פנויות בתאריך זה. אנא בחר/י תאריך אחר.
          </p>
        ) : (
          <ul className="space-y-2">
            {slots.map(slot => (
              <li key={slot.startAt}>
                <button
                  onClick={() => handleSlotTap(slot)}
                  disabled={locking === slot.startAt || !!activeLock}
                  className="w-full rounded-xl border border-border bg-card p-4 text-right font-medium hover:bg-accent transition-colors disabled:opacity-40"
                >
                  {locking === slot.startAt ? 'שומר...' : formatTime(slot.startAt)}
                  {' — '}
                  {formatTime(slot.endAt)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
