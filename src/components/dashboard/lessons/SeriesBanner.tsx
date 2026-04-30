'use client'

import { Repeat } from 'lucide-react'
import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import type { CancelSeriesActionResult } from '@/app/(dashboard)/lessons/[id]/actions'

type FormAction = (
  prevState: CancelSeriesActionResult,
  formData: FormData
) => Promise<CancelSeriesActionResult>

interface Props {
  cancelSeriesAction: FormAction
}

const initialState: CancelSeriesActionResult = { error: null }

export function SeriesBanner({ cancelSeriesAction }: Props) {
  const t = useTranslations('lessons')
  const [state, formAction, pending] = useActionState(cancelSeriesAction, initialState)

  if (state.cancelled !== undefined && state.error === null) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-100 text-sm text-green-700 mb-4">
        <Repeat size={15} />
        {t('series.cancelledCount', { count: state.cancelled })}
      </div>
    )
  }

  return (
    <div className="p-3 rounded-lg bg-purple-50 border border-purple-100 text-sm text-purple-700 mb-4 space-y-2">
      <div className="flex items-center gap-2">
        <Repeat size={15} />
        <span>{t('series.partOfSeries')}</span>
      </div>

      {state.error && (
        <p className="text-red-600 text-xs">{state.error}</p>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <form action={formAction}>
          <input type="hidden" name="scope" value="from_date" />
          <button
            type="submit"
            disabled={pending}
            className="px-3 py-1 text-xs font-medium rounded border border-purple-300 hover:bg-purple-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {pending ? '...' : t('series.cancelFromHereButton')}
          </button>
        </form>

        <form action={formAction}>
          <input type="hidden" name="scope" value="all" />
          <button
            type="submit"
            disabled={pending}
            className="px-3 py-1 text-xs font-medium rounded border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {pending ? '...' : t('series.cancelAll')}
          </button>
        </form>
      </div>
    </div>
  )
}
