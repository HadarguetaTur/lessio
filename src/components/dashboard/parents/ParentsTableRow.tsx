'use client'

import type { KeyboardEvent, MouseEvent } from 'react'
import { useTranslations } from 'next-intl'
import { BellOff, ShieldQuestion } from 'lucide-react'
import { UserAvatar } from '@/components/ui/user-avatar'
import { TableRow, TableCell } from '@/components/ui/table'
import { ParentRowActions, TeacherParentNotesRowActions } from '@/components/dashboard/parents/ParentSheet'
import { cn } from '@/lib/utils'
import type { Parent } from '@/lib/parents'

type ActionState = { error: string } | null
type FormAction = (prevState: ActionState, formData: FormData) => Promise<ActionState>
type VoidAction = () => Promise<void>
type PaymentAction = (parentId: string) => Promise<{ error: string | null }>

const IGNORE_SELECTOR = '[data-parent-row-ignore-click]'

interface ParentsTableRowProps {
  parent: Parent
  isTeacher: boolean
  canSendPaymentRequest: boolean
  statusActiveLabel: string
  statusInactiveLabel: string
  updateAction: FormAction
  archiveAction: VoidAction
  restoreAction: VoidAction
  paymentAction: PaymentAction
  onRowClick?: (parent: Parent) => void
}

export function ParentsTableRow({
  parent,
  isTeacher,
  canSendPaymentRequest,
  statusActiveLabel,
  statusInactiveLabel,
  updateAction,
  archiveAction,
  restoreAction,
  paymentAction,
  onRowClick,
}: ParentsTableRowProps) {
  const t = useTranslations('parents')

  function openDetail() {
    if (isTeacher) return
    onRowClick?.(parent)
  }

  function handleRowClick(e: MouseEvent<HTMLTableRowElement>) {
    if (isTeacher) return
    if ((e.target as HTMLElement).closest(IGNORE_SELECTOR)) return
    openDetail()
  }

  function handleRowKeyDown(e: KeyboardEvent<HTMLTableRowElement>) {
    if (isTeacher) return
    if (e.key !== 'Enter' && e.key !== ' ') return
    if ((e.target as HTMLElement).closest(IGNORE_SELECTOR)) return
    e.preventDefault()
    openDetail()
  }

  return (
    <TableRow
        onClick={handleRowClick}
        onKeyDown={handleRowKeyDown}
        tabIndex={isTeacher ? undefined : 0}
        aria-label={isTeacher ? undefined : t('openParentProfileAria', { name: parent.full_name })}
        className={cn(
          'hover:bg-muted/20',
          !isTeacher && 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        )}
      >
        <TableCell className="px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <UserAvatar name={parent.full_name} />
            <span className="text-sm font-medium text-foreground">{parent.full_name}</span>
          </div>
        </TableCell>
        <TableCell className="px-5 py-3.5 text-sm text-muted-foreground font-mono" dir="ltr">
          {parent.phone}
        </TableCell>
        <TableCell className="px-5 py-3.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
                parent.is_active
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-muted text-muted-foreground border-border',
              )}
            >
              {parent.is_active ? statusActiveLabel : statusInactiveLabel}
            </span>
            {parent.opted_out_at && (
              <span
                title={t('optedOutTooltip')}
                className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-400"
              >
                <BellOff size={11} className="shrink-0" />
                {t('optedOut')}
              </span>
            )}
            {!parent.opted_out_at && !parent.consented_at && (
              <span
                title={t('consent.missingTooltip')}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
              >
                <ShieldQuestion size={11} className="shrink-0" />
                {t('consent.missing')}
              </span>
            )}
          </div>
        </TableCell>
        <TableCell className="px-5 py-3.5" data-parent-row-ignore-click onClick={(e) => e.stopPropagation()}>
          {isTeacher ? (
            <TeacherParentNotesRowActions
              parent={{
                id: parent.id,
                full_name: parent.full_name,
                phone: parent.phone,
                email: parent.email,
                second_phone: parent.second_phone,
                address: parent.address,
                relation_type: parent.relation_type,
                notes: parent.notes,
              }}
            />
          ) : (
            <ParentRowActions
              parent={parent}
              updateAction={updateAction}
              archiveAction={archiveAction}
              restoreAction={restoreAction}
              paymentAction={paymentAction}
              canSendPaymentRequest={canSendPaymentRequest}
            />
          )}
        </TableCell>
      </TableRow>
  )
}
