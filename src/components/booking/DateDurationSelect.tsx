'use client'

/**
 * DateDurationSelect — step 2 of the booking flow.
 * Duration options: 45 / 60 / 90 minutes (from /docs/sprint-1-scope.md).
 * Date range: next 30 days.
 */

import { useState } from 'react'

export const DURATION_OPTIONS = [
  { value: 45, label: '45 דקות' },
  { value: 60, label: 'שעה' },
  { value: 90, label: 'שעה וחצי' },
]

interface DateDurationSelectProps {
  teacherId: string
  teacherName: string
  token: string
  onSelect: (date: string, durationMinutes: number) => void
  onBack: () => void
}

export function DateDurationSelect({ teacherName, onSelect, onBack }: DateDurationSelectProps) {
  const [date, setDate] = useState('')
  const [duration, setDuration] = useState<number | null>(null)

  const today = new Date()
  const minDate = formatDate(today)
  const maxDate = formatDate(addDays(today, 30))

  function handleSubmit() {
    if (!date || !duration) return
    onSelect(date, duration)
  }

  return (
    <main className="min-h-screen flex items-start justify-center p-6 bg-background">
      <div className="max-w-sm w-full space-y-6 pt-10">
        <div className="space-y-1">
          <button onClick={onBack} className="text-sm text-muted-foreground hover:underline">
            ← חזרה
          </button>
          <h1 className="text-lg font-semibold">בחר/י תאריך ומשך שיעור</h1>
          <p className="text-sm text-muted-foreground">מורה: {teacherName}</p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="lesson-date">
            תאריך
          </label>
          <input
            id="lesson-date"
            type="date"
            min={minDate}
            max={maxDate}
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">משך השיעור</p>
          <div className="grid grid-cols-3 gap-2">
            {DURATION_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setDuration(opt.value)}
                className={`rounded-xl border py-3 text-sm font-medium transition-colors ${
                  duration === opt.value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card hover:bg-accent'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!date || !duration}
          className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-semibold disabled:opacity-40 transition-opacity"
        >
          המשך
        </button>
      </div>
    </main>
  )
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function addDays(d: Date, days: number): Date {
  const result = new Date(d)
  result.setDate(result.getDate() + days)
  return result
}
