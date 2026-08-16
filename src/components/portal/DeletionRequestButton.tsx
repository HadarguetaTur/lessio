'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { DeletionRequestState } from '@/app/portal/[orgId]/home/actions'

interface Props {
  action: (prev: DeletionRequestState) => Promise<DeletionRequestState>
}

export function DeletionRequestButton({ action }: Props) {
  const t = useTranslations('portal.gdpr')
  const [showConfirm, setShowConfirm] = useState(false)
  const [state, formAction, isPending] = useActionState(action, { error: null })

  if (state.success) {
    return (
      <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-center">
        {t('success')}
      </p>
    )
  }

  if (!showConfirm) {
    return (
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        className="text-xs text-gray-400 hover:text-red-500 transition-colors underline underline-offset-2"
      >
        {t('requestDeletion')}
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
      <p className="text-sm font-medium text-red-800">{t('confirmTitle')}</p>
      <p className="text-xs text-red-700">{t('confirmBody')}</p>
      {state.error && (
        <p className="text-xs text-red-600">{t(state.error)}</p>
      )}
      <div className="flex gap-2">
        <form action={formAction} className="flex-1">
          <button
            type="submit"
            disabled={isPending}
            className="w-full py-2 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? t('submitting') : t('confirm')}
          </button>
        </form>
        <button
          type="button"
          onClick={() => setShowConfirm(false)}
          className="flex-1 py-2 text-xs font-medium border border-red-200 text-red-700 rounded-lg hover:bg-red-100 transition-colors"
        >
          {t('cancel')}
        </button>
      </div>
    </div>
  )
}
