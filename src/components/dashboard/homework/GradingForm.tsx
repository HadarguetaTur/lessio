'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import type { GradeActionState } from '@/app/(dashboard)/homework/[id]/actions'

type Props = {
  submissionId: string
  assignmentId: string
  action: (prev: GradeActionState, formData: FormData) => Promise<GradeActionState>
}

export function GradingForm({ submissionId, assignmentId, action }: Props) {
  const t = useTranslations('homework')
  const tCommon = useTranslations('common')
  const [state, formAction, isPending] = useActionState(action, { error: null })

  if (state.success) {
    return (
      <div className="text-sm text-green-700 bg-green-50 rounded p-2">
        {t('gradeSaved')}
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="submissionId" value={submissionId} />
      <input type="hidden" name="assignmentId" value={assignmentId} />

      <div className="flex items-center gap-2">
        <label htmlFor={`score-${submissionId}`} className="text-xs text-muted-foreground shrink-0 w-12">
          {t('grade')}
        </label>
        <input
          id={`score-${submissionId}`}
          name="score"
          type="number"
          min="0"
          max="100"
          required
          placeholder="0–100"
          className="w-20 border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <span className="text-xs text-muted-foreground">/ 100</span>
      </div>

      <div>
        <textarea
          name="feedback"
          rows={2}
          placeholder={t('feedbackPlaceholder')}
          className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {state.error && (
        <p className="text-xs text-red-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {isPending ? tCommon('actions.saving') : t('saveGrade')}
      </button>
    </form>
  )
}
