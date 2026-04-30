'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getAvailabilitySummaryAction,
  getAvailableSlotsAction,
  lockSlotAction,
} from '@/app/book/[token]/actions'
import type {
  AvailabilityBand,
  AvailabilitySummary,
  AvailableSlot,
  SlotLock,
} from '@/lib/booking'
import { DURATION_OPTIONS } from './DateDurationSelect'

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
const LOCK_DURATION_MS = 5 * 60 * 1000

export interface AvailabilitySelection {
  date: string
  durationMinutes: number
  weekStart: string
  timezone: string
  slot: AvailableSlot
  lock: SlotLock
}

interface AvailabilityCalendarProps {
  token: string
  teacherId: string
  teacherName: string
  initialWeekStart?: string
  initialDate?: string
  initialDurationMinutes?: number
  onLocked: (selection: AvailabilitySelection) => void
  onBack: () => void
  onError: (errorCode: string) => void
}

export function AvailabilityCalendar({
  token,
  teacherId,
  teacherName,
  initialWeekStart,
  initialDate,
  initialDurationMinutes = 60,
  onLocked,
  onBack,
  onError,
}: AvailabilityCalendarProps) {
  const [durationMinutes, setDurationMinutes] = useState(initialDurationMinutes)
  const [weekStart, setWeekStart] = useState<string | undefined>(initialWeekStart)
  const [summary, setSummary] = useState<AvailabilitySummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [summaryError, setSummaryError] = useState<string | null>(null)

  const [selectedDate, setSelectedDate] = useState<string | null>(initialDate ?? null)
  const [selectedBand, setSelectedBand] = useState<AvailabilityBand | null>(null)

  const [daySlots, setDaySlots] = useState<AvailableSlot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slotsError, setSlotsError] = useState<string | null>(null)
  const [locking, setLocking] = useState<string | null>(null)
  const [lockError, setLockError] = useState<string | null>(null)
  const [activeLock, setActiveLock] = useState<{ lock: SlotLock; slot: AvailableSlot } | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)

  const timezone = summary?.timezone ?? 'UTC'

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true)
    setSummaryError(null)

    try {
      const result = await getAvailabilitySummaryAction(
        token,
        teacherId,
        durationMinutes,
        weekStart
      )
      setSummary(result)
      setWeekStart(result.weekStart)
    } catch {
      setSummaryError('לא הצלחנו לטעון את הזמינות כרגע. אפשר לנסות שוב בעוד רגע.')
    } finally {
      setSummaryLoading(false)
    }
  }, [durationMinutes, teacherId, token, weekStart])

  const loadSlotsForDate = useCallback(
    async (date: string) => {
      setSlotsLoading(true)
      setSlotsError(null)

      try {
        const slots = await getAvailableSlotsAction(token, teacherId, date, durationMinutes)
        setDaySlots(slots)
      } catch {
        setSlotsError('לא הצלחנו לטעון את השעות המדויקות כרגע. אפשר לנסות שוב.')
      } finally {
        setSlotsLoading(false)
      }
    },
    [durationMinutes, teacherId, token]
  )

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  useEffect(() => {
    if (!summary || activeLock) return

    const availableDays = summary.days.filter((day) => day.freeIntervals.length > 0)
    if (availableDays.length === 0) {
      setSelectedDate(null)
      setSelectedBand(null)
      setDaySlots([])
      return
    }

    const currentDay = selectedDate
      ? summary.days.find((day) => day.date === selectedDate)
      : null
    const matchingBand = currentDay && selectedBand
      ? currentDay.freeIntervals.find(
          (band) =>
            band.startAt === selectedBand.startAt &&
            band.endAt === selectedBand.endAt
        )
      : null

    if (currentDay && matchingBand) {
      return
    }

    const fallbackDay =
      (initialDate && summary.days.find((day) => day.date === initialDate && day.freeIntervals.length > 0)) ||
      availableDays[0]

    setSelectedDate(fallbackDay.date)
    setSelectedBand(fallbackDay.freeIntervals[0] ?? null)
  }, [activeLock, initialDate, selectedBand, selectedDate, summary])

  useEffect(() => {
    if (!selectedDate) return
    void loadSlotsForDate(selectedDate)
  }, [loadSlotsForDate, selectedDate])

  useEffect(() => {
    if (!activeLock) return

    const expiresAt = new Date(activeLock.lock.expires_at).getTime()
    const tick = () => {
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
      setSecondsLeft(remaining)

      if (remaining === 0) {
        setActiveLock(null)
        setLockError('השעה כבר לא שמורה עבורכם. בחרו שעה אחרת כדי להמשיך.')
        if (selectedDate) {
          void loadSlotsForDate(selectedDate)
        }
        void loadSummary()
      }
    }

    tick()
    const timerId = window.setInterval(tick, 1000)
    return () => window.clearInterval(timerId)
  }, [activeLock, loadSlotsForDate, loadSummary, selectedDate])

  const visibleSlots = useMemo(() => {
    if (!selectedBand) return daySlots
    const bandStart = new Date(selectedBand.startAt).getTime()
    const bandEnd = new Date(selectedBand.endAt).getTime()

    return daySlots.filter((slot) => {
      const slotStart = new Date(slot.startAt).getTime()
      const slotEnd = new Date(slot.endAt).getTime()
      return slotStart >= bandStart && slotEnd <= bandEnd
    })
  }, [daySlots, selectedBand])

  function handleWeekChange(delta: number) {
    if (!summary || activeLock) return

    const nextWeekStart = addDays(summary.weekStart, delta * 7)
    setWeekStart(nextWeekStart)
    setSelectedDate(null)
    setSelectedBand(null)
    setDaySlots([])
    setLockError(null)
  }

  function handleDurationChange(nextDuration: number) {
    if (activeLock) return

    setDurationMinutes(nextDuration)
    setSelectedDate(null)
    setSelectedBand(null)
    setDaySlots([])
    setLockError(null)
  }

  function handleBandSelect(date: string, band: AvailabilityBand) {
    if (activeLock) return

    setSelectedDate(date)
    setSelectedBand(band)
    setLockError(null)
  }

  async function handleSlotTap(slot: AvailableSlot) {
    setLocking(slot.startAt)
    setLockError(null)

    const result = await lockSlotAction(token, teacherId, slot.startAt, slot.endAt)
    setLocking(null)

    if (result.success) {
      setActiveLock({ lock: result.lock, slot })
      setSecondsLeft(Math.floor(LOCK_DURATION_MS / 1000))
      return
    }

    if (result.error === 'unavailable') {
      setLockError('בזמן שבחרתם את השעה, היא נתפסה. בחרו שעה אחרת מהרשימה.')
      if (selectedDate) {
        await Promise.all([loadSummary(), loadSlotsForDate(selectedDate)])
      }
      return
    }

    if (result.error === 'token_expired') {
      onError('token_expired')
      return
    }

    onError('unknown')
  }

  function handleContinue() {
    if (!activeLock || !selectedDate || !summary) return

    onLocked({
      date: selectedDate,
      durationMinutes,
      weekStart: summary.weekStart,
      timezone: summary.timezone,
      slot: activeLock.slot,
      lock: activeLock.lock,
    })
  }

  const selectedDay = selectedDate
    ? summary?.days.find((day) => day.date === selectedDate) ?? null
    : null
  const weekLabel = summary
    ? formatWeekLabel(summary.weekStart, summary.timezone)
    : ''

  return (
    <main className="min-h-screen flex items-start justify-center p-6 bg-background">
      <div className="max-w-5xl w-full space-y-6 pt-8">
        <div className="space-y-2">
          <button onClick={onBack} className="text-sm text-muted-foreground hover:underline">
            ← חזרה
          </button>
          <h1 className="text-xl font-semibold">בחרו מועד שמתאים לכם</h1>
          <p className="text-sm text-muted-foreground">מורה נבחר: {teacherName}</p>
          <p className="text-sm text-muted-foreground">
            בחרו משך שיעור, עברו בין השבועות, ואז לחצו על רצועת זמן פנויה כדי לראות שעות מדויקות.
          </p>
        </div>

        <section className="rounded-2xl border border-border bg-card p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">משך השיעור המבוקש</p>
              <div className="flex flex-wrap gap-2">
                {DURATION_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    disabled={!!activeLock}
                    onClick={() => handleDurationChange(option.value)}
                    className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                      durationMinutes === option.value
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background hover:bg-accent'
                    } disabled:opacity-50`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={summaryLoading || !!activeLock}
                onClick={() => handleWeekChange(-1)}
                className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
              >
                לשבוע הקודם
              </button>
              <div className="min-w-44 text-center text-sm font-medium">{weekLabel}</div>
              <button
                type="button"
                disabled={summaryLoading || !!activeLock}
                onClick={() => handleWeekChange(1)}
                className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
              >
                לשבוע הבא
              </button>
            </div>
          </div>

          {summaryLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">טוענים את הזמינות לשבוע הקרוב...</p>
          ) : summaryError ? (
            <div className="text-center space-y-3 py-6">
              <p className="text-sm text-destructive">{summaryError}</p>
              <button
                type="button"
                onClick={() => void loadSummary()}
                className="text-sm underline text-primary"
              >
                נסו שוב
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <div className="grid grid-cols-7 gap-3 min-w-[820px]">
                {summary?.days.map((day, index) => {
                  const isSelectedDay = day.date === selectedDate

                  return (
                    <div
                      key={day.date}
                      className={`rounded-xl border p-3 space-y-3 ${
                        isSelectedDay ? 'border-primary bg-primary/5' : 'border-border bg-background'
                      }`}
                    >
                      <div className="text-center space-y-1">
                        <p className="text-xs text-muted-foreground">{DAY_NAMES[index]}</p>
                        <p className="text-sm font-semibold">{formatDate(day.date, summary.timezone)}</p>
                      </div>

                      {day.freeIntervals.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-6">אין שעות פנויות</p>
                      ) : (
                        <div className="space-y-2">
                          {day.freeIntervals.map((band) => {
                            const isSelectedBand =
                              isSelectedDay &&
                              selectedBand?.startAt === band.startAt &&
                              selectedBand?.endAt === band.endAt

                            return (
                              <button
                                key={band.startAt}
                                type="button"
                                disabled={!!activeLock}
                                onClick={() => handleBandSelect(day.date, band)}
                                className={`w-full rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${
                                  isSelectedBand
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : 'border-border bg-card hover:bg-accent'
                                } disabled:opacity-50`}
                              >
                                {formatTimeRange(band.startAt, band.endAt, summary.timezone)}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </section>

        {lockError && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {lockError}
          </p>
        )}

        {activeLock && (
          <section className="rounded-2xl border border-primary/40 bg-primary/5 p-5 space-y-3">
            <p className="text-sm font-medium">
              שמרנו עבורכם את המועד: {formatTimeRange(activeLock.slot.startAt, activeLock.slot.endAt, timezone)}
            </p>
            <p className="text-sm text-muted-foreground">
              נשארו עוד {formatCountdown(secondsLeft)} כדי להשלים את ההזמנה
            </p>
            <button
              type="button"
              onClick={handleContinue}
              className="w-full rounded-xl bg-primary py-3 font-semibold text-primary-foreground"
            >
              המשיכו לאישור
            </button>
          </section>
        )}

        <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">שעות זמינות לבחירה</h2>
            {selectedDay && selectedBand ? (
              <p className="text-sm text-muted-foreground">
                {formatDateLabel(selectedDay.date, timezone)} · {formatTimeRange(
                  selectedBand.startAt,
                  selectedBand.endAt,
                  timezone
                )}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                בחרו רצועת זמן מהלוח כדי לראות את השעות הפנויות בתוך אותה רצועה.
              </p>
            )}
          </div>

          {!selectedDay || !selectedBand ? null : slotsLoading ? (
            <p className="text-sm text-muted-foreground">טוענים את השעות הפנויות...</p>
          ) : slotsError ? (
            <div className="space-y-3">
              <p className="text-sm text-destructive">{slotsError}</p>
              <button
                type="button"
                onClick={() => void loadSlotsForDate(selectedDay.date)}
                className="text-sm underline text-primary"
              >
                נסו שוב
              </button>
            </div>
          ) : visibleSlots.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              כרגע אין שעות פנויות בתוך הרצועה שנבחרה. אפשר לבחור רצועה אחרת.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {visibleSlots.map((slot) => (
                <button
                  key={slot.startAt}
                  type="button"
                  disabled={locking === slot.startAt || !!activeLock}
                  onClick={() => void handleSlotTap(slot)}
                  className="rounded-xl border border-border bg-background px-4 py-3 text-right text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
                >
                  {locking === slot.startAt
                    ? 'שומרים...'
                    : formatTimeRange(slot.startAt, slot.endAt, timezone)}
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

function formatDate(date: string, timezone: string): string {
  return new Intl.DateTimeFormat('he-IL', {
    day: 'numeric',
    month: 'numeric',
    timeZone: timezone,
  }).format(new Date(`${date}T12:00:00Z`))
}

function formatDateLabel(date: string, timezone: string): string {
  return new Intl.DateTimeFormat('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: timezone,
  }).format(new Date(`${date}T12:00:00Z`))
}

function formatTimeRange(startAt: string, endAt: string, timezone: string): string {
  return `${formatTime(startAt, timezone)} — ${formatTime(endAt, timezone)}`
}

function formatTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  }).format(new Date(iso))
}

function formatWeekLabel(weekStart: string, timezone: string): string {
  const start = new Date(`${weekStart}T12:00:00Z`)
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000)
  const startDay = new Intl.DateTimeFormat('he-IL', { day: 'numeric', timeZone: timezone }).format(start)
  const endDay = new Intl.DateTimeFormat('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: timezone,
  }).format(end)
  return `${startDay}–${endDay}`
}

function addDays(date: string, days: number): string {
  const base = new Date(`${date}T12:00:00Z`)
  const next = new Date(base.getTime() + days * 24 * 60 * 60 * 1000)
  return next.toISOString().slice(0, 10)
}

function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}
