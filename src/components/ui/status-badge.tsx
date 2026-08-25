'use client'

import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

type StatusVariant = string

// Maps status DB values to translation key paths under 'common'
const STATUS_KEY_MAP: Record<string, string> = {
  // Lesson
  scheduled:   'status.scheduled',
  completed:   'status.completed',
  cancelled:   'status.cancelled',
  no_show:     'status.no_show',
  // Charge
  pending:     'chargeStatus.pending',
  invoiced:    'chargeStatus.invoiced',
  paid:        'chargeStatus.paid',
  waived:      'chargeStatus.waived',
  voided:      'chargeStatus.voided',
  // Homework
  done:        'homeworkStatus.done',
  overdue:     'homeworkStatus.overdue',
  // Lead
  new:         'leadStatus.new',
  in_progress: 'leadStatus.contacted',
  converted:   'leadStatus.converted',
  closed:      'leadStatus.closed',
  // Monthly billing
  approved:          'billingStatus.approved',
  pending_approval:  'billingStatus.pending_approval',
}

const STATUS_CLASS_MAP: Record<string, string> = {
  scheduled:   'bg-blue-50 text-blue-700 border-blue-200',
  completed:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled:   'bg-red-50 text-red-700 border-red-200',
  no_show:     'bg-amber-50 text-amber-700 border-amber-200',
  pending:     'bg-amber-50 text-amber-700 border-amber-200',
  invoiced:    'bg-blue-50 text-blue-700 border-blue-200',
  paid:        'bg-emerald-50 text-emerald-700 border-emerald-200',
  waived:      'bg-slate-100 text-slate-600 border-slate-200',
  voided:      'bg-slate-100 text-slate-600 border-slate-200 line-through',
  done:        'bg-emerald-50 text-emerald-700 border-emerald-200',
  overdue:     'bg-red-50 text-red-700 border-red-200',
  new:         'bg-purple-50 text-purple-700 border-purple-200',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-200',
  converted:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  closed:      'bg-gray-100 text-gray-600 border-gray-200',
  approved:         'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending_approval: 'bg-amber-50 text-amber-700 border-amber-200',
}

interface StatusBadgeProps {
  status: StatusVariant
  label?: string
  className?: string
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const tc = useTranslations('common')

  const translationKey = STATUS_KEY_MAP[status]
  const autoLabel = translationKey ? tc(translationKey as Parameters<typeof tc>[0]) : status
  const displayLabel = label ?? autoLabel
  const colorClass = STATUS_CLASS_MAP[status] ?? 'bg-gray-100 text-gray-600 border-gray-200'

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border',
        colorClass,
        className
      )}
    >
      {displayLabel}
    </span>
  )
}
