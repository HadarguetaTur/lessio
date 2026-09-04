'use client'

/**
 * Portal booking flow — mobile-first, portal-session authenticated.
 * Steps: teacher → week calendar + slots → confirm → success/error
 * Uses portal-specific server actions (not the /book/[token] actions).
 *
 * Per /docs/sprint-13-scope.md § Story 8.
 */

import { useState, useEffect, useRef } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import type { AvailableSlot, SlotLock, ConfirmBookingResult, AvailabilitySummary } from '@/lib/booking'
import {
  getPortalTeachersAction,
  getPortalStudentsAction,
  getPortalSlotsAction,
  getPortalAvailabilitySummaryAction,
  portalLockSlotAction,
  portalConfirmBookingAction,
  portalReleaseSlotLockAction,
  type PortalTeacher,
  type PortalStudent,
} from '@/app/portal/[orgId]/book/actions'
import { BookingSuccess } from '@/components/booking/BookingSuccess'
import { BookingError } from '@/components/booking/BookingError'
import { parseAppLocale, toIntlLocale } from '@/lib/i18n/locale'

// Labels come from common.durations.* — looked up at render.

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

type Step = 'students' | 'teachers' | 'slots' | 'confirm' | 'success' | 'error'

interface FlowState {
  studentId?: string
  studentName?: string
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
  durationValues: number[]
}

export function PortalBookingFlow({ orgId, timezone, durationValues }: PortalBookingFlowProps) {
  const [step, setStep] = useState<Step>('students')
  const [state, setState] = useState<FlowState>({ durationMinutes: durationValues[0] })
  /** True when the parent has one child — the picker is skipped, so there is nothing to go back to. */
  const [singleStudent, setSingleStudent] = useState(false)
  /** True when the teacher step auto-advanced (assigned teacher / one-teacher org). */
  const [singleTeacher, setSingleTeacher] = useState(false)

  function handleRestart() {
    setState({ durationMinutes: durationValues[0] })
    setStep('students')
  }

  if (step === 'students') {
    return (
      <StudentStep
        orgId={orgId}
        onSelect={(studentId, studentName, wasOnlyChild) => {
          setState((s) => ({ ...s, studentId, studentName }))
          setSingleStudent(wasOnlyChild)
          setStep('teachers')
        }}
        onError={(errorCode) => {
          setState((s) => ({ ...s, errorCode }))
          setStep('error')
        }}
      />
    )
  }

  if (step === 'teachers') {
    return (
      <TeacherStep
        orgId={orgId}
        studentId={state.studentId}
        studentName={state.studentName}
        onSelect={(teacherId, teacherName, wasOnlyTeacher) => {
          setSingleTeacher(Boolean(wasOnlyTeacher))
          setState((s) => ({ ...s, teacherId, teacherName }))
          setStep('slots')
        }}
        onBack={singleStudent ? undefined : () => setStep('students')}
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
        studentId={state.studentId!}
        studentName={state.studentName!}
        initialDate={state.date ?? todayStr()}
        initialDuration={state.durationMinutes ?? durationValues[0]}
        durationValues={durationValues}
        onSlotLocked={(slot, lock, date, duration) => {
          setState((s) => ({ ...s, slot, lock, date, durationMinutes: duration }))
          setStep('confirm')
        }}
        // An auto-skipped teacher step would bounce straight back to slots, so
        // route "back" past it — or drop the button when there is nothing left.
        onBack={
          singleTeacher
            ? singleStudent
              ? undefined
              : () => setStep('students')
            : () => setStep('teachers')
        }
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
        studentId={state.studentId!}
        studentName={state.studentName!}
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
        onBack={() => {
          // Hand the slot back before leaving, or it stays held for the rest of
          // its five minutes and vanishes from the list the parent returns to.
          const lockId = state.lock?.id
          if (lockId) void portalReleaseSlotLockAction(orgId, lockId).catch(() => {})
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
        studentName={state.studentName}
        scheduleHref={`/portal/${orgId}/schedule`}
        timezone={timezone}
      />
    )
  }

  return <BookingError errorCode={state.errorCode ?? 'unknown'} onRestart={handleRestart} />
}

// ── Student step ──────────────────────────────────────────────────────────────

/**
 * Which child is this lesson for? Skipped entirely when there is only one, so a
 * single-child parent sees no extra tap.
 */
function StudentStep({
  orgId,
  onSelect,
  onError,
}: {
  orgId: string
  onSelect: (studentId: string, studentName: string, wasOnlyChild: boolean) => void
  onError: (errorCode: string) => void
}) {
  const t = useTranslations('booking.student')
  const [students, setStudents] = useState<PortalStudent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getPortalStudentsAction(orgId)
      .then((list) => {
        if (cancelled) return
        if (list.length === 0) {
          onError('no_students')
          return
        }
        if (list.length === 1) {
          onSelect(list[0].id, list[0].full_name, true)
          return
        }
        setStudents(list)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) onError('unknown')
      })
    return () => {
      cancelled = true
    }
    // Selection callbacks are stable for the life of this step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId])

  if (loading) {
    return (
      <div className="flex flex-col flex-1 p-4 space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-12 rounded-xl bg-gray-100 animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 p-4">
      <h2 className="text-base font-semibold text-gray-900 mb-4">{t('title')}</h2>
      <div className="space-y-2">
        {students.map((student) => (
          <button
            key={student.id}
            onClick={() => onSelect(student.id, student.full_name, false)}
            className="w-full text-start px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-900 hover:border-blue-400 hover:bg-blue-50 active:scale-95 transition-all"
          >
            {student.full_name}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Teacher step ──────────────────────────────────────────────────────────────

function TeacherStep({
  orgId,
  studentId,
  studentName,
  onSelect,
  onBack,
}: {
  orgId: string
  studentId?: string
  studentName?: string
  /** `wasOnlyTeacher` true = the step auto-advanced (assigned teacher or a
   *  one-teacher org); the caller should not route "back" into it. */
  onSelect: (teacherId: string, teacherName: string, wasOnlyTeacher?: boolean) => void
  onBack?: () => void
}) {
  const t = useTranslations('booking.teacher')
  const [teachers, setTeachers] = useState<PortalTeacher[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    getPortalTeachersAction(orgId, studentId)
      .then((list) => {
        if (list.length === 1) {
          onSelect(list[0].id, list[0].display_name, true)
          return
        }
        setTeachers(list)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onSelect identity is not stable in the parent; re-fetching on it would loop
  }, [orgId, studentId])

  return (
    <div className="flex flex-col flex-1 p-4">
      {onBack && (
        <button
          onClick={onBack}
          className="self-start flex items-center gap-1 min-h-11 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} className="rtl:rotate-180" aria-hidden />
          {t('back')}
        </button>
      )}
      <h2 className="text-base font-semibold text-gray-900 mb-1">{t('title')}</h2>
      {studentName && (
        <p className="text-sm text-muted-foreground mb-4">{t('forStudent', { name: studentName })}</p>
      )}
      {!studentName && <div className="mb-3" />}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      )}
      {error && <p className="text-sm text-red-600">{t('loadError')}</p>}
      {!loading && !error && teachers.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      )}
      <div className="space-y-2">
        {teachers.map((teacher) => (
          <button
            key={teacher.id}
            onClick={() => onSelect(teacher.id, teacher.display_name)}
            className="w-full text-start px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-900 hover:border-blue-400 hover:bg-blue-50 active:scale-95 transition-all"
          >
            {teacher.display_name}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Slots step ────────────────────────────────────────────────────────────────

// Message keys under booking.availability — translated at render so a
// language switch mid-flow updates them too.
type SlotsErrorKey = 'summaryError' | 'slotsError' | 'lockTaken' | 'quotaReached'

function SlotsStep({
  orgId,
  timezone,
  teacherId,
  teacherName,
  studentId,
  studentName,
  initialDate,
  initialDuration,
  durationValues,
  onSlotLocked,
  onBack,
}: {
  orgId: string
  timezone: string
  teacherId: string
  teacherName: string
  studentId: string
  studentName: string
  initialDate: string
  initialDuration: number
  durationValues: number[]
  onSlotLocked: (slot: AvailableSlot, lock: SlotLock, date: string, duration: number) => void
  /** Absent when every earlier step was auto-skipped. */
  onBack?: () => void
}) {
  const t = useTranslations('booking.availability')
  const tCommon = useTranslations('common')
  const intlLocale = toIntlLocale(parseAppLocale(useLocale()))
  const today = todayStr()
  const [duration, setDuration] = useState(initialDuration)
  const [weekStart, setWeekStart] = useState(() => getWeekStart(initialDate))
  const [selectedDate, setSelectedDate] = useState(initialDate)
  const [summary, setSummary] = useState<AvailabilitySummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [slots, setSlots] = useState<AvailableSlot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [locking, setLocking] = useState<string | null>(null)
  const [error, setError] = useState<SlotsErrorKey | null>(null)

  // The flow opens on the current week, which for a busy teacher is often
  // already spent — every remaining day full, blocked or quota-capped — so all
  // seven chips render gray and the screen reads as "the teacher is never
  // available". Until the parent first sees a bookable week, an empty summary
  // silently advances to the next week (the skeleton stays up in between).
  // The cap keeps a teacher with no availability at all from sending the
  // calendar months ahead: when it runs out the view returns to the real week.
  // Cleared on the first bookable week and on manual navigation, so paging
  // through empty weeks by hand never yanks the parent elsewhere.
  const autoAdvance = useRef<{ weeksLeft: number; homeWeek: string } | null>({
    weeksLeft: 8,
    homeWeek: getWeekStart(initialDate),
  })

  // Load week availability summary whenever week or duration changes
  useEffect(() => {
    setSummaryLoading(true)
    setError(null)
    getPortalAvailabilitySummaryAction(orgId, teacherId, duration, weekStart, studentId)
      .then((s) => {
        const bookable = s.days.some((d) => d.hasAvailability && d.date >= today)
        const scan = autoAdvance.current
        if (scan && !bookable) {
          if (scan.weeksLeft > 0) {
            scan.weeksLeft -= 1
            setWeekStart((w) => addWeeks(w, 1))
            return // still scanning — leave the skeleton up
          }
          autoAdvance.current = null
          if (weekStart !== scan.homeWeek) {
            setWeekStart(scan.homeWeek) // nothing found — come back to the real week
            return
          }
        } else {
          autoAdvance.current = null
        }
        setSummary(s)
        // If selected date is outside new week, pick first available day or week start
        const dates = s.days.map((d) => d.date)
        if (!dates.includes(selectedDate)) {
          const firstAvailable = s.days.find((d) => d.hasAvailability && d.date >= today)
          setSelectedDate(firstAvailable?.date ?? s.days[0].date)
        }
        setSummaryLoading(false)
      })
      .catch(() => {
        autoAdvance.current = null
        setError('summaryError')
        setSummaryLoading(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, teacherId, duration, weekStart])

  // Load slots when selected date or duration changes
  useEffect(() => {
    if (!selectedDate) return
    setSlotsLoading(true)
    setSlots([])
    setError(null)
    getPortalSlotsAction(orgId, teacherId, selectedDate, duration, studentId)
      .then(setSlots)
      .catch(() => setError('slotsError'))
      .finally(() => setSlotsLoading(false))
  }, [orgId, teacherId, selectedDate, duration, studentId])

  async function lockSlot(slot: AvailableSlot) {
    setLocking(slot.startAt)
    setError(null)
    try {
      const result = await portalLockSlotAction(orgId, teacherId, slot.startAt, slot.endAt, studentId)
      if (!result.success) {
        setError(result.error === 'quota_exceeded' ? 'quotaReached' : 'lockTaken')
        return
      }
      onSlotLocked(slot, result.lock, selectedDate, duration)
    } catch {
      setError('lockTaken')
    } finally {
      setLocking(null)
    }
  }

  function formatSlotTime(iso: string) {
    return new Date(iso).toLocaleTimeString(intlLocale, {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone,
    })
  }

  function formatDayNum(dateStr: string) {
    return new Date(dateStr + 'T12:00:00Z').getUTCDate()
  }

  function formatWeekday(dateStr: string) {
    return new Intl.DateTimeFormat(intlLocale, { weekday: 'short', timeZone: 'UTC' }).format(
      new Date(dateStr + 'T12:00:00Z')
    )
  }

  function formatMonthYear(dateStr: string) {
    return new Intl.DateTimeFormat(intlLocale, {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(dateStr + 'T12:00:00Z'))
  }

  const canGoPrev = addWeeks(weekStart, -1) >= getWeekStart(today)
  const selectedDayData = summary?.days.find((d) => d.date === selectedDate)

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 border-b border-gray-100">
        <div className="flex items-center gap-2 mb-3">
          {onBack && (
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-gray-800 p-1 -ms-1"
            >
              <ArrowLeft className="size-3.5 rtl:rotate-180" aria-hidden />
              {t('back')}
            </button>
          )}
          <span className="text-sm font-semibold text-gray-900">{teacherName}</span>
          <span className="text-sm text-muted-foreground truncate">· {studentName}</span>
        </div>

        {/* Duration pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {durationValues.map((value) => (
            <button
              key={value}
              onClick={() => setDuration(value)}
              className={`flex-none px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                duration === value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tCommon('durationMinutes', { n: value })}
            </button>
          ))}
        </div>
      </div>

      {/* Week navigator */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => {
              autoAdvance.current = null
              setWeekStart((w) => addWeeks(w, -1))
            }}
            disabled={!canGoPrev}
            aria-label={t('prevWeek')}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-muted-foreground disabled:opacity-30"
          >
            <ChevronLeft className="size-5 rtl:rotate-180" aria-hidden />
          </button>
          <span className="text-xs font-medium text-muted-foreground">
            {summary ? formatMonthYear(summary.days[0].date) : ''}
          </span>
          <button
            onClick={() => {
              autoAdvance.current = null
              setWeekStart((w) => addWeeks(w, 1))
            }}
            aria-label={t('nextWeek')}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-muted-foreground"
          >
            <ChevronRight className="size-5 rtl:rotate-180" aria-hidden />
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
                          : 'bg-gray-50 text-muted-foreground hover:bg-gray-100'
                  }`}
                >
                  <span className="text-[10px] font-medium">{formatWeekday(day.date)}</span>
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
          <p className="text-xs font-medium text-muted-foreground mb-2">
            {new Date(selectedDate + 'T12:00:00Z').toLocaleDateString(intlLocale, {
              weekday: 'long', day: 'numeric', month: 'long',
            })}
          </p>
        )}

        {error && (
          <p className="text-sm text-red-600 text-center py-4">{t(error)}</p>
        )}

        {summary?.quotaExceeded && !error && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
            {t('quotaReachedWeek')}
          </p>
        )}

        {slotsLoading && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 rounded-xl bg-gray-100 animate-pulse" />
            ))}
          </div>
        )}

        {!slotsLoading && !error && !summary?.quotaExceeded && slots.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">{t('noSlotsThisDay')}</p>
            <p className="text-xs text-gray-300 mt-1">{t('tryAnotherDay')}</p>
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
              <span className="font-normal text-muted-foreground mx-1">–</span>
              {formatSlotTime(slot.endAt)}
            </span>
            {locking === slot.startAt ? (
              <span className="text-xs text-muted-foreground">{t('locking')}</span>
            ) : (
              <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">
                {t('choose')}
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
  studentId,
  studentName,
  slot,
  lock,
  onConfirmed,
  onLockExpired,
  onBack,
  onError,
}: {
  orgId: string
  timezone: string
  teacherId: string
  teacherName: string
  studentId: string
  studentName: string
  slot: AvailableSlot
  lock: SlotLock
  onConfirmed: (result: ConfirmBookingResult) => void
  onLockExpired: () => void
  onBack: () => void
  onError: (errorCode: string) => void
}) {
  const t = useTranslations('booking.confirm')
  const intlLocale = toIntlLocale(parseAppLocale(useLocale()))
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
      const result = await portalConfirmBookingAction(orgId, lock.id, teacherId, studentId)
      if (!result.success) {
        if (result.error === 'lock_expired') onLockExpired()
        else onError(result.error)
        return
      }
      onConfirmed(result.result)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'unknown')
    } finally {
      setConfirming(false)
    }
  }

  const m = Math.floor(secondsLeft / 60)
  const s = secondsLeft % 60
  const countdown = `${m}:${String(s).padStart(2, '0')}`

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString(intlLocale, {
      hour: '2-digit', minute: '2-digit', timeZone: timezone,
    })
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(intlLocale, {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: timezone,
    })
  }

  return (
    <div className="flex flex-col flex-1 p-4 space-y-5">
      <h2 className="text-base font-semibold text-gray-900">{t('title')}</h2>

      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('student')}</span>
          <span className="font-medium">{studentName}</span>
        </div>
        <hr className="border-gray-100" />
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('teacher')}</span>
          <span className="font-medium">{teacherName}</span>
        </div>
        <hr className="border-gray-100" />
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('date')}</span>
          <span className="font-medium">{formatDate(slot.startAt)}</span>
        </div>
        <hr className="border-gray-100" />
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('time')}</span>
          <span className="font-medium" dir="ltr">
            {formatTime(slot.startAt)} – {formatTime(slot.endAt)}
          </span>
        </div>
      </div>

      <div className={`text-center text-sm py-2 rounded-lg ${
        secondsLeft > 30 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'
      }`}>
        {secondsLeft > 0 ? t('held', { countdown }) : t('heldExpired')}
      </div>

      <button
        onClick={handleConfirm}
        disabled={confirming || secondsLeft === 0}
        className="w-full py-3.5 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-40 active:scale-95 transition-all"
      >
        {confirming ? t('submitting') : t('submit')}
      </button>

      {/* Picking the wrong hour used to mean the browser back button. */}
      <button
        onClick={onBack}
        disabled={confirming}
        className="w-full min-h-11 inline-flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-gray-800 disabled:opacity-40"
      >
        <ArrowLeft className="size-3.5 rtl:rotate-180" aria-hidden />
        {t('changeSlot')}
      </button>
    </div>
  )
}
