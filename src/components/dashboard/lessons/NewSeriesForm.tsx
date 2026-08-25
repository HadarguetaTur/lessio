'use client'

import { useActionState, useMemo, useState } from 'react'
import Link from 'next/link'
import { DateTime } from 'luxon'
import { useTranslations } from 'next-intl'
import { CalendarCheck2, TriangleAlert } from 'lucide-react'
import { createSeriesAction, type CreateSeriesState } from '@/app/(dashboard)/lessons/new-series/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SearchSelect } from '@/components/ui/search-select'
import type { AppLocale } from '@/lib/i18n/locale'
import { toLuxonLocale } from '@/lib/i18n/locale'

interface Props {
  teachers: { id: string; full_name: string }[]
  students: { id: string; full_name: string }[]
  timezone: string
  appLocale: AppLocale
  /** Org holidays, so the preview can flag dates the series will skip. */
  holidays: { date: string; name: string }[]
}

const initialState: CreateSeriesState = { error: null }

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

/**
 * Mirrors the date walk in createSeries.ts: first matching weekday strictly
 * after today, then every 7 or 14 days up to and including `until`.
 */
function previewDates(params: {
  dayOfWeek: number
  frequency: 'weekly' | 'biweekly'
  until: string
  timezone: string
}): DateTime[] {
  const { dayOfWeek, frequency, until, timezone } = params
  const end = DateTime.fromISO(until, { zone: timezone }).endOf('day')
  if (!end.isValid) return []

  const luxonWeekday = dayOfWeek === 0 ? 7 : dayOfWeek
  let cursor = DateTime.now().setZone(timezone).startOf('day').plus({ days: 1 })
  while (cursor.weekday !== luxonWeekday) cursor = cursor.plus({ days: 1 })

  const step = frequency === 'biweekly' ? 14 : 7
  const dates: DateTime[] = []
  // Guard against a far-future `until` turning the preview into thousands of rows.
  while (cursor <= end && dates.length < 200) {
    dates.push(cursor)
    cursor = cursor.plus({ days: step })
  }
  return dates
}

export function NewSeriesForm({ teachers, students, timezone, appLocale, holidays }: Props) {
  const t = useTranslations('lessons')
  const tCommon = useTranslations('common')
  const [state, formAction, pending] = useActionState(createSeriesAction, initialState)

  const [teacherId, setTeacherId] = useState(teachers.length === 1 ? teachers[0].id : '')
  const [studentId, setStudentId] = useState('')
  const [dayOfWeek, setDayOfWeek] = useState('')
  const [frequency, setFrequency] = useState<'weekly' | 'biweekly'>('weekly')
  const [until, setUntil] = useState('')

  const tomorrow = DateTime.now().setZone(timezone).plus({ days: 1 }).toFormat('yyyy-MM-dd')
  const holidayMap = useMemo(
    () => new Map(holidays.map((h) => [h.date, h.name])),
    [holidays]
  )

  const dates = useMemo(() => {
    if (dayOfWeek === '' || !until) return []
    return previewDates({
      dayOfWeek: Number(dayOfWeek),
      frequency,
      until,
      timezone,
    })
  }, [dayOfWeek, frequency, until, timezone])

  const luxonLocale = toLuxonLocale(appLocale)
  const clashes = dates.filter((d) => holidayMap.has(d.toISODate() ?? ''))
  const willCreate = dates.length - clashes.length

  const DAY_OPTIONS = [
    { value: 0, label: tCommon('days.sun') },
    { value: 1, label: tCommon('days.mon') },
    { value: 2, label: tCommon('days.tue') },
    { value: 3, label: tCommon('days.wed') },
    { value: 4, label: tCommon('days.thu') },
    { value: 5, label: tCommon('days.fri') },
    { value: 6, label: tCommon('days.sat') },
  ]

  const DURATION_OPTIONS = [30, 45, 60, 90]

  if (state.result) {
    const { created, skipped, conflicts } = state.result
    return (
      <div className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <CalendarCheck2 size={18} className="text-emerald-600 dark:text-emerald-400" />
          <h2 className="text-base font-semibold text-foreground">{t('series.createdSummary')}</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {t('series.createdCount', { count: created })}
          {skipped > 0 && <> {t('series.skippedCount', { count: skipped })}</>}
        </p>
        {conflicts.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-400">
            <p className="mb-1 font-medium">{t('series.skippedDatesTitle')}</p>
            <ul className="list-inside list-disc space-y-0.5">
              {conflicts.map((d) => (
                <li key={d} dir="ltr">{d}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button asChild>
            <Link href="/lessons">{t('series.backToLessons')}</Link>
          </Button>
          {/* Setting up a term usually means several series in a row. */}
          <Button asChild variant="outline">
            <Link href="/lessons/new-series">{t('series.createAnother')}</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-5 rounded-xl border border-border bg-card p-6 shadow-sm">
      {state.error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      {teachers.length === 1 ? (
        <input type="hidden" name="teacher_id" value={teachers[0].id} />
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="teacher_id">
            {t('fields.teacher')} <span className="text-destructive">*</span>
          </Label>
          <SearchSelect
            id="teacher_id"
            name="teacher_id"
            required
            value={teacherId}
            onChange={setTeacherId}
            options={teachers.map((te) => ({ value: te.id, label: te.full_name }))}
            placeholder={t('selectTeacher')}
            emptyText={t('noTeachersFound')}
            clearLabel={tCommon('actions.clear')}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="student_id">
          {t('fields.student')} <span className="text-destructive">*</span>
        </Label>
        <SearchSelect
          id="student_id"
          name="student_id"
          required
          value={studentId}
          onChange={setStudentId}
          options={students.map((s) => ({ value: s.id, label: s.full_name }))}
          placeholder={t('selectStudent')}
          emptyText={t('noStudentsFound')}
          clearLabel={tCommon('actions.clear')}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="day_of_week">
            {t('fields.dayOfWeek')} <span className="text-destructive">*</span>
          </Label>
          <select
            id="day_of_week"
            name="day_of_week"
            required
            className={selectClass}
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(e.target.value)}
          >
            <option value="">{t('selectDay')}</option>
            {DAY_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="start_time">
            {t('fields.time')} <span className="text-destructive">*</span>
          </Label>
          <Input id="start_time" name="start_time" type="time" required />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="duration_minutes">
            {t('fields.duration')} <span className="text-destructive">*</span>
          </Label>
          {/* 60 to match the single-lesson form; without a default the browser
              picked the first option (30) and quietly halved every lesson. */}
          <select
            id="duration_minutes"
            name="duration_minutes"
            required
            defaultValue={60}
            className={selectClass}
          >
            {DURATION_OPTIONS.map((n) => (
              <option key={n} value={n}>{tCommon(`durations.${n}`)}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label>
            {t('frequency')} <span className="text-destructive">*</span>
          </Label>
          <div className="flex items-center gap-4 pt-2">
            {(['weekly', 'biweekly'] as const).map((f) => (
              <label key={f} className="flex cursor-pointer items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="frequency"
                  value={f}
                  checked={frequency === f}
                  onChange={() => setFrequency(f)}
                  className="accent-primary"
                />
                {t(f)}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="until">
          {t('until')} <span className="text-destructive">*</span>
        </Label>
        <Input
          id="until"
          name="until"
          type="date"
          required
          min={tomorrow}
          value={until}
          onChange={(e) => setUntil(e.target.value)}
        />
      </div>

      {/* Creating fourteen lessons should not be a guess. */}
      {dates.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-sm font-medium text-foreground">
            {t('series.previewSummary', {
              count: willCreate,
              first: dates[0].setLocale(luxonLocale).toFormat('d LLL'),
              last: dates[dates.length - 1].setLocale(luxonLocale).toFormat('d LLL'),
            })}
          </p>
          {clashes.length > 0 && (
            <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <TriangleAlert size={13} className="mt-0.5 shrink-0" />
              <span>
                {t('series.previewHolidays', {
                  count: clashes.length,
                  dates: clashes
                    .map((d) => d.setLocale(luxonLocale).toFormat('d LLL'))
                    .join(', '),
                })}
              </span>
            </p>
          )}
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              {t('series.previewShowDates')}
            </summary>
            <ul className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3">
              {dates.map((d) => {
                const iso = d.toISODate() ?? ''
                const holiday = holidayMap.get(iso)
                return (
                  <li
                    key={iso}
                    className={
                      holiday
                        ? 'text-xs text-muted-foreground line-through'
                        : 'text-xs text-foreground'
                    }
                    title={holiday ?? undefined}
                  >
                    {d.setLocale(luxonLocale).toFormat('ccc d LLL')}
                  </li>
                )
              })}
            </ul>
          </details>
        </div>
      )}

      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" disabled={pending}>
          {pending
            ? t('series.creating')
            : dates.length > 0
              ? t('series.createButtonCount', { count: willCreate })
              : t('series.createButton')}
        </Button>
        <Button asChild variant="outline">
          <Link href="/lessons">{tCommon('actions.cancel')}</Link>
        </Button>
      </div>
    </form>
  )
}
