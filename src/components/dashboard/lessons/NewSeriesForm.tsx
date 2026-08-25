'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { createSeriesAction, type CreateSeriesState } from '@/app/(dashboard)/lessons/new-series/actions'

interface Props {
  teachers: { id: string; full_name: string }[]
  students: { id: string; full_name: string }[]
}

const initialState: CreateSeriesState = { error: null }

export function NewSeriesForm({ teachers, students }: Props) {
  const t = useTranslations('lessons')
  const tCommon = useTranslations('common')
  const [state, formAction, pending] = useActionState(createSeriesAction, initialState)

  const DAY_OPTIONS = [
    { value: 0, label: tCommon('days.sun') },
    { value: 1, label: tCommon('days.mon') },
    { value: 2, label: tCommon('days.tue') },
    { value: 3, label: tCommon('days.wed') },
    { value: 4, label: tCommon('days.thu') },
    { value: 5, label: tCommon('days.fri') },
    { value: 6, label: tCommon('days.sat') },
  ]

  const DURATION_OPTIONS = [
    { value: 30, label: tCommon('durations.30') },
    { value: 45, label: tCommon('durations.45') },
    { value: 60, label: tCommon('durations.60') },
    { value: 90, label: tCommon('durations.90') },
  ]

  if (state.result) {
    const { created, skipped, conflicts } = state.result
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-green-700 text-lg">✓</span>
          <h2 className="text-base font-semibold text-gray-900">{t('series.createdSummary')}</h2>
        </div>
        <p className="text-sm text-gray-700">
          {t('series.createdCount', { count: created })}
          {skipped > 0 && <> {t('series.skippedCount', { count: skipped })}</>}
        </p>
        {conflicts.length > 0 && (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
            <p className="font-medium mb-1">{t('series.skippedDatesTitle')}</p>
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
          {t('series.backToLessons')}
        </a>
      </div>
    )
  }

  return (
    <form action={formAction} className="bg-white rounded-lg border border-gray-200 p-6 space-y-5">
      {state.error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">
          {state.error}
        </div>
      )}

      <div className="space-y-1">
        <label htmlFor="teacher_id" className="block text-sm font-medium text-gray-700">
          {t('fields.teacher')} <span className="text-red-600">*</span>
        </label>
        <select
          id="teacher_id"
          name="teacher_id"
          required
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="">{t('selectTeacher')}</option>
          {teachers.map((teacher) => (
            <option key={teacher.id} value={teacher.id}>{teacher.full_name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label htmlFor="student_id" className="block text-sm font-medium text-gray-700">
          {t('fields.student')} <span className="text-red-600">*</span>
        </label>
        <select
          id="student_id"
          name="student_id"
          required
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="">{t('selectStudent')}</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>{s.full_name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="day_of_week" className="block text-sm font-medium text-gray-700">
            {t('fields.dayOfWeek')} <span className="text-red-600">*</span>
          </label>
          <select
            id="day_of_week"
            name="day_of_week"
            required
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="">{t('selectDay')}</option>
            {DAY_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="start_time" className="block text-sm font-medium text-gray-700">
            {t('fields.time')} <span className="text-red-600">*</span>
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
            {t('fields.duration')} <span className="text-red-600">*</span>
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
            {t('frequency')} <span className="text-red-600">*</span>
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
              {t('weekly')}
            </label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="radio"
                name="frequency"
                value="biweekly"
                className="text-blue-600 focus:ring-blue-400"
              />
              {t('biweekly')}
            </label>
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="until" className="block text-sm font-medium text-gray-700">
          {t('until')} <span className="text-red-600">*</span>
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
          {pending ? t('series.creating') : t('series.createButton')}
        </button>
        <a
          href="/lessons"
          className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
        >
          {tCommon('actions.cancel')}
        </a>
      </div>
    </form>
  )
}
