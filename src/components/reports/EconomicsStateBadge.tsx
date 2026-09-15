import { getTranslations } from 'next-intl/server'
import { cn } from '@/lib/utils'
import type { AttentionCounts, ConfirmationState } from '@/lib/teacher-economics/calculator'

const CLASS: Record<ConfirmationState, string> = {
  confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  estimated: 'bg-amber-50 text-amber-700 border-amber-200',
  missing_policy: 'bg-red-50 text-red-700 border-red-200',
}

interface Props {
  state: ConfirmationState
  attention?: AttentionCounts
  className?: string
}

/**
 * The per-teacher (or per-line) confirmation state, with the reason in the
 * tooltip so "estimated" is never a label the owner has to guess at.
 */
export async function EconomicsStateBadge({ state, attention, className }: Props) {
  const t = await getTranslations('reports.economics.stateBadge')
  const reasons: string[] = []
  if (attention) {
    if (attention.missingPolicy > 0) reasons.push(t('reasonMissingPolicy', { count: attention.missingPolicy }))
    if (attention.awaitingConfirmation > 0) reasons.push(t('reasonAwaitingConfirmation', { count: attention.awaitingConfirmation }))
    if (attention.unknownCancellation > 0) reasons.push(t('reasonUnknownCancellation', { count: attention.unknownCancellation }))
    if (attention.staffCancellation > 0) reasons.push(t('reasonStaffCancellation', { count: attention.staffCancellation }))
    if (attention.missingPrice > 0) reasons.push(t('reasonMissingPrice', { count: attention.missingPrice }))
    if (attention.noStudents > 0) reasons.push(t('reasonNoStudents', { count: attention.noStudents }))
  }
  const title = reasons.length > 0 ? reasons.join(' · ') : t(`hint.${state}`)
  return (
    <span
      title={title}
      className={cn('inline-flex cursor-help items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium', CLASS[state], className)}
    >
      {t(`label.${state}`)}
    </span>
  )
}
