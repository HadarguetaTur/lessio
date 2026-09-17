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

/**
 * One palette for every status in the product, drawn from the diary's
 * materials: ruling blue for what is planned or in flight, cover teal for what
 * is done or paid, the highlighter for what is waiting on someone, the red pen
 * for what was cancelled or is overdue, ink grey for what no longer counts.
 */
export const STATUS_TONE = {
  planned: 'bg-[#eaf1f8] text-[#2c5580] border-[#c4d6e8]',
  done: 'bg-[#e3f1ef] text-[#0c4744] border-[#b5d8d3]',
  waiting: 'bg-[#fff6c2] text-[#4a3f00] border-[#f0dc6a]',
  problem: 'bg-[#fbe9ec] text-[#9b0c24] border-[#f1bcc5]',
  off: 'bg-muted text-muted-foreground border-border',
} as const

export const STATUS_CLASS_MAP: Record<string, string> = {
  scheduled:   STATUS_TONE.planned,
  completed:   STATUS_TONE.done,
  cancelled:   STATUS_TONE.problem,
  no_show:     STATUS_TONE.waiting,
  pending:     STATUS_TONE.waiting,
  invoiced:    STATUS_TONE.planned,
  paid:        STATUS_TONE.done,
  waived:      STATUS_TONE.off,
  voided:      `${STATUS_TONE.off} line-through`,
  done:        STATUS_TONE.done,
  overdue:     STATUS_TONE.problem,
  new:         STATUS_TONE.waiting,
  in_progress: STATUS_TONE.planned,
  converted:   STATUS_TONE.done,
  closed:      STATUS_TONE.off,
  approved:         STATUS_TONE.done,
  pending_approval: STATUS_TONE.waiting,
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
  const colorClass = STATUS_CLASS_MAP[status] ?? STATUS_TONE.off

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-semibold border',
        colorClass,
        className
      )}
    >
      {displayLabel}
    </span>
  )
}
