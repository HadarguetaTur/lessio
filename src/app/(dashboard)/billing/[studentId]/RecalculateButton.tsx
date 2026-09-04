'use client'

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { recalculateStudentBilling } from '../actions'

interface Props {
  studentId: string
  billingMonth: string
}

export function RecalculateButton({ studentId, billingMonth }: Props) {
  const t = useTranslations('billing.detail')
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      // An approved record refuses recalculation — say so instead of looking
      // like the button did nothing (UX audit 8, F-H1).
      const result = await recalculateStudentBilling(studentId, billingMonth)
      if (result?.error) toast.error(result.error)
      else toast.success(t('recalculated'))
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="px-3 py-1.5 text-xs font-medium text-foreground bg-muted border border-border rounded-md hover:bg-muted/80 transition-colors disabled:opacity-50"
    >
      {t('recalculate')}
    </button>
  )
}
