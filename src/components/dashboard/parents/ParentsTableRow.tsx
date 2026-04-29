'use client'

import { useRouter } from 'next/navigation'
import type { KeyboardEvent, MouseEvent } from 'react'
import { useTranslations } from 'next-intl'
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
}: ParentsTableRowProps) {
  const router = useRouter()
  const t = useTranslations('parents')

  function goToProfile() {
    if (isTeacher) return
    router.push(`/parents/${parent.id}/edit`)
  }

  function handleRowClick(e: MouseEvent<HTMLTableRowElement>) {
    if (isTeacher) return
    if ((e.target as HTMLElement).closest(IGNORE_SELECTOR)) return
    goToProfile()
  }

  function handleRowKeyDown(e: KeyboardEvent<HTMLTableRowElement>) {
    if (isTeacher) return
    if (e.key !== 'Enter' && e.key !== ' ') return
    if ((e.target as HTMLElement).closest(IGNORE_SELECTOR)) return
    e.preventDefault()
    goToProfile()
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
        </TableCell>
        <TableCell className="px-5 py-3.5" data-parent-row-ignore-click onClick={(e) => e.stopPropagation()}>
          {isTeacher ? (
            <TeacherParentNotesRowActions
              parent={{
                id: parent.id,
                full_name: parent.full_name,
                phone: parent.phone,
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
