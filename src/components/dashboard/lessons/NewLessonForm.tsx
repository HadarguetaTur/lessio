'use client'

import { useActionState } from 'react'
import type { NewLessonState } from '@/app/(dashboard)/lessons/new/actions'

const DURATION_OPTIONS = [
  { value: 30,  label: '30 דקות' },
  { value: 45,  label: '45 דקות' },
  { value: 60,  label: '60 דקות' },
  { value: 90,  label: '90 דקות' },
]

const todayStr = new Date().toISOString().substring(0, 10)

interface Props {
  students: { id: string; full_name: string }[]
  action: (prev: NewLessonState, formData: FormData) => Promise<NewLessonState>
  teachers?: { id: string; full_name: string }[]
  fixedTeacherId?: string
}

const initialState: NewLessonState = { error: null }

export function NewLessonForm({ students, action, teachers, fixedTeacherId }: Props) {
  const [state, formAction, pending] = useActionState(action, initialState)

  return (
    <form action={formAction} className="bg-white rounded-lg border border-gray-200 p-6 space-y-5">
      {state.error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
          {state.error}
        </div>
      )}

      {/* Teacher — hidden in teacher mode, select in admin mode */}
      {fixedTeacherId ? (
        <input type="hidden" name="teacher_id" value={fixedTeacherId} />
      ) : (
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
            {(teachers ?? []).map((t) => (
              <option key={t.id} value={t.id}>{t.full_name}</option>
            ))}
          </select>
        </div>
      )}

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
          <label htmlFor="date" className="block text-sm font-medium text-gray-700">
            תאריך <span className="text-red-500">*</span>
          </label>
          <input
            id="date"
            name="date"
            type="date"
            required
            min={todayStr}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
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

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {pending ? 'יוצר שיעור...' : 'יצירת שיעור'}
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
