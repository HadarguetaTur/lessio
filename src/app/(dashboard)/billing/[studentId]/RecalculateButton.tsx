'use client'

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
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
      await recalculateStudentBilling(studentId, billingMonth)
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
