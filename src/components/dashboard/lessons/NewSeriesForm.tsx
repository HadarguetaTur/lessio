'use client'

import { useActionState } from 'react'
import { createSeriesAction, type CreateSeriesState } from '@/app/(dashboard)/lessons/new-series/actions'

const DAY_OPTIONS = [
  { value: 0, label: 'ראשון' },
  { value: 1, label: 'שני' },
  { value: 2, label: 'שלישי' },
  { value: 3, label: 'רביעי' },
  { value: 4, label: 'חמישי' },
  { value: 5, label: 'שישי' },
  { value: 6, label: 'שבת' },
]

const DURATION_OPTIONS = [
  { value: 30, label: '30 דקות' },
  { value: 45, label: '45 דקות' },
  { value: 60, label: '60 דקות' },
  { value: 90, label: '90 דקות' },
]

interface Props {
  teachers: { id: string; full_name: string }[]
  students: { id: string; full_name: string }[]
}

const initialState: CreateSeriesState = { error: null }

export function NewSeriesForm({ teachers, students }: Props) {
  const [state, formAction, pending] = useActionState(createSeriesAction, initialState)

  if (state.result) {
    const { created, skipped, conflicts } = state.result
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-green-600 text-lg">✓</span>
          <h2 className="text-base font-semibold text-gray-900">הסדרה נוצרה בהצלחה</h2>
        </div>
        <p className="text-sm text-gray-700">
          נוצרו <strong>{created}</strong> שיעורים.
          {skipped > 0 && <> דולגו <strong>{skipped}</strong> תאריכים.</>}
        </p>
        {conflicts.length > 0 && (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
            <p className="font-medium mb-1">תאריכים שדולגו (חג או חפיפה):</p>
            <ul className="list-disc list-inside space-y-0.5">
              {conflicts.map((d) => (
                <li key={d} dir="ltr">{d}</li>
              ))}
            </ul>
          </div>
        )}
        <a
          href="/lessons"
          className="inline-block mt-2 text-sm text-blue-600 hover:underline"
        >
          ← חזרה ללוח שיעורים
        </a>
      </div>
    )
  }

  return (
    <form action={formAction} className="bg-white rounded-lg border border-gray-200 p-6 space-y-5">
      {state.error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
          {state.error}
        </div>
      )}

      <div className="space-y-1">
        <label htmlFor="teacher_id" className="block text-sm font-medium text-gray-700">
          מורה <span className="text-red-500">*</span>
        </label>
        <select
          id="teacher_id"
          name="teacher_id"
          required
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="">בחר מורה...</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>{t.full_name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label htmlFor="student_id" className="block text-sm font-medium text-gray-700">
          תלמיד <span className="text-red-500">*</span>
        </label>
        <select
          id="student_id"
          name="student_id"
          required
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="">בחר תלמיד...</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>{s.full_name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="day_of_week" className="block text-sm font-medium text-gray-700">
            יום בשבוע <span className="text-red-500">*</span>
          </label>
          <select
            id="day_of_week"
            name="day_of_week"
            required
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="">בחר יום...</option>
            {DAY_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="start_time" className="block text-sm font-medium text-gray-700">
            שעת התחלה <span className="text-red-500">*</span>
          </label>
          <input
            id="start_time"
            name="start_time"
            type="time"
            required
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="duration_minutes" className="block text-sm font-medium text-gray-700">
            משך <span className="text-red-500">*</span>
          </label>
          <select
            id="duration_minutes"
            name="duration_minutes"
            required
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {DURATION_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">
            תדירות <span className="text-red-500">*</span>
          </label>
          <div className="flex items-center gap-4 pt-2">
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="radio"
                name="frequency"
                value="weekly"
                defaultChecked
                className="text-blue-600 focus:ring-blue-400"
              />
              שבועי
            </label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="radio"
                name="frequency"
                value="biweekly"
                className="text-blue-600 focus:ring-blue-400"
              />
              דו-שבועי
            </label>
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="until" className="block text-sm font-medium text-gray-700">
          עד תאריך <span className="text-red-500">*</span>
        </label>
        <input
          id="until"
          name="until"
          type="date"
          required
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {pending ? 'יוצר שיעורים...' : 'יצירת סדרה'}
        </button>
        <a
          href="/lessons"
          className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
        >
          ביטול
        </a>
      </div>
    </form>
  )
}
