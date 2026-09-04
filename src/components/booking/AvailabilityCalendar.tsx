'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ArrowLeft } from 'lucide-react'
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
import { parseAppLocale, toIntlLocale } from '@/lib/i18n/locale'

// Keys into the shared common.days namespace, positioned Sunday-first to match
// the summary's Sun–Sat week ordering.
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
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
  /** Absent when the teacher step was auto-skipped — there is nothing to go back to. */
  onBack?: () => void
  onError: (errorCode: string) => void
  durationValues: number[]
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
  durationValues,
}: AvailabilityCalendarProps) {
  const t = useTranslations('booking.availability')
  const tCommon = useTranslations('common')
  const intlLocale = toIntlLocale(parseAppLocale(useLocale()))
  const [durationMinutes, setDurationMinutes] = useState(initialDurationMinutes)
  const [weekStart, setWeekStart] = useState<string | undefined>(initialWeekStart)
  const [summary, setSummary] = useState<AvailabilitySummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [summaryError, setSummaryError] = useState(false)

  const [selectedDate, setSelectedDate] = useState<string | null>(initialDate ?? null)
  const [selectedBand, setSelectedBand] = useState<AvailabilityBand | null>(null)

  const [daySlots, setDaySlots] = useState<AvailableSlot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slotsError, setSlotsError] = useState(false)
  const [locking, setLocking] = useState<string | null>(null)
  // Message keys under booking.availability — translated at render so a
  // language switch mid-flow updates them too.
  const [lockError, setLockError] = useState<'lockLost' | 'lockTaken' | 'quotaReached' | null>(null)
  const [activeLock, setActiveLock] = useState<{ lock: SlotLock; slot: AvailableSlot } | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)

  const timezone = summary?.timezone ?? 'UTC'

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true)
    setSummaryError(false)

    try {
      const result = await getAvailabilitySummaryAction(
        token,
        teacherId,
        durationMinutes,
        weekStart
      )

      if (result.success) {
        // Deliberately NOT syncing weekStart state from the result: doing so
        // recreates this callback and re-fires the mount effect, doubling every
        // summary load. Navigation always sets weekStart explicitly.
        setSummary(result.data)
      } else if (result.error === 'token_expired') {
        onError('token_expired')
        return
      } else {
        setSummaryError(true)
      }
    } catch {
      setSummaryError(true)
    } finally {
      setSummaryLoading(false)
    }
  }, [durationMinutes, onError, teacherId, token, weekStart])

  const loadSlotsForDate = useCallback(
    async (date: string) => {
      setSlotsLoading(true)
      setSlotsError(false)

      try {
        const result = await getAvailableSlotsAction(token, teacherId, date, durationMinutes)

        if (result.success) {
          setDaySlots(result.data)
        } else if (result.error === 'token_expired') {
          onError('token_expired')
          return
        } else {
          setSlotsError(true)
        }
      } catch {
        setSlotsError(true)
      } finally {
        setSlotsLoading(false)
      }
    },
    [durationMinutes, onError, teacherId, token]
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
      // A non-finite expires_at must release the lock, not freeze the whole
      // calendar behind a countdown that never reaches zero.
      if (!Number.isFinite(remaining)) {
        setActiveLock(null)
        setLockError('lockLost')
        return
      }
      setSecondsLeft(remaining)

      if (remaining === 0) {
        setActiveLock(null)
        setLockError('lockLost')
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
      setLockError('lockTaken')
      if (selectedDate) {
        await Promise.all([loadSummary(), loadSlotsForDate(selectedDate)])
      }
      return
    }

    if (result.error === 'quota_exceeded') {
      // The week filled up while this page was open — refresh so the week's
      // slots disappear along with the message.
      setLockError('quotaReached')
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
    ? formatWeekLabel(summary.weekStart, summary.timezone, intlLocale)
    : ''

  return (
    <div className="w-full space-y-6">
        <div className="space-y-2">
          {onBack && (
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
            >
              <ArrowLeft className="size-3.5 rtl:rotate-180" aria-hidden />
              {t('back')}
            </button>
          )}
          <h1 className="text-xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('selectedTeacher', { name: teacherName })}</p>
          <p className="text-sm text-muted-foreground">{t('instructions')}</p>
        </div>

        <section className="rounded-2xl border border-border bg-card p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">{t('durationLabel')}</p>
              <div className="flex flex-wrap gap-2">
                {durationValues.map((value) => (
                  <button
                    key={value}
                    type="button"
                    disabled={!!activeLock}
                    onClick={() => handleDurationChange(value)}
                    className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                      durationMinutes === value
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background hover:bg-accent'
                    } disabled:opacity-50`}
                  >
                    {tCommon('durationMinutes', { n: value })}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex w-full items-center justify-between gap-2 sm:w-auto">
              <button
                type="button"
                disabled={summaryLoading || !!activeLock}
                onClick={() => handleWeekChange(-1)}
                className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
              >
                {t('prevWeek')}
              </button>
              <div className="min-w-0 flex-1 text-center text-sm font-medium sm:min-w-44 sm:flex-none">{weekLabel}</div>
              <button
                type="button"
                disabled={summaryLoading || !!activeLock}
                onClick={() => handleWeekChange(1)}
                className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
              >
                {t('nextWeek')}
              </button>
            </div>
          </div>

          {summaryLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">{t('loadingSummary')}</p>
          ) : summaryError ? (
            <div className="text-center space-y-3 py-6">
              <p className="text-sm text-destructive">{t('summaryError')}</p>
              <button
                type="button"
                onClick={() => void loadSummary()}
                className="text-sm underline text-primary"
              >
                {t('retry')}
              </button>
            </div>
          ) : summary?.quotaExceeded ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-700">
              {t('quotaReachedWeek')}
            </p>
          ) : (
            <div className="md:overflow-x-auto">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-7 md:min-w-[820px]">

                {summary?.days.map((day, index) => {
                  const isSelectedDay = day.date === selectedDate

                  return (
                    <div
                      key={day.date}
                      className={`rounded-xl border p-3 space-y-3 ${
                        isSelectedDay ? 'border-primary bg-primary/5' : 'border-border bg-background'
                      }`}
                    >
                      <div className="flex items-baseline justify-center gap-2 md:block md:text-center md:space-y-1">
                        <p className="text-xs text-muted-foreground">{tCommon(`days.${DAY_KEYS[index]}`)}</p>
                        <p className="text-sm font-semibold">{formatDate(day.date, summary.timezone, intlLocale)}</p>
                      </div>

                      {day.freeIntervals.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-2 md:py-6">{t('noSlotsForDay')}</p>
                      ) : (
                        <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
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
                                {formatTimeRange(band.startAt, band.endAt, summary.timezone, intlLocale)}
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
            {t(lockError)}
          </p>
        )}

        {activeLock && (
          <section className="rounded-2xl border border-primary/40 bg-primary/5 p-5 space-y-3">
            <p className="text-sm font-medium">
              {t('lockedSlot', {
                time: formatTimeRange(activeLock.slot.startAt, activeLock.slot.endAt, timezone, intlLocale),
              })}
            </p>
            <p className="text-sm text-muted-foreground">
              {t('lockedCountdown', { countdown: formatCountdown(secondsLeft) })}
            </p>
            <button
              type="button"
              onClick={handleContinue}
              className="w-full rounded-xl bg-primary py-3 font-semibold text-primary-foreground"
            >
              {t('continue')}
            </button>
          </section>
        )}

        <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">{t('slotsTitle')}</h2>
            {selectedDay && selectedBand ? (
              <p className="text-sm text-muted-foreground">
                {formatDateLabel(selectedDay.date, timezone, intlLocale)} · {formatTimeRange(
                  selectedBand.startAt,
                  selectedBand.endAt,
                  timezone,
                  intlLocale
                )}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{t('slotsInstructions')}</p>
            )}
          </div>

          {!selectedDay || !selectedBand ? null : slotsLoading ? (
            <p className="text-sm text-muted-foreground">{t('loadingSlots')}</p>
          ) : slotsError ? (
            <div className="space-y-3">
              <p className="text-sm text-destructive">{t('slotsError')}</p>
              <button
                type="button"
                onClick={() => void loadSlotsForDate(selectedDay.date)}
                className="text-sm underline text-primary"
              >
                {t('retry')}
              </button>
            </div>
          ) : visibleSlots.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('noSlotsInBand')}</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {visibleSlots.map((slot) => (
                <button
                  key={slot.startAt}
                  type="button"
                  disabled={locking === slot.startAt || !!activeLock}
                  onClick={() => void handleSlotTap(slot)}
                  className="rounded-xl border border-border bg-background px-4 py-3 text-start text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
                >
                  {locking === slot.startAt
                    ? t('locking')
                    : formatTimeRange(slot.startAt, slot.endAt, timezone, intlLocale)}
                </button>
              ))}
            </div>
          )}
        </section>
    </div>
  )
}

function formatDate(date: string, timezone: string, intlLocale: string): string {
  return new Intl.DateTimeFormat(intlLocale, {
    day: 'numeric',
    month: 'numeric',
    timeZone: timezone,
  }).format(new Date(`${date}T12:00:00Z`))
}

function formatDateLabel(date: string, timezone: string, intlLocale: string): string {
  return new Intl.DateTimeFormat(intlLocale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: timezone,
  }).format(new Date(`${date}T12:00:00Z`))
}

function formatTimeRange(startAt: string, endAt: string, timezone: string, intlLocale: string): string {
  return `${formatTime(startAt, timezone, intlLocale)} — ${formatTime(endAt, timezone, intlLocale)}`
}

function formatTime(iso: string, timezone: string, intlLocale: string): string {
  return new Intl.DateTimeFormat(intlLocale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  }).format(new Date(iso))
}

function formatWeekLabel(weekStart: string, timezone: string, intlLocale: string): string {
  const start = new Date(`${weekStart}T12:00:00Z`)
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000)
  const startDay = new Intl.DateTimeFormat(intlLocale, { day: 'numeric', timeZone: timezone }).format(start)
  const endDay = new Intl.DateTimeFormat(intlLocale, {
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
