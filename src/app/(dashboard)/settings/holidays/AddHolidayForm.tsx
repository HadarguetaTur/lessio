'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { addHoliday, addHolidayRange, type HolidayActionState } from './actions'

const initialState: HolidayActionState = null

export function AddHolidayForm() {
  const t = useTranslations('settings.holidays')
  const tCommon = useTranslations('common')
  const [isRange, setIsRange] = useState(false)

  const [singleState, singleAction, singlePending] = useActionState(addHoliday, initialState)
  const [rangeState, rangeAction, rangePending] = useActionState(addHolidayRange, initialState)

  const isPending = singlePending || rangePending
  const error = isRange ? rangeState?.error : singleState?.error

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-900">{t('addHoliday')}</h2>
        <div className="flex items-center gap-1 bg-gray-100 rounded-md p-0.5 text-xs font-medium">
          <button
            type="button"
            onClick={() => setIsRange(false)}
            className={`px-3 py-1.5 rounded transition-colors ${
              !isRange ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            תאריך בודד
          </button>
          <button
            type="button"
            onClick={() => setIsRange(true)}
            className={`px-3 py-1.5 rounded transition-colors ${
              isRange ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            טווח תאריכים
          </button>
        </div>
      </div>

      {!isRange ? (
        <form action={singleAction} className="flex flex-wrap gap-3 items-end">
          <div>
            <label htmlFor="date" className="block text-xs font-medium text-gray-700 mb-1">
              {t('fields.date')}
            </label>
            <input
              id="date"
              name="date"
              type="date"
              required
              className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1 min-w-40">
            <label htmlFor="name-single" className="block text-xs font-medium text-gray-700 mb-1">
              {t('fields.name')}
            </label>
            <input
              id="name-single"
              name="name"
              type="text"
              required
              maxLength={100}
              placeholder="לדוגמה: ראש השנה"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 rounded-md bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? `${tCommon('actions.save')}…` : tCommon('actions.add')}
          </button>
        </form>
      ) : (
        <form action={rangeAction} className="flex flex-wrap gap-3 items-end">
          <div>
            <label htmlFor="date_from" className="block text-xs font-medium text-gray-700 mb-1">
              מתאריך
            </label>
            <input
              id="date_from"
              name="date_from"
              type="date"
              required
              className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="date_to" className="block text-xs font-medium text-gray-700 mb-1">
              עד תאריך
            </label>
            <input
              id="date_to"
              name="date_to"
              type="date"
              required
              className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1 min-w-40">
            <label htmlFor="name-range" className="block text-xs font-medium text-gray-700 mb-1">
              {t('fields.name')}
            </label>
            <input
              id="name-range"
              name="name"
              type="text"
              required
              maxLength={100}
              placeholder="לדוגמה: חופשת קיץ"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 rounded-md bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? `${tCommon('actions.save')}…` : tCommon('actions.add')}
          </button>
        </form>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  )
}
