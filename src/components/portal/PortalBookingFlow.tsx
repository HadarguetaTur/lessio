'use client'

/**
 * Portal booking flow — mobile-first, portal-session authenticated.
 * Steps: teacher → week calendar + slots → confirm → success/error
 * Uses portal-specific server actions (not the /book/[token] actions).
 *
 * Per /docs/sprint-13-scope.md § Story 8.
 */

import { useState, useEffect } from 'react'
import type { AvailableSlot, SlotLock, ConfirmBookingResult, AvailabilitySummary } from '@/lib/booking'
import {
  getPortalTeachersAction,
  getPortalSlotsAction,
  getPortalAvailabilitySummaryAction,
  portalLockSlotAction,
  portalConfirmBookingAction,
  type PortalTeacher,
} from '@/app/portal/[orgId]/book/actions'
import { BookingSuccess } from '@/components/booking/BookingSuccess'
import { BookingError } from '@/components/booking/BookingError'

const DURATION_OPTIONS = [
  { value: 30,  label: '30 דק׳' },
  { value: 45,  label: '45 דק׳' },
  { value: 60,  label: 'שעה' },
  { value: 90,  label: 'שעה וחצי' },
]

const DAY_LABELS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  const day = d.getUTCDay()
  d.setUTCDate(d.getUTCDate() - day)
  return d.toISOString().substring(0, 10)
}

function addWeeks(weekStart: string, n: number): string {
  const d = new Date(weekStart + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n * 7)
  return d.toISOString().substring(0, 10)
}

function todayStr(): string {
  return new Date().toISOString().substring(0, 10)
}

type Step = 'teachers' | 'slots' | 'confirm' | 'success' | 'error'

interface FlowState {
  teacherId?: string
  teacherName?: string
  date?: string
  durationMinutes?: number
  slot?: AvailableSlot
  lock?: SlotLock
  result?: ConfirmBookingResult
  errorCode?: string
}

interface PortalBookingFlowProps {
  orgId: string
  timezone: string
}

export function PortalBookingFlow({ orgId, timezone }: PortalBookingFlowProps) {
  const [step, setStep] = useState<Step>('teachers')
  const [state, setState] = useState<FlowState>({ durationMinutes: 60 })

  function handleRestart() {
    setState({ durationMinutes: 60 })
    setStep('teachers')
  }

  if (step === 'teachers') {
    return (
      <TeacherStep
        orgId={orgId}
        onSelect={(teacherId, teacherName) => {
          setState((s) => ({ ...s, teacherId, teacherName }))
          setStep('slots')
        }}
      />
    )
  }

  if (step === 'slots') {
    return (
      <SlotsStep
        orgId={orgId}
        timezone={timezone}
        teacherId={state.teacherId!}
        teacherName={state.teacherName!}
        initialDate={state.date ?? todayStr()}
        initialDuration={state.durationMinutes ?? 60}
        onSlotLocked={(slot, lock, date, duration) => {
          setState((s) => ({ ...s, slot, lock, date, durationMinutes: duration }))
          setStep('confirm')
        }}
        onBack={() => setStep('teachers')}
      />
    )
  }

  if (step === 'confirm') {
    return (
      <ConfirmStep
        orgId={orgId}
        timezone={timezone}
        teacherId={state.teacherId!}
        teacherName={state.teacherName!}
        slot={state.slot!}
        lock={state.lock!}
        onConfirmed={(result) => {
          setState((s) => ({ ...s, result }))
          setStep('success')
        }}
        onLockExpired={() => {
          setState((s) => ({ ...s, slot: undefined, lock: undefined }))
          setStep('slots')
        }}
        onError={(errorCode) => {
          setState((s) => ({ ...s, errorCode }))
          setStep('error')
        }}
      />
    )
  }

  if (step === 'success') {
    return (
      <BookingSuccess
        result={state.result!}
        teacherName={state.teacherName!}
        timezone={timezone}
      />
    )
  }

  return <BookingError errorCode={state.errorCode ?? 'unknown'} onRestart={handleRestart} />
}

// ── Teacher step ──────────────────────────────────────────────────────────────

function TeacherStep({
  orgId,
  onSelect,
}: {
  orgId: string
  onSelect: (teacherId: string, teacherName: string) => void
}) {
  const [teachers, setTeachers] = useState<PortalTeacher[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getPortalTeachersAction(orgId)
      .then(setTeachers)
      .catch(() => setError('שגיאה בטעינת המורים. נסה/י שוב.'))
      .finally(() => setLoading(false))
  }, [orgId])

  return (
    <div className="flex flex-col flex-1 p-4">
      <h2 className="text-base font-semibold text-gray-900 mb-4">עם איזה מורה לקבוע?</h2>
      {loading && <p className="text-sm text-gray-400 animate-pulse">טוען מורים...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && !error && teachers.length === 0 && (
        <p className="text-sm text-gray-400">אין מורים זמינים כרגע.</p>
      )}
      <div className="space-y-2">
        {teachers.map((t) => (
          <button
            key={t.id}
            onClick={() => onSelect(t.id, t.display_name)}
            className="w-full text-right px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-900 hover:border-blue-400 hover:bg-blue-50 active:scale-95 transition-all"
          >
            {t.display_name}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Slots step ────────────────────────────────────────────────────────────────

function SlotsStep({
  orgId,
  timezone,
  teacherId,
  teacherName,
  initialDate,
  initialDuration,
  onSlotLocked,
  onBack,
}: {
  orgId: string
  timezone: string
  teacherId: string
  teacherName: string
  initialDate: string
  initialDuration: number
  onSlotLocked: (slot: AvailableSlot, lock: SlotLock, date: string, duration: number) => void
  onBack: () => void
}) {
  const today = todayStr()
  const [duration, setDuration] = useState(initialDuration)
  const [weekStart, setWeekStart] = useState(() => getWeekStart(initialDate))
  const [selectedDate, setSelectedDate] = useState(initialDate)
  const [summary, setSummary] = useState<AvailabilitySummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [slots, setSlots] = useState<AvailableSlot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [locking, setLocking] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load week availability summary whenever week or duration changes
  useEffect(() => {
    setSummaryLoading(true)
    setError(null)
    getPortalAvailabilitySummaryAction(orgId, teacherId, duration, weekStart)
      .then((s) => {
        setSummary(s)
        // If selected date is outside new week, pick first available day or week start
        const dates = s.days.map((d) => d.date)
        if (!dates.includes(selectedDate)) {
          const firstAvailable = s.days.find((d) => d.hasAvailability && d.date >= today)
          setSelectedDate(firstAvailable?.date ?? s.days[0].date)
        }
      })
      .catch(() => setError('שגיאה בטעינת זמינות. נסה/י שוב.'))
      .finally(() => setSummaryLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, teacherId, duration, weekStart])

  // Load slots when selected date or duration changes
  useEffect(() => {
    if (!selectedDate) return
    setSlotsLoading(true)
    setSlots([])
    setError(null)
    getPortalSlotsAction(orgId, teacherId, selectedDate, duration)
      .then(setSlots)
      .catch(() => setError('שגיאה בטעינת מועדים. נסה/י שוב.'))
      .finally(() => setSlotsLoading(false))
  }, [orgId, teacherId, selectedDate, duration])

  async function lockSlot(slot: AvailableSlot) {
    setLocking(slot.startAt)
    setError(null)
    try {
      const lock = await portalLockSlotAction(orgId, teacherId, slot.startAt, slot.endAt)
      onSlotLocked(slot, lock, selectedDate, duration)
    } catch {
      setError('לא ניתן לשמור את המועד. נסה/י שוב.')
    } finally {
      setLocking(null)
    }
  }

  function formatSlotTime(iso: string) {
    return new Date(iso).toLocaleTimeString('he-IL', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone,
    })
  }

  function formatDayNum(dateStr: string) {
    return new Date(dateStr + 'T12:00:00Z').getUTCDate()
  }

  function formatMonthShort(dateStr: string) {
    return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('he-IL', { month: 'short' })
  }

  const canGoPrev = addWeeks(weekStart, -1) >= getWeekStart(today)
  const selectedDayData = summary?.days.find((d) => d.date === selectedDate)

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 border-b border-gray-100">
        <div className="flex items-center gap-2 mb-3">
          <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-800 p-1 -ml-1">
            →
          </button>
          <span className="text-sm font-semibold text-gray-900">{teacherName}</span>
        </div>

        {/* Duration pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {DURATION_OPTIONS.map((d) => (
            <button
              key={d.value}
              onClick={() => setDuration(d.value)}
              className={`flex-none px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                duration === d.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Week navigator */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setWeekStart((w) => addWeeks(w, 1))}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 text-lg leading-none"
          >
            ‹
          </button>
          <span className="text-xs font-medium text-gray-500">
            {summary
              ? `${formatMonthShort(summary.days[0].date)} ${new Date(summary.days[0].date + 'T12:00:00Z').getUTCFullYear()}`
              : ''}
          </span>
          <button
            onClick={() => setWeekStart((w) => addWeeks(w, -1))}
            disabled={!canGoPrev}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 disabled:opacity-30 text-lg leading-none"
          >
            ›
          </button>
        </div>

        {/* Day strip */}
        {summaryLoading ? (
          <div className="flex gap-1.5 justify-between">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex-1 h-14 rounded-xl bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="flex gap-1.5 justify-between">
            {(summary?.days ?? []).map((day) => {
              const isPast = day.date < today
              const isSelected = day.date === selectedDate
              const hasSlots = day.hasAvailability && !isPast

              return (
                <button
                  key={day.date}
                  onClick={() => !isPast && setSelectedDate(day.date)}
                  disabled={isPast}
                  className={`flex-1 flex flex-col items-center py-2 rounded-xl text-center transition-all ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-sm'
                      : isPast
                        ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                        : hasSlots
                          ? 'bg-green-50 text-gray-800 hover:bg-green-100 border border-green-200'
                          : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                  }`}
                >
                  <span className="text-[10px] font-medium">
                    {DAY_LABELS[new Date(day.date + 'T12:00:00Z').getUTCDay()]}
                  </span>
                  <span className="text-sm font-bold mt-0.5">{formatDayNum(day.date)}</span>
                  <span className={`mt-1 w-1.5 h-1.5 rounded-full ${
                    isSelected ? 'bg-white opacity-80' : hasSlots ? 'bg-green-500' : 'bg-transparent'
                  }`} />
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Slots for selected day */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {selectedDayData && (
          <p className="text-xs font-medium text-gray-500 mb-2">
            {new Date(selectedDate + 'T12:00:00Z').toLocaleDateString('he-IL', {
              weekday: 'long', day: 'numeric', month: 'long',
            })}
          </p>
        )}

        {error && (
          <p className="text-sm text-red-600 text-center py-4">{error}</p>
        )}

        {slotsLoading && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 rounded-xl bg-gray-100 animate-pulse" />
            ))}
          </div>
        )}

        {!slotsLoading && !error && slots.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-gray-400">אין מועדים פנויים ביום זה</p>
            <p className="text-xs text-gray-300 mt-1">נסי/י לבחור יום אחר</p>
          </div>
        )}

        {slots.map((slot) => (
          <button
            key={slot.startAt}
            onClick={() => lockSlot(slot)}
            disabled={locking !== null}
            className="w-full flex justify-between items-center px-4 py-3.5 bg-white border border-gray-200 rounded-xl text-sm hover:border-blue-400 hover:bg-blue-50 disabled:opacity-40 active:scale-95 transition-all"
          >
            <span className="font-semibold text-gray-900" dir="ltr">
              {formatSlotTime(slot.startAt)}
              <span className="font-normal text-gray-400 mx-1">–</span>
              {formatSlotTime(slot.endAt)}
            </span>
            {locking === slot.startAt ? (
              <span className="text-xs text-gray-400">שומר...</span>
            ) : (
              <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">
                בחר/י
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Confirm step ──────────────────────────────────────────────────────────────

function ConfirmStep({
  orgId,
  timezone,
  teacherId,
  teacherName,
  slot,
  lock,
  onConfirmed,
  onLockExpired,
  onError,
}: {
  orgId: string
  timezone: string
  teacherId: string
  teacherName: string
  slot: AvailableSlot
  lock: SlotLock
  onConfirmed: (result: ConfirmBookingResult) => void
  onLockExpired: () => void
  onError: (errorCode: string) => void
}) {
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
    try {
      const result = await portalConfirmBookingAction(orgId, lock.id, teacherId)
      onConfirmed(result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown'
      if (msg.includes('lock') || msg.includes('expired')) {
        onLockExpired()
      } else {
        onError(msg)
      }
    } finally {
      setConfirming(false)
    }
  }

  const m = Math.floor(secondsLeft / 60)
  const s = secondsLeft % 60
  const countdown = `${m}:${String(s).padStart(2, '0')}`

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString('he-IL', {
      hour: '2-digit', minute: '2-digit', timeZone: timezone,
    })
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('he-IL', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: timezone,
    })
  }

  return (
    <div className="flex flex-col flex-1 p-4 space-y-5">
      <h2 className="text-base font-semibold text-gray-900">אישור קביעת שיעור</h2>

      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">מורה</span>
          <span className="font-medium">{teacherName}</span>
        </div>
        <hr className="border-gray-100" />
        <div className="flex justify-between">
          <span className="text-gray-500">תאריך</span>
          <span className="font-medium">{formatDate(slot.startAt)}</span>
        </div>
        <hr className="border-gray-100" />
        <div className="flex justify-between">
          <span className="text-gray-500">שעה</span>
          <span className="font-medium" dir="ltr">
            {formatTime(slot.startAt)} – {formatTime(slot.endAt)}
          </span>
        </div>
      </div>

      <div className={`text-center text-sm py-2 rounded-lg ${
        secondsLeft > 30 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'
      }`}>
        {secondsLeft > 0
          ? `המועד שמור עבורך עוד ${countdown}`
          : 'פג הזמן — חזרה לבחירת מועד'}
      </div>

      <button
        onClick={handleConfirm}
        disabled={confirming || secondsLeft === 0}
        className="w-full py-3.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-40 active:scale-95 transition-all"
      >
        {confirming ? 'קובע שיעור...' : 'אישור וקביעת שיעור ✓'}
      </button>
    </div>
  )
}
